const { Pool } = require("pg");
const crypto = require("crypto");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set in environment");
}

const pool = new Pool({
  connectionString,
});

module.exports = {
  // Expose the original query method for direct use
  query: (text, params) => pool.query(text, params),
  // Expose the pool for transaction management
  pool,

  // Helper to get a single row
  async get(text, params) {
    const res = await pool.query(text, params);
    return res.rows[0];
  },

  // Helper for settings
  async getSetting(key, fallbackValue) {
    const row = await this.get("SELECT value FROM admin_settings WHERE key = $1", [key]);
    return row ? row.value : fallbackValue;
  },

  async getIntSetting(key, fallbackValue) {
    const raw = await this.getSetting(key, String(fallbackValue));
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallbackValue;
  },

  async setSetting(key, value) {
    await this.query(
      `INSERT INTO admin_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, value]
    );
  },
  
  // Fraud prevention
  async logUserSession(userId, ipAddress, userAgent) {
    try {
      const deviceHash = userAgent ? crypto.createHash('sha256').update(userAgent).digest('hex') : null;
      await this.query(
        `INSERT INTO user_sessions (user_id, ip_address, device_hash) VALUES ($1, $2, $3)`,
        [userId, ipAddress, deviceHash]
      );
    } catch (error) {
      console.error("Error logging user session:", error);
      // Non-critical, so we don't re-throw
    }
  },

  // Core coin functions that require a transaction client
  async creditCoins(client, userId, amount, reason, metadata = null) {
    await client.query(`INSERT INTO wallet (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING`, [userId]);
    await client.query(`UPDATE wallet SET balance = balance + $1, last_updated = NOW() WHERE user_id = $2`, [amount, userId]);
    await client.query(`INSERT INTO coin_transactions (user_id, amount, tx_type, reason, metadata) VALUES ($1, $2, 'credit', $3, $4)`, [userId, amount, reason, metadata ? JSON.stringify(metadata) : null]);
    if (amount > 0) {
      await client.query(
        `INSERT INTO leaderboard (user_id, coins_earned) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET coins_earned = leaderboard.coins_earned + $2`,
        [userId, amount]
      );
    }
  },

  async spendCoins(client, userId, amount, reason, metadata = null) {
    const walletRes = await client.query("SELECT balance FROM wallet WHERE user_id = $1 FOR UPDATE", [userId]);
    const balance = Number(walletRes.rows[0]?.balance || 0);

    if (balance < amount) {
      const error = new Error("Insufficient balance");
      error.name = "InsufficientBalanceError";
      throw error;
    }
    await client.query(`UPDATE wallet SET balance = balance - $1, last_updated = NOW() WHERE user_id = $2`, [amount, userId]);
    await client.query(`INSERT INTO coin_transactions (user_id, amount, tx_type, reason, metadata) VALUES ($1, $2, 'debit', $3, $4)`, [userId, -amount, reason, metadata ? JSON.stringify(metadata) : null]);
    
    const newBalance = balance - amount;
    return { success: true, newBalance };
  },

  // Business logic functions that manage their own transactions
  async handleDailyClaim(userId) {
    const lastClaim = await this.get("SELECT claimed_at FROM daily_rewards WHERE user_id = $1 ORDER BY claimed_at DESC LIMIT 1", [userId]);

    if (lastClaim && lastClaim.claimed_at) {
      const lastClaimDate = new Date(lastClaim.claimed_at);
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const timeSinceLastClaim = Date.now() - lastClaimDate.getTime();

      if (timeSinceLastClaim < twentyFourHours) {
        const timeLeftMs = twentyFourHours - timeSinceLastClaim;
        const error = new Error("You have already claimed your daily reward recently.");
        error.name = "ClaimTooSoonError";
        error.timeLeftMs = timeLeftMs;
        throw error;
      }
    }

    const rewardAmount = await this.getIntSetting("daily_claim_reward", 10);
    if (rewardAmount <= 0) {
      return { success: true, amount: 0, message: "No daily reward is configured." };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO daily_rewards (user_id, reward_amount, claimed_at) VALUES ($1, $2, NOW())`, [userId, rewardAmount]);
      await this.creditCoins(client, userId, rewardAmount, "daily_claim");
      await client.query("COMMIT");

      const wallet = await this.get(`SELECT balance FROM wallet WHERE user_id = $1`, [userId]);
      return {
        success: true,
        amount: rewardAmount,
        newBalance: wallet ? Number(wallet.balance) : rewardAmount,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },

  // Legacy ad-claim logic is now repurposed for activity-based rewards.
  // The ad_rewards table is used as a generic engagement log; no ads are required.
  async handleActivityReward(userId, activityKey) {
    const maxClaimsPerDay = await this.getIntSetting("max_activity_rewards_per_day", 20);
    const rewardAmount = await this.getIntSetting("activity_reward_amount", 5);

    const todayClaims = await this.get(
      "SELECT COUNT(*)::INT as count FROM ad_rewards WHERE user_id = $1 AND claimed_at >= current_date",
      [userId]
    );

    const claimsSoFar = todayClaims ? todayClaims.count : 0;

    if (claimsSoFar >= maxClaimsPerDay) {
      const error = new Error("You have reached the daily limit for activity rewards.");
      error.name = "ActivityDailyLimitError";
      error.claimsMade = claimsSoFar;
      error.limit = maxClaimsPerDay;
      throw error;
    }

    // Simple cooldown to discourage rapid tab refreshes.
    const last = await this.get(
      "SELECT claimed_at FROM ad_rewards WHERE user_id = $1 ORDER BY claimed_at DESC LIMIT 1",
      [userId]
    );
    if (last && last.claimed_at) {
      const lastMs = new Date(last.claimed_at).getTime();
      const diff = Date.now() - lastMs;
      const minIntervalMs = 30 * 1000;
      if (diff < minIntervalMs) {
        const error = new Error("You must stay active a bit longer before earning another activity reward.");
        error.name = "ActivityCooldownError";
        error.timeLeftMs = minIntervalMs - diff;
        throw error;
      }
    }

    if (rewardAmount <= 0) {
      return {
        success: true,
        amount: 0,
        message: "No activity reward is currently configured.",
        remaining: maxClaimsPerDay - claimsSoFar,
      };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO ad_rewards (user_id, reward_amount, ad_provider, claimed_at)
         VALUES ($1, $2, $3, NOW())`,
        [userId, rewardAmount, activityKey || "activity"]
      );
      await this.creditCoins(client, userId, rewardAmount, "activity_reward", { activityKey });
      await client.query("COMMIT");

      const wallet = await this.get(`SELECT balance FROM wallet WHERE user_id = $1`, [userId]);
      return {
        success: true,
        amount: rewardAmount,
        newBalance: wallet ? Number(wallet.balance) : rewardAmount,
        remaining: maxClaimsPerDay - (claimsSoFar + 1),
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};
