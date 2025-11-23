import { allQuery, runQuery } from './database';
import { decrypt, encrypt, isEncrypted } from './encryption';
import logger from './logger';

/**
 * Load settings from database only (no .env fallback)
 */
export async function loadSettingsFromDB(): Promise<Record<string, string>> {
  try {
    const dbSettings = await allQuery<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );

    const settings: Record<string, string> = {};

    for (const setting of dbSettings) {
      let value = setting.value;

      // Decrypt sensitive values if encrypted
      if (isEncrypted(value)) {
        try {
          value = decrypt(value);
        } catch (error) {
          logger.error(`Failed to decrypt setting ${setting.key}, skipping`);
          continue;
        }
      }

      settings[setting.key] = value;
    }

    if (Object.keys(settings).length > 0) {
      logger.info(`Loaded ${Object.keys(settings).length} settings from database`);
    } else {
      logger.warn('No settings found in database - will use defaults');
    }

    return settings;
  } catch (error) {
    logger.error('Failed to load settings from database:', error);
    return {};
  }
}

/**
 * Get a setting value from database with fallback to default
 * Priority: Database > Default Value
 */
export function getSettingValue(
  dbSettings: Record<string, string>,
  key: string,
  defaultValue?: string
): string {
  // Check database first
  if (dbSettings[key] !== undefined) {
    return dbSettings[key];
  }

  // Use default if provided
  if (defaultValue !== undefined) {
    return defaultValue;
  }

  throw new Error(`Missing required setting: ${key} (not in database and no default provided)`);
}

/**
 * Save or update a setting in the database
 */
export async function saveSetting(
  key: string,
  value: string,
  type: string = 'string',
  description?: string,
  encryptValue: boolean = false
): Promise<void> {
  try {
    const valueToStore = encryptValue ? encrypt(value) : value;

    await runQuery(
      `INSERT INTO settings (key, value, type, description, updated_at)
       VALUES (?, ?, ?, ?, strftime('%s', 'now'))
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         type = excluded.type,
         description = excluded.description,
         updated_at = strftime('%s', 'now')`,
      [key, valueToStore, type, description || '']
    );
  } catch (error) {
    logger.error(`Failed to save setting ${key}:`, error);
    throw error;
  }
}

/**
 * Initialize default settings in database if they don't exist
 * This is called on bot startup to ensure all required settings have defaults
 */
