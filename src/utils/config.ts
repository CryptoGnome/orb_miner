import { PublicKey } from '@solana/web3.js';
import logger from './logger';
import {
  loadSettingsFromDB,
  getSettingValue,
  getNumberSetting,
  getBooleanSetting,
  initializeDefaultSettings
} from './settingsLoader';
import { DeploymentAmountStrategy, ClaimStrategy } from '../types/strategies';

export interface Config {
  // Wallet & Network
  privateKey: string;
  rpcEndpoint: string;
  orbProgramId: PublicKey;
  orbTokenMint: PublicKey;
  orbFeeCollector: PublicKey;
  network: string;

  // Bot Action
  botAction: 'auto-deploy' | 'deploy' | 'claim' | 'stake' | 'swap' | 'query';

  // Deployment Settings
  deployStrategy: string;
  solPerDeployment: number;
  motherloadThreshold: number;
  checkRoundIntervalMs: number;
  minSolForDeployment: number;

  // Production Cost Analysis
  enableProductionCostCheck: boolean;
  minExpectedValue: number;
  estimatedCompetitionMultiplier: number;

  // Smart Bot - Automation Account Settings
  budgetType: 'percentage' | 'fixed';
  initialAutomationBudgetPct: number;
  fixedBudgetAmount: number;

  // Deployment Amount Strategy
  deploymentAmountStrategy: DeploymentAmountStrategy;
  manualAmountPerRound: number;
  targetRounds: number;
  budgetPercentagePerRound: number;

  // Claim Strategy
  claimStrategy: ClaimStrategy;

  // Smart Bot - Auto-Claim Thresholds
  autoClaimSolThreshold: number;
  autoClaimOrbThreshold: number;
  autoClaimStakingOrbThreshold: number;
  checkRewardsIntervalMs: number;
  checkStakingRewardsIntervalMs: number;

  // Claim Settings (legacy - for backward compatibility)
  autoClaimEnabled: boolean;
  claimThresholdSol: number;
  claimThresholdOrb: number;
  claimType: 'sol' | 'orb' | 'both';
  claimFromMining: boolean;
  claimFromStaking: boolean;

  // Smart Bot - Auto-Swap Settings
  autoSwapEnabled: boolean;
  walletOrbSwapThreshold: number;
  minOrbPriceUsd: number;

  // Smart Bot - Auto-Stake Settings
  autoStakeEnabled: boolean;
  stakeOrbThreshold: number;

  // Auto-Deploy Settings (legacy)
  autoDeployIterations: number;
  deployMaxRetries: number;
  smartRoundManagement: boolean;
  pauseIfLowSol: boolean;
  resumeNextRound: boolean;

  // Jupiter Integration (legacy)
  enableJupiterSwap: boolean;
  autoSwapWhenLowSol: boolean;
  swapOrbAmount: number;
  minOrbToKeep: number;
  minOrbSwapAmount: number;
  slippageBps: number;
  swapPriorityFeeLamports: number | 'auto';
  jupiterApiUrl: string;

  // Priority Fee Settings (Dynamic Fee Optimization)
  priorityFeeLevel: string;
  minPriorityFeeMicroLamports: number;
  maxPriorityFeeMicroLamports: number;

  // Safety Settings
  dryRun: boolean;
  requireConfirmation: boolean;
  minSolBalance: number;
  rateLimitMs: number;
  incognitoMode: boolean;
}

/**
 * Load configuration from database only
 * Initializes defaults if database is empty
 */
