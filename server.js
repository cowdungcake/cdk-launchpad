require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { ethers } = require("ethers");
const db = require("./db");
const crypto = require("crypto");

const app = express();
const tokenPageViews = new Map();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(express.static('frontend'));
app.set('trust proxy', 1); // Trust first proxy for IP logging

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

function generateReferralCode() {
  return uuidv4().split("-")[0].toUpperCase();
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Missing Authorization header" });

  const [, token] = header.split(" ");
  if (!token) return res.status(401).json({ error: "Invalid Authorization header" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await db.get("SELECT id, is_admin FROM users WHERE id = $1", [payload.sub]);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
}

// all admin prefixed routes should go through authentication and admin check
app.use('/api/admin', authMiddleware, requireAdmin);


// Auth routes
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { email, password, referral } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existing = await db.get("SELECT id FROM users WHERE email = $1", [email]);
    if (existing) { // Note: .get returns a single row or undefined
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const referralCode = generateReferralCode();

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");

      let referrerId = null;
      if (referral) {
        const referrer = await db.get("SELECT id FROM users WHERE referral_code = $1", [referral]);
        if (referrer) {
          referrerId = referrer.id;
        }
      }

      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, referral_code, referred_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, passwordHash, referralCode, referrerId]
      );
      const userId = userRes.rows[0].id;

      const signupReward = await db.getIntSetting("signup_reward", 100);
      if (signupReward > 0) {
        await db.creditCoins(client, userId, signupReward, "signup_reward");
      }

      if (referrerId) {
        const referrerBonus = await db.getIntSetting("referrer_signup_bonus", 50);
        if (referrerBonus > 0) {
          await db.creditCoins(client, referrerId, referrerBonus, "referral_bonus", { referred_user_id: userId });
        }
        await client.query("INSERT INTO referrals (referrer_user_id, referred_user_id, reward_given) VALUES ($1, $2, $3)", [referrerId, userId, true]);
        
      }

      // Atomically get the new balance within the same transaction
      const wallet = await client.query("SELECT balance FROM wallet WHERE user_id = $1", [userId]);
      await client.query("COMMIT");

      const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });

      return res.status(201).json({
        token,
        user: {
          id: userId,
          email,
          referralCode,
          rewardBalance: wallet.rows[0] ? Number(wallet.rows[0].balance) : 0,
          is_admin: false,
          // The following are 0 on registration, they are fetched on login
          referralCount: 0,
          tokensLaunched: 0,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Register error", err);
      if (err.code === "23505") { // Unique violation
        return res.status(409).json({ error: "Email already registered" });
      }
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Register error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const userRes = await db.query(
      `SELECT u.id, u.password_hash, u.is_admin, u.referral_code, w.balance as reward_balance
       FROM users u
       LEFT JOIN wallet w ON u.id = w.user_id
       WHERE u.email = $1`,
      [email]
    );
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = userRes.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);
    
    // Log session for fraud prevention
    await db.logUserSession(user.id, req.ip, req.headers['user-agent']);

    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });

    const referralCountRes = await db.query('SELECT COUNT(*) FROM referrals WHERE referrer_user_id = $1', [user.id]);
    const tokensLaunchedRes = await db.query('SELECT COUNT(*) FROM token_launches WHERE user_id = $1', [user.id]);

    return res.json({
      token,
      user: {
        id: user.id,
        email,
        referralCode: user.referral_code,
        rewardBalance: Number(user.reward_balance || 0),
        is_admin: user.is_admin,
        referralCount: parseInt(referralCountRes.rows[0].count, 10),
        tokensLaunched: parseInt(tokensLaunchedRes.rows[0].count, 10),
      },
    });
  } catch (err) {
    console.error("Login error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Daily reward (web mining style)
app.post("/api/rewards/daily-claim", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await db.handleDailyClaim(userId);
    res.json({
      message: `Successfully claimed ${result.amount} coins!`,
      ...result,
    });
  } catch (error) {
    if (error.name === "ClaimTooSoonError") {
      const hours = Math.floor(error.timeLeftMs / 3600000);
      const minutes = Math.floor((error.timeLeftMs % 3600000) / 60000);
      return res.status(429).json({
        error: error.message,
        message: `Please wait approximately ${hours}h and ${minutes}m before claiming again.`,
        timeLeftMs: error.timeLeftMs,
      });
    }
    console.error("Daily claim error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Activity reward (engagement-based, not tied to ads)
app.post("/api/activity-reward", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { activityKey } = req.body || {};
    const key =
      typeof activityKey === "string" && activityKey.trim()
        ? activityKey.trim().toLowerCase()
        : "activity";

    const allowedKeys = new Set([
      "explore",
      "trending",
      "token_detail",
      "leaderboard",
      "dashboard",
      "activity",
    ]);
    if (!allowedKeys.has(key)) {
      return res.status(400).json({ error: "Invalid activity key" });
    }

    const result = await db.handleActivityReward(userId, key);
    return res.json({
      message: `You earned ${result.amount} coins for being active on the platform.`,
      ...result,
    });
  } catch (error) {
    if (error.name === "ActivityDailyLimitError") {
      return res.status(429).json({
        error: error.message,
        message: `You have earned the maximum number of activity rewards for today.`,
        remaining: 0,
      });
    }
    if (error.name === "ActivityCooldownError") {
      return res.status(429).json({
        error: error.message,
        timeLeftMs: error.timeLeftMs,
      });
    }
    console.error("Activity reward error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Spend coins on utilities like promotion, ad removal, profile boost
app.post("/api/coins/spend", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { purpose, amount } = req.body; // Use 'amount' for flexibility

    const cost = amount || (await db.getIntSetting(`utility_${purpose}_coins`));

    if (!cost) {
      return res.status(400).json({ error: "Invalid purpose" });
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await db.spendCoins(client, userId, cost, purpose);
      await client.query("COMMIT");
      return res.json(result);
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.name === "InsufficientBalanceError") {
        return res.status(400).json({ error: e.message });
      }
      console.error("Coin spend error", e);
      return res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Token launch integration (uses existing MemeLaunchpad contract; does not modify it)
app.post("/api/tokens/launch", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, symbol, supply, taxPercentage } = req.body;

    if (!name || !symbol || !supply) {
      return res.status(400).json({ error: "Missing token parameters" });
    }

    const rpcUrl = process.env.BSC_RPC_URL;
    const contractAddress = process.env.LAUNCHPAD_CONTRACT_ADDRESS;
    const privateKey = process.env.LAUNCHPAD_DEPLOYER_PRIVATE_KEY;

    if (!rpcUrl || !contractAddress || !privateKey) {
      return res.status(500).json({ error: "Launchpad configuration missing" });
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    const launchpadAbi = [
      "function launchFeeWei() view returns (uint256)",
      "function launchToken(string _name,string _symbol,uint256 _supply,uint256 _taxPercentage) external payable returns (address)",
      "event TokenLaunched(address indexed creator,address indexed token,string name,string symbol,uint256 supply,uint256 taxPercentage,address taxWallet,uint256 feePaidWei)",
    ];

    const launchpad = new ethers.Contract(contractAddress, launchpadAbi, signer);
    const fee = await launchpad.launchFeeWei();

    const tx = await launchpad.launchToken(name, symbol, supply, taxPercentage ?? 0, { value: fee });
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return launchpad.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e && e.name === "TokenLaunched");

    const tokenAddress = event ? event.args.token : null;

    await db.query(
      `INSERT INTO token_launches (user_id, token_name, token_symbol, contract_address, chain, fee_paid)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, name, symbol, tokenAddress || "unknown", "bsc", fee.toString()]
    );

    return res.json({ tokenAddress, txHash: receipt.hash });
  } catch (err) {
    console.error("Token launch error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get all tokens launched by the authenticated user
app.get("/api/tokens/mine", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const tokens = await db.query(
      `SELECT id, token_name, token_symbol, contract_address, chain, fee_paid, created_at
       FROM token_launches
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.json({ tokens: tokens.rows });
  } catch (err) {
    console.error("Get user tokens error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Public recent token launches feed (latest 10)
app.get("/api/tokens/recent", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT
         tl.id,
         tl.token_name,
         tl.token_symbol,
         tl.contract_address,
         tl.created_at,
         u.wallet_address AS creator_wallet,
         u.email AS creator_email
       FROM token_launches tl
       JOIN users u ON tl.user_id = u.id
       ORDER BY tl.created_at DESC
       LIMIT 10`
    );

    const tokens = result.rows.map((row) => {
      const address = (row.contract_address || "").toLowerCase();
      return {
        ...row,
        views: tokenPageViews.get(address) || 0,
      };
    });

    return res.json({ tokens });
  } catch (err) {
    console.error("Get recent tokens error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Public token details by contract address
app.get("/api/tokens/details/:address", async (req, res) => {
  try {
    const address = String(req.params.address || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid token address" });
    }

    const result = await db.query(
      `SELECT
         tl.id,
         tl.token_name,
         tl.token_symbol,
         tl.contract_address,
         tl.created_at,
         u.wallet_address AS creator_wallet,
         u.email AS creator_email
       FROM token_launches tl
       JOIN users u ON tl.user_id = u.id
       WHERE LOWER(tl.contract_address) = $1
       ORDER BY tl.created_at DESC
       LIMIT 1`,
      [address]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Token not found" });
    }

    const token = result.rows[0];
    const views = tokenPageViews.get(address) || 0;
    return res.json({ token: { ...token, views } });
  } catch (err) {
    console.error("Get token details error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Public token view counter increment (in-memory, resets on server restart)
app.post("/api/tokens/:address/view", async (req, res) => {
  try {
    const address = String(req.params.address || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ error: "Invalid token address" });
    }

    const next = (tokenPageViews.get(address) || 0) + 1;
    tokenPageViews.set(address, next);
    return res.json({ views: next });
  } catch (err) {
    console.error("Token view increment error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Promotion purchase (record only; payment handled via crypto tx or off-chain)
app.post("/api/promotions", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { tokenContract, promotionType, startDate, endDate, paymentTx } = req.body;

    if (!tokenContract || !promotionType || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing promotion parameters" });
    }

    await db.query(
      `INSERT INTO promotions (user_id, token_contract, promotion_type, start_date, end_date, payment_tx)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, tokenContract, promotionType, startDate, endDate, paymentTx || null]
    );

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Promotion error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// New leaderboard endpoint
app.get('/api/leaderboard', async (req, res) => {
  try {
    const referrersQuery = `
      SELECT
        u.id,
        u.email,
        COUNT(r.referred_user_id) AS referral_count
      FROM users u
      LEFT JOIN referrals r ON u.id = r.referrer_user_id
      GROUP BY u.id
      ORDER BY referral_count DESC
      LIMIT 10;
    `;

    const earnersQuery = `
      SELECT
        u.id,
        u.email,
        COALESCE(SUM(ct.amount), 0) AS coins_earned
      FROM users u
      LEFT JOIN coin_transactions ct ON u.id = ct.user_id
      GROUP BY u.id
      ORDER BY coins_earned DESC
      LIMIT 10;
    `;

    const [referrers, earners] = await Promise.all([
      db.query(referrersQuery),
      db.query(earnersQuery)
    ]);

    res.json({
      topReferrers: referrers.rows,
      topEarners: earners.rows
    });
  } catch (err) {
    console.error("Leaderboard error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Admin dashboard 
app.get("/api/admin/metrics", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const [totalUsers, totalCoinsDistributed, totalReferrals, totalTokensLaunched] = await Promise.all([
      db.query("SELECT COUNT(*)::INT AS count FROM users"),
      db.query("SELECT COALESCE(SUM(amount), 0)::BIGINT AS sum FROM coin_transactions"),
      db.query("SELECT COUNT(*)::INT AS count FROM referrals"),
      db.query("SELECT COUNT(*)::INT AS count FROM token_launches"),
    ]);

    return res.json({
      totalUsers: totalUsers.rows[0].count,
      totalCoinsDistributed: totalCoinsDistributed.rows[0].sum,
      totalReferrals: totalReferrals.rows[0].count,
      totalTokensLaunched: totalTokensLaunched.rows[0].count,
    });
  } catch (err) {
    console.error("Admin metrics error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/admin/users", authMiddleware, requireAdmin, async (_req, res) => {
    try {
        const users = await db.query(`
            SELECT u.id, u.email, w.balance as coins, COUNT(r.referred_user_id) as referrals, u.is_admin, u.created_at
            FROM users u
            LEFT JOIN wallet w ON u.id = w.user_id
            LEFT JOIN referrals r ON u.id = r.referrer_user_id
            GROUP BY u.id, w.balance
            ORDER BY u.id
        `);
        res.json(users.rows);
    } catch (err) {
        console.error("Admin get users error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/admin/users/:id/make-admin", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        await db.query("UPDATE users SET is_admin = true WHERE id = $1", [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error("Admin make admin error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/admin/users/:id/remove-admin", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        await db.query("UPDATE users SET is_admin = false WHERE id = $1", [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error("Admin remove admin error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/admin/users/:id/ban", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        // This is a soft ban, you might want to implement a more robust banning mechanism
        await db.query("UPDATE users SET is_banned = true WHERE id = $1", [userId]);
        res.json({ success: true });
    } catch (err) {
        console.error("Admin ban user error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/admin/adjust-coins", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { userId, amount } = req.body;
        if (!userId || !amount) {
            return res.status(400).json({ error: "userId and amount are required" });
        }

        const client = await db.pool.connect();
        try {
            await client.query("BEGIN");
            if (amount > 0) {
                await db.creditCoins(client, userId, amount, "admin_credit");
            } else {
                await db.spendCoins(client, userId, -amount, "admin_debit");
            }
            await client.query("COMMIT");
            res.json({ success: true });
        } catch (e) {
            await client.query("ROLLBACK");
            if (e.name === "InsufficientBalanceError") {
                return res.status(400).json({ error: e.message });
            }
            console.error("Coin adjustment error", e);
            return res.status(500).json({ error: "Internal server error" });
        } finally {
            client.release();
        }
    } catch (err) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/admin/tokens", authMiddleware, requireAdmin, async (_req, res) => {
    try {
        const tokens = await db.query(`
            SELECT tl.id, tl.token_name, tl.token_symbol, u.email as creator, tl.created_at as launch_date, tl.contract_address
            FROM token_launches tl
            JOIN users u ON tl.user_id = u.id
            ORDER BY tl.created_at DESC
        `);
        res.json(tokens.rows);
    } catch (err) {
        console.error("Admin get tokens error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/admin/tokens/:id/highlight", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const tokenId = req.params.id;
        await db.query("UPDATE token_launches SET is_highlighted = true WHERE id = $1", [tokenId]);
        res.json({ success: true });
    } catch (err) {
        console.error("Admin highlight token error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/admin/tokens/:id/hide", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const tokenId = req.params.id;
        await db.query("UPDATE token_launches SET is_hidden = true WHERE id = $1", [tokenId]);
        res.json({ success: true });
    } catch (err) {
        console.error("Admin hide token error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/admin/settings", authMiddleware, requireAdmin, async (_req, res) => {
    try {
        const settings = await db.query("SELECT key, value FROM admin_settings");
        const settingsObj = settings.rows.reduce((obj, item) => {
            obj[item.key] = item.value;
            return obj;
        }, {});
        res.json(settingsObj);
    } catch (err) {
        console.error("Admin get settings error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.post("/api/admin/settings", authMiddleware, requireAdmin, async (req, res) => {
    try {
        const settings = req.body;
        for (const key in settings) {
            await db.setSetting(key, settings[key]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Admin update settings error", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/admin/ad-analytics", authMiddleware, requireAdmin, async (_req, res) => {
    // #region agent log
    globalThis.fetch &&
      fetch("http://127.0.0.1:7468/ingest/1fe505a8-953b-40e8-a28e-d0fdd5e40a6d", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "45a279" },
        body: JSON.stringify({
          sessionId: "45a279",
          runId: "pre-fix",
          hypothesisId: "ad-analytics-entry",
          location: "server.js:/api/admin/ad-analytics",
          message: "Ad analytics route hit",
          data: {},
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    // #endregion
    try {
        const [adsTodayRes, totalAdsRes] = await Promise.all([
            db.query("SELECT COUNT(*)::INT AS count FROM ad_rewards WHERE claimed_at >= CURRENT_DATE"),
            db.query("SELECT COUNT(*)::INT AS count FROM ad_rewards"),
        ]);

        const adsToday = adsTodayRes.rows[0].count;
        const totalAds = totalAdsRes.rows[0].count;
        const estimatedRevenue = totalAds * 0.01; // $0.01 per ad viewed

        return res.json({
            adsToday,
            totalAds,
            estimatedRevenue,
        });
    } catch (err) {
        console.error("Admin ad analytics error", err);
        // #region agent log
        globalThis.fetch &&
          fetch("http://127.0.0.1:7468/ingest/1fe505a8-953b-40e8-a28e-d0fdd5e40a6d", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "45a279" },
            body: JSON.stringify({
              sessionId: "45a279",
              runId: "pre-fix",
              hypothesisId: "ad-analytics-error",
              location: "server.js:/api/admin/ad-analytics",
              message: "Ad analytics error",
              data: { errorName: err.name, errorMessage: err.message },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
        // #endregion
        return res.status(500).json({ error: "Internal server error" });
    }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
  // #region agent log
  globalThis.fetch &&
    fetch("http://127.0.0.1:7468/ingest/1fe505a8-953b-40e8-a28e-d0fdd5e40a6d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "45a279" },
      body: JSON.stringify({
        sessionId: "45a279",
        runId: "pre-fix",
        hypothesisId: "server-start",
        location: "server.js:listen",
        message: "Server listening",
        data: { port },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  // #endregion
});
