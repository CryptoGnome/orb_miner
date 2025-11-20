/**
 * Dashboard helper for accessing bot configuration
 * Configuration is loaded from SQLite database (no .env needed)
 */
import { config, loadAndCacheConfig } from '@bot/utils/config';
import { Connection, PublicKey } from '@solana/web3.js';

// Export config and utilities for dashboard use
export { config as botConfig, loadAndCacheConfig };
export { Connection, PublicKey };