export async function loadConfigWithDB(): Promise<Config> {
  try {
    // Initialize defaults first (safe to run multiple times - uses INSERT OR IGNORE)
    await initializeDefaultSettings();

    // Load settings from database
    const dbSettings = await loadSettingsFromDB();

    function getPriorityFee(key: string, defaultValue: number | 'auto'): number | 'auto' {
      const value = getSettingValue(dbSettings, key, String(defaultValue));
      if (value.toLowerCase() === 'auto') return 'auto';
      const numValue = parseInt(value);
      return isNaN(numValue) ? defaultValue : numValue;
    }

    const config: Config = {
      // Wallet & Network
      // Note: PRIVATE_KEY may be empty on first run - wizard will handle this
      privateKey: getSettingValue(dbSettings, 'PRIVATE_KEY', ''),
      rpcEndpoint: getSettingValue(dbSettings, 'RPC_ENDPOINT', 'https://api.mainnet-beta.solana.com'),
      orbProgramId: new PublicKey(getSettingValue(dbSettings, 'ORB_PROGRAM_ID', 'boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk')),
      orbTokenMint: new PublicKey(getSettingValue(dbSettings, 'ORB_TOKEN_MINT', 'orebyr4mDiPDVgnfqvF5xiu5gKnh94Szuz8dqgNqdJn')),
      orbFeeCollector: new PublicKey(getSettingValue(dbSettings, 'ORB_FEE_COLLECTOR', '9DTThTbggnp2P2ZGLFRfN1A3j5JUsXez1dRJak3TixB2')),
      network: getSettingValue(dbSettings, 'NETWORK', 'mainnet-beta'),

      // Bot Action
      botAction: getSettingValue(dbSettings, 'BOT_ACTION', 'auto-deploy') as Config['botAction'],

      // Deployment Settings
      deployStrategy: getSettingValue(dbSettings, 'DEPLOY_STRATEGY', 'all'),
      solPerDeployment: getNumberSetting(dbSettings, 'SOL_PER_DEPLOYMENT', 0.01),
      motherloadThreshold: getNumberSetting(dbSettings, 'MOTHERLOAD_THRESHOLD', 100),
      checkRoundIntervalMs: getNumberSetting(dbSettings, 'CHECK_ROUND_INTERVAL_MS', 10000),
      minSolForDeployment: getNumberSetting(dbSettings, 'MIN_SOL_FOR_DEPLOYMENT', 0.3),

      // Production Cost Analysis
      enableProductionCostCheck: getBooleanSetting(dbSettings, 'ENABLE_PRODUCTION_COST_CHECK', true),
      minExpectedValue: getNumberSetting(dbSettings, 'MIN_EXPECTED_VALUE', 0),
      estimatedCompetitionMultiplier: getNumberSetting(dbSettings, 'ESTIMATED_COMPETITION_MULTIPLIER', 10),

      // Smart Bot - Automation Account Settings
      budgetType: (getSettingValue(dbSettings, 'BUDGET_TYPE', 'percentage') as 'percentage' | 'fixed'),
      initialAutomationBudgetPct: getNumberSetting(dbSettings, 'INITIAL_AUTOMATION_BUDGET_PCT', 90),
      fixedBudgetAmount: getNumberSetting(dbSettings, 'FIXED_BUDGET_AMOUNT', 1.0),

      // Deployment Amount Strategy
      deploymentAmountStrategy: getSettingValue(dbSettings, 'DEPLOYMENT_AMOUNT_STRATEGY', 'auto') as DeploymentAmountStrategy,
      manualAmountPerRound: getNumberSetting(dbSettings, 'MANUAL_AMOUNT_PER_ROUND', 0.01),
      targetRounds: getNumberSetting(dbSettings, 'TARGET_ROUNDS', 100),
      budgetPercentagePerRound: getNumberSetting(dbSettings, 'BUDGET_PERCENTAGE_PER_ROUND', 1.0),

      // Claim Strategy
      claimStrategy: getSettingValue(dbSettings, 'CLAIM_STRATEGY', 'auto') as ClaimStrategy,

      // Smart Bot - Auto-Claim Thresholds
      autoClaimSolThreshold: getNumberSetting(dbSettings, 'AUTO_CLAIM_SOL_THRESHOLD', 0.1),
      autoClaimOrbThreshold: getNumberSetting(dbSettings, 'AUTO_CLAIM_ORB_THRESHOLD', 1.0),
      autoClaimStakingOrbThreshold: getNumberSetting(dbSettings, 'AUTO_CLAIM_STAKING_ORB_THRESHOLD', 0.5),
      checkRewardsIntervalMs: getNumberSetting(dbSettings, 'CHECK_REWARDS_INTERVAL_MS', 300000),
      checkStakingRewardsIntervalMs: getNumberSetting(dbSettings, 'CHECK_STAKING_REWARDS_INTERVAL_MS', 600000),

      // Claim Settings (legacy)
      autoClaimEnabled: getBooleanSetting(dbSettings, 'AUTO_CLAIM_ENABLED', true),
      claimThresholdSol: getNumberSetting(dbSettings, 'CLAIM_THRESHOLD_SOL', 1.0),
      claimThresholdOrb: getNumberSetting(dbSettings, 'CLAIM_THRESHOLD_ORB', 100),
      claimType: getSettingValue(dbSettings, 'CLAIM_TYPE', 'both') as Config['claimType'],
      claimFromMining: getBooleanSetting(dbSettings, 'CLAIM_FROM_MINING', true),
      claimFromStaking: getBooleanSetting(dbSettings, 'CLAIM_FROM_STAKING', true),

      // Smart Bot - Auto-Swap Settings
      autoSwapEnabled: getBooleanSetting(dbSettings, 'AUTO_SWAP_ENABLED', true),
      walletOrbSwapThreshold: getNumberSetting(dbSettings, 'WALLET_ORB_SWAP_THRESHOLD', 0.1),
      minOrbPriceUsd: getNumberSetting(dbSettings, 'MIN_ORB_PRICE_USD', 30),

      // Smart Bot - Auto-Stake Settings
      autoStakeEnabled: getBooleanSetting(dbSettings, 'AUTO_STAKE_ENABLED', false),
      stakeOrbThreshold: getNumberSetting(dbSettings, 'STAKE_ORB_THRESHOLD', 50),

      // Auto-Deploy Settings (legacy)
      autoDeployIterations: getNumberSetting(dbSettings, 'AUTO_DEPLOY_ITERATIONS', 0),
      deployMaxRetries: getNumberSetting(dbSettings, 'DEPLOY_MAX_RETRIES', 3),
      smartRoundManagement: getBooleanSetting(dbSettings, 'SMART_ROUND_MANAGEMENT', true),
      pauseIfLowSol: getBooleanSetting(dbSettings, 'PAUSE_IF_LOW_SOL', true),
      resumeNextRound: getBooleanSetting(dbSettings, 'RESUME_NEXT_ROUND', true),

      // Jupiter Integration (legacy)
      enableJupiterSwap: getBooleanSetting(dbSettings, 'ENABLE_JUPITER_SWAP', true),
      autoSwapWhenLowSol: getBooleanSetting(dbSettings, 'AUTO_SWAP_WHEN_LOW_SOL', true),
      swapOrbAmount: getNumberSetting(dbSettings, 'SWAP_ORB_AMOUNT', 10),
      minOrbToKeep: getNumberSetting(dbSettings, 'MIN_ORB_TO_KEEP', 0),
      minOrbSwapAmount: getNumberSetting(dbSettings, 'MIN_ORB_SWAP_AMOUNT', 0.1),
      slippageBps: getNumberSetting(dbSettings, 'SLIPPAGE_BPS', 50),
      swapPriorityFeeLamports: getPriorityFee('SWAP_PRIORITY_FEE_LAMPORTS', 100000),
      jupiterApiUrl: getSettingValue(dbSettings, 'JUPITER_API_URL', 'https://quote-api.jup.ag/v6'),

      // Priority Fee Settings (Dynamic Fee Optimization)
      priorityFeeLevel: getSettingValue(dbSettings, 'PRIORITY_FEE_LEVEL', 'medium'),
      minPriorityFeeMicroLamports: getNumberSetting(dbSettings, 'MIN_PRIORITY_FEE_MICRO_LAMPORTS', 100),
      maxPriorityFeeMicroLamports: getNumberSetting(dbSettings, 'MAX_PRIORITY_FEE_MICRO_LAMPORTS', 50000),

      // Safety Settings
      dryRun: getBooleanSetting(dbSettings, 'DRY_RUN', false),
      requireConfirmation: getBooleanSetting(dbSettings, 'REQUIRE_CONFIRMATION', false),
      minSolBalance: getNumberSetting(dbSettings, 'MIN_SOL_BALANCE', 0.1),
      rateLimitMs: getNumberSetting(dbSettings, 'RATE_LIMIT_MS', 1000),
      incognitoMode: getBooleanSetting(dbSettings, 'INCOGNITO_MODE', false),
    };

    const dbKeys = Object.keys(dbSettings);
    logger.info(`Configuration loaded from database: ${dbKeys.length} settings`);

    return config;
  } catch (error) {
    logger.error('Failed to load configuration:', error);
    throw error;
  }
}