export async function initializeDefaultSettings(): Promise<void> {
  try {
    logger.info('Initializing default settings...');

    const defaults = [
      // Required settings (no defaults - must be set by user via wizard)
      // Note: Don't encrypt empty PRIVATE_KEY - encryption only works on non-empty values
      { key: 'PRIVATE_KEY', value: '', type: 'string', description: 'Base58 wallet private key (REQUIRED)', encrypt: false },
      { key: 'RPC_ENDPOINT', value: 'https://api.mainnet-beta.solana.com', type: 'string', description: 'Solana RPC URL' },

      // Program IDs
      { key: 'ORB_PROGRAM_ID', value: 'boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk', type: 'string', description: 'ORB program ID' },
      { key: 'ORB_TOKEN_MINT', value: 'orebyr4mDiPDVgnfqvF5xiu5gKnh94Szuz8dqgNqdJn', type: 'string', description: 'ORB token mint address' },
      { key: 'ORB_FEE_COLLECTOR', value: '9DTThTbggnp2P2ZGLFRfN1A3j5JUsXez1dRJak3TixB2', type: 'string', description: 'Development fee collector' },
      { key: 'NETWORK', value: 'mainnet-beta', type: 'string', description: 'Solana network' },

      // Bot Action
      { key: 'BOT_ACTION', value: 'auto-deploy', type: 'string', description: 'Bot action mode' },

      // Deployment Settings
      { key: 'DEPLOY_STRATEGY', value: 'all', type: 'string', description: 'Deployment strategy (all/single/random)' },
      { key: 'SOL_PER_DEPLOYMENT', value: '0.01', type: 'number', description: 'SOL per deployment' },
      { key: 'MOTHERLOAD_THRESHOLD', value: '100', type: 'number', description: 'Minimum motherload to mine' },
      { key: 'CHECK_ROUND_INTERVAL_MS', value: '10000', type: 'number', description: 'Round check interval (ms)' },
      { key: 'MIN_SOL_FOR_DEPLOYMENT', value: '0.3', type: 'number', description: 'Minimum SOL for deployment' },

      // Production Cost Analysis
      { key: 'ENABLE_PRODUCTION_COST_CHECK', value: 'true', type: 'boolean', description: 'Enable EV-based profitability check' },
      { key: 'MIN_EXPECTED_VALUE', value: '0', type: 'number', description: 'Minimum expected value to deploy' },
      { key: 'ESTIMATED_COMPETITION_MULTIPLIER', value: '10', type: 'number', description: 'Competition multiplier estimate' },

      // Smart Bot - Automation Account
      { key: 'INITIAL_AUTOMATION_BUDGET_PCT', value: '90', type: 'number', description: 'Initial automation budget %' },

      // Deployment Amount Strategy
      { key: 'DEPLOYMENT_AMOUNT_STRATEGY', value: 'auto', type: 'string', description: 'Deployment amount strategy (auto/manual/fixed_rounds/percentage)' },
      { key: 'MANUAL_AMOUNT_PER_ROUND', value: '0.01', type: 'number', description: 'Manual: SOL amount per round' },
      { key: 'TARGET_ROUNDS', value: '100', type: 'number', description: 'Fixed Rounds: Target number of rounds' },
      { key: 'BUDGET_PERCENTAGE_PER_ROUND', value: '1.0', type: 'number', description: 'Percentage: % of budget per round' },

      // Claim Strategy
      { key: 'CLAIM_STRATEGY', value: 'auto', type: 'string', description: 'Claim strategy (auto/manual)' },

      // Smart Bot - Auto-Claim Thresholds
      { key: 'AUTO_CLAIM_SOL_THRESHOLD', value: '0.1', type: 'number', description: 'Auto-claim SOL threshold' },
      { key: 'AUTO_CLAIM_ORB_THRESHOLD', value: '1.0', type: 'number', description: 'Auto-claim ORB threshold' },
      { key: 'AUTO_CLAIM_STAKING_ORB_THRESHOLD', value: '0.5', type: 'number', description: 'Auto-claim staking ORB threshold' },
      { key: 'CHECK_REWARDS_INTERVAL_MS', value: '300000', type: 'number', description: 'Check rewards interval (ms)' },
      { key: 'CHECK_STAKING_REWARDS_INTERVAL_MS', value: '600000', type: 'number', description: 'Check staking rewards interval (ms)' },

      // Legacy Claim Settings
      { key: 'AUTO_CLAIM_ENABLED', value: 'true', type: 'boolean', description: 'Enable auto-claim' },
      { key: 'CLAIM_THRESHOLD_SOL', value: '1.0', type: 'number', description: 'Legacy claim SOL threshold' },
      { key: 'CLAIM_THRESHOLD_ORB', value: '100', type: 'number', description: 'Legacy claim ORB threshold' },
      { key: 'CLAIM_TYPE', value: 'both', type: 'string', description: 'Claim type (sol/orb/both)' },
      { key: 'CLAIM_FROM_MINING', value: 'true', type: 'boolean', description: 'Claim from mining' },
      { key: 'CLAIM_FROM_STAKING', value: 'true', type: 'boolean', description: 'Claim from staking' },

      // Smart Bot - Auto-Swap
      { key: 'AUTO_SWAP_ENABLED', value: 'true', type: 'boolean', description: 'Enable auto-swap ORB to SOL' },
      { key: 'WALLET_ORB_SWAP_THRESHOLD', value: '0.1', type: 'number', description: 'Wallet ORB swap threshold' },
      { key: 'MIN_ORB_PRICE_USD', value: '30', type: 'number', description: 'Minimum ORB price to swap (USD)' },

      // Smart Bot - Auto-Stake
      { key: 'AUTO_STAKE_ENABLED', value: 'false', type: 'boolean', description: 'Enable auto-stake' },
      { key: 'STAKE_ORB_THRESHOLD', value: '50', type: 'number', description: 'ORB threshold for staking' },

      // Legacy Auto-Deploy Settings
      { key: 'AUTO_DEPLOY_ITERATIONS', value: '0', type: 'number', description: 'Auto-deploy iterations (0=infinite)' },
      { key: 'DEPLOY_MAX_RETRIES', value: '3', type: 'number', description: 'Max deployment retries' },
      { key: 'SMART_ROUND_MANAGEMENT', value: 'true', type: 'boolean', description: 'Smart round management' },
      { key: 'PAUSE_IF_LOW_SOL', value: 'true', type: 'boolean', description: 'Pause if low SOL' },
      { key: 'RESUME_NEXT_ROUND', value: 'true', type: 'boolean', description: 'Resume next round' },

      // Jupiter Integration
      { key: 'ENABLE_JUPITER_SWAP', value: 'true', type: 'boolean', description: 'Enable Jupiter swap' },
      { key: 'AUTO_SWAP_WHEN_LOW_SOL', value: 'true', type: 'boolean', description: 'Auto-swap when low SOL' },
      { key: 'SWAP_ORB_AMOUNT', value: '10', type: 'number', description: 'ORB amount to swap' },
      { key: 'MIN_ORB_TO_KEEP', value: '0', type: 'number', description: 'Minimum ORB to keep' },
      { key: 'MIN_ORB_SWAP_AMOUNT', value: '0.1', type: 'number', description: 'Minimum ORB swap amount' },
      { key: 'SLIPPAGE_BPS', value: '50', type: 'number', description: 'Slippage tolerance (bps)' },
      { key: 'SWAP_PRIORITY_FEE_LAMPORTS', value: '100000', type: 'string', description: 'Swap priority fee (auto or number)' },
      { key: 'JUPITER_API_URL', value: 'https://quote-api.jup.ag/v6', type: 'string', description: 'Jupiter API URL' },

      // Priority Fee Settings
      { key: 'PRIORITY_FEE_LEVEL', value: 'medium', type: 'string', description: 'Priority fee level (low/medium/high/veryHigh)' },
      { key: 'MIN_PRIORITY_FEE_MICRO_LAMPORTS', value: '100', type: 'number', description: 'Min priority fee (micro-lamports)' },
      { key: 'MAX_PRIORITY_FEE_MICRO_LAMPORTS', value: '50000', type: 'number', description: 'Max priority fee (micro-lamports)' },

      // Safety Settings
      { key: 'DRY_RUN', value: 'false', type: 'boolean', description: 'Dry run mode (simulate only)' },
      { key: 'REQUIRE_CONFIRMATION', value: 'false', type: 'boolean', description: 'Require confirmation' },
      { key: 'MIN_SOL_BALANCE', value: '0.1', type: 'number', description: 'Minimum SOL balance' },
      { key: 'RATE_LIMIT_MS', value: '1000', type: 'number', description: 'Rate limit (ms)' },
      { key: 'INCOGNITO_MODE', value: 'false', type: 'boolean', description: 'Incognito mode (hide sensitive data)' },
      { key: 'DASHBOARD_PASSWORD', value: '', type: 'string', description: 'Dashboard password for remote access (encrypted)', encrypt: false },
      { key: 'DASHBOARD_PORT', value: '3888', type: 'number', description: 'Dashboard port number' },
    ];

    // Insert defaults only if they don't exist
    for (const setting of defaults) {
      // Only encrypt non-empty values
      const shouldEncrypt = setting.encrypt && setting.value !== '';
      const valueToStore = shouldEncrypt ? encrypt(setting.value) : setting.value;

      await runQuery(
        `INSERT OR IGNORE INTO settings (key, value, type, description, updated_at)
         VALUES (?, ?, ?, ?, strftime('%s', 'now'))`,
        [setting.key, valueToStore, setting.type, setting.description]
      );
    }

    logger.info('Default settings initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize default settings:', error);
    throw error;
  }
}

/**
 * Get a number setting with validation
 */
export function getNumberSetting(
  dbSettings: Record<string, string>,
  key: string,
  defaultValue: number
): number {
  const value = getSettingValue(dbSettings, key, String(defaultValue));
  return parseFloat(value) || defaultValue;
}

/**
 * Get a boolean setting
 */
export function getBooleanSetting(
  dbSettings: Record<string, string>,
  key: string,
  defaultValue: boolean
): boolean {
  const value = getSettingValue(dbSettings, key, String(defaultValue));
  return value.toLowerCase() === 'true' || value === '1';
}
