-- Users table with referral and wallet tracking
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    referral_code VARCHAR(36) UNIQUE NOT NULL,
    referred_by INTEGER REFERENCES users(id) NULL,
    wallet_address VARCHAR(42) NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Wallet for internal reward coins (e.g., LaunchCoin)
CREATE TABLE IF NOT EXISTS wallet (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Record of all coin transactions (credits and debits)
CREATE TABLE IF NOT EXISTS coin_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    tx_type VARCHAR(10) NOT NULL, -- 'credit' or 'debit'
    reason VARCHAR(50) NOT NULL, -- e.g., 'daily_claim', 'ad_reward', 'signup_reward', 'referral_bonus'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Referral program tracking
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer_user_id INTEGER NOT NULL REFERENCES users(id),
    referred_user_id INTEGER NOT NULL REFERENCES users(id),
    reward_given BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily reward claims (Pi-style "mining")
CREATE TABLE IF NOT EXISTS daily_rewards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    reward_amount BIGINT NOT NULL,
    claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ad reward claims
CREATE TABLE IF NOT EXISTS ad_rewards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    reward_amount BIGINT NOT NULL,
    ad_provider VARCHAR(50),
    claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Token launch system records
CREATE TABLE IF NOT EXISTS token_launches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_name VARCHAR(255) NOT NULL,
    token_symbol VARCHAR(50) NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    fee_paid VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paid token promotions
CREATE TABLE IF NOT EXISTS promotions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_contract VARCHAR(42) NOT NULL,
    promotion_type VARCHAR(50) NOT NULL, -- e.g., 'homepage_listing', 'top_banner'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    payment_tx VARCHAR(255)
);

-- Gamification leaderboard
CREATE TABLE IF NOT EXISTS leaderboard (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    referral_count INTEGER DEFAULT 0,
    tokens_launched INTEGER DEFAULT 0,
    coins_earned BIGINT DEFAULT 0,
    rank INTEGER
);

-- Fraud prevention - session tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    ip_address VARCHAR(45),
    device_hash VARCHAR(255),
    login_time TIMESTAMPTZ DEFAULT NOW()
);

-- Simple key-value store for admin settings
CREATE TABLE IF NOT EXISTS admin_settings (
  key VARCHAR(50) PRIMARY KEY,
  value VARCHAR(255) NOT NULL,
  description TEXT
);

-- Default settings for reward amounts
INSERT INTO admin_settings (key, value, description) VALUES
('signup_reward', '100', 'Coins given to a new user on signup.'),
('referrer_signup_bonus', '50', 'Coins given to a referrer when their invitee signs up.'),
('daily_claim_reward', '10', 'Coins given for the daily claim.'),
('ad_claim_reward', '5', 'Legacy setting (no longer used directly).'),
('max_ad_claims_per_day', '5', 'Legacy setting (no longer used directly).'),
('activity_reward_amount', '5', 'Coins given for a qualified activity session.'),
('max_activity_rewards_per_day', '20', 'Maximum number of activity rewards allowed per user per day.'),
('utility_promotion_coins', '500', 'Cost in coins to buy a promotion.'),
('utility_ad_removal_coins', '200', 'Cost in coins to remove ads.'),
('utility_profile_boost_coins', '100', 'Cost in coins to boost a profile.')
ON CONFLICT (key) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_rewards_user_id_claimed_at ON daily_rewards(user_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_rewards_user_id_claimed_at ON ad_rewards(user_id, claimed_at DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_coins_earned ON leaderboard(coins_earned DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_referral_count ON leaderboard(referral_count DESC);