// Global config cache (loaded once, reused throughout app lifecycle)
let cachedConfig: Config | null = null;

/**
 * Get cached config (must call loadConfigWithDB() first)
 * This allows synchronous access to config after initial async load
 */
export function getConfig(): Config {
  if (!cachedConfig) {
    throw new Error(
      'Configuration not loaded yet. Call loadConfigWithDB() first (usually in main bot startup).'
    );
  }
  return cachedConfig;
}

/**
 * Load configuration from database and cache it
 * This should be called once at bot startup
 */
export async function loadAndCacheConfig(): Promise<Config> {
  cachedConfig = await loadConfigWithDB();
  return cachedConfig;
}

/**
 * Refresh the cached configuration by reloading from database
 * Call this after settings are updated to pick up new values immediately
 */
export async function refreshConfig(): Promise<Config> {
  logger.info('Refreshing configuration from database...');
  cachedConfig = await loadConfigWithDB();
  logger.info('Configuration refreshed successfully');
  return cachedConfig;
}

/**
 * Backward compatible synchronous config loader
 * @deprecated Use getConfig() after calling loadConfigWithDB() once
 * @throws Error - synchronous loading is no longer supported
 */
export function loadConfig(): Config {
  throw new Error(
    'Synchronous config loading is no longer supported. ' +
    'Call loadConfigWithDB() once at startup, then use getConfig() to access config.'
  );
}

/**
 * Export cached config for backward compatibility
 * @deprecated Import getConfig() and call it instead of using this export
 */
export const config = new Proxy({} as Config, {
  get(_target, prop) {
    // Lazy load on first access
    if (!cachedConfig) {
      throw new Error(
        '⚠️  Configuration not loaded yet. ' +
        'Call loadConfigWithDB() at bot startup before accessing config. ' +
        'Note: .env files are no longer used - all config is in the database.'
      );
    }
    return cachedConfig[prop as keyof Config];
  }
});
