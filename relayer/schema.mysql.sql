/*
  MySQL Schema for DexBridge Relayer Service

  - This script creates all required tables and indexes for the relayer backend.
  - Tables:
      1. bridge_events: Stores all bridge event data.
      2. processed_blocks: Tracks processed blocks per chain.
      3. relayer_stats: Daily stats per chain.
  - Indexes are included for performance.
  - Compatible with MySQL 5.7+ and 8.x.
  - No destructive operations; safe to import on a new/empty database.
*/

-- 1. bridge_events table
CREATE TABLE IF NOT EXISTS bridge_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tx_id VARCHAR(128) NOT NULL UNIQUE,
  event_type VARCHAR(64) NOT NULL,
  source_chain INT NOT NULL,
  target_chain INT NOT NULL,
  user_address VARCHAR(64) NOT NULL,
  token_address VARCHAR(64) NOT NULL,
  amount VARCHAR(128) NOT NULL,
  target_address VARCHAR(64) NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(128) NOT NULL,
  status VARCHAR(32) DEFAULT 'pending',
  confirmations INT DEFAULT 0,
  relay_tx_hash VARCHAR(128),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexes for bridge_events
CREATE INDEX idx_bridge_events_status ON bridge_events(status);
CREATE INDEX idx_bridge_events_chains ON bridge_events(source_chain, target_chain);

-- 2. processed_blocks table
CREATE TABLE IF NOT EXISTS processed_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chain_id INT NOT NULL,
  block_number BIGINT NOT NULL,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_chain_block (chain_id, block_number)
);

-- Index for processed_blocks
CREATE INDEX idx_processed_blocks_chain ON processed_blocks(chain_id);

-- 3. relayer_stats table
CREATE TABLE IF NOT EXISTS relayer_stats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  chain_id INT NOT NULL,
  events_processed INT DEFAULT 0,
  successful_relays INT DEFAULT 0,
  failed_relays INT DEFAULT 0,
  total_volume VARCHAR(128) DEFAULT '0',
  UNIQUE KEY uniq_date_chain (date, chain_id)
);

-- End of schema
