import dotenv from 'dotenv';
import { PublicKey } from '@solana/web3.js';
import logger from './logger';

// Load environment variables
dotenv.config();

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
  initialAutomationBudgetPct: number;

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
  walletOrbSwapThreshold: number; // Swap when wallet ORB >= this (independent trigger)
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

  // Safety Settings
  dryRun: boolean;
  requireConfirmation: boolean;
  minSolBalance: number;
  rateLimitMs: number;
  incognitoMode: boolean;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseFloat(value) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function getEnvPriorityFee(key: string, defaultValue: number | 'auto'): number | 'auto' {
  const value = process.env[key];
  if (!value) return defaultValue;
  if (value.toLowerCase() === 'auto') return 'auto';
  const numValue = parseInt(value);
  return isNaN(numValue) ? defaultValue : numValue;
}

export function loadConfig(): Config {
  try {
    const config: Config = {
      // Wallet & Network
      privateKey: getEnv('PRIVATE_KEY'),
      rpcEndpoint: getEnv('RPC_ENDPOINT', 'https://api.mainnet-beta.solana.com'),
      orbProgramId: new PublicKey(getEnv('ORB_PROGRAM_ID')),
      orbTokenMint: new PublicKey(getEnv('ORB_TOKEN_MINT')),
      orbFeeCollector: new PublicKey(getEnv('ORB_FEE_COLLECTOR', '577HqbrnKM4micsY52rW8j6i9W8SmzV3FprfBCDneNpF')),
      network: getEnv('NETWORK', 'mainnet-beta'),

      // Bot Action
      botAction: getEnv('BOT_ACTION', 'auto-deploy') as Config['botAction'],

      // Deployment Settings
      deployStrategy: getEnv('DEPLOY_STRATEGY', 'all'),
      solPerDeployment: getEnvNumber('SOL_PER_DEPLOYMENT', 0.01),
      motherloadThreshold: getEnvNumber('MOTHERLOAD_THRESHOLD', 50),
      checkRoundIntervalMs: getEnvNumber('CHECK_ROUND_INTERVAL_MS', 10000),
      minSolForDeployment: getEnvNumber('MIN_SOL_FOR_DEPLOYMENT', 0.3),

      // Production Cost Analysis
      enableProductionCostCheck: getEnvBoolean('ENABLE_PRODUCTION_COST_CHECK', true),
      minExpectedValue: getEnvNumber('MIN_EXPECTED_VALUE', 0),
      estimatedCompetitionMultiplier: getEnvNumber('ESTIMATED_COMPETITION_MULTIPLIER', 10),

      // Smart Bot - Automation Account Settings
      initialAutomationBudgetPct: getEnvNumber('INITIAL_AUTOMATION_BUDGET_PCT', 90),

      // Smart Bot - Auto-Claim Thresholds
      autoClaimSolThreshold: getEnvNumber('AUTO_CLAIM_SOL_THRESHOLD', 0.1),
      autoClaimOrbThreshold: getEnvNumber('AUTO_CLAIM_ORB_THRESHOLD', 1.0),
      autoClaimStakingOrbThreshold: getEnvNumber('AUTO_CLAIM_STAKING_ORB_THRESHOLD', 0.5),
      checkRewardsIntervalMs: getEnvNumber('CHECK_REWARDS_INTERVAL_MS', 300000),
      checkStakingRewardsIntervalMs: getEnvNumber('CHECK_STAKING_REWARDS_INTERVAL_MS', 600000),

      // Claim Settings (legacy - for backward compatibility)
      autoClaimEnabled: getEnvBoolean('AUTO_CLAIM_ENABLED', true),
      claimThresholdSol: getEnvNumber('CLAIM_THRESHOLD_SOL', 1.0),
      claimThresholdOrb: getEnvNumber('CLAIM_THRESHOLD_ORB', 100),
      claimType: getEnv('CLAIM_TYPE', 'both') as Config['claimType'],
      claimFromMining: getEnvBoolean('CLAIM_FROM_MINING', true),
      claimFromStaking: getEnvBoolean('CLAIM_FROM_STAKING', true),

      // Smart Bot - Auto-Swap Settings
      autoSwapEnabled: getEnvBoolean('AUTO_SWAP_ENABLED', true),
      walletOrbSwapThreshold: getEnvNumber('WALLET_ORB_SWAP_THRESHOLD', 0.1),
      minOrbPriceUsd: getEnvNumber('MIN_ORB_PRICE_USD', 0),

      // Smart Bot - Auto-Stake Settings
      autoStakeEnabled: getEnvBoolean('AUTO_STAKE_ENABLED', false),
      stakeOrbThreshold: getEnvNumber('STAKE_ORB_THRESHOLD', 50),

      // Auto-Deploy Settings (legacy)
      autoDeployIterations: getEnvNumber('AUTO_DEPLOY_ITERATIONS', 0),
      deployMaxRetries: getEnvNumber('DEPLOY_MAX_RETRIES', 3),
      smartRoundManagement: getEnvBoolean('SMART_ROUND_MANAGEMENT', true),
      pauseIfLowSol: getEnvBoolean('PAUSE_IF_LOW_SOL', true),
      resumeNextRound: getEnvBoolean('RESUME_NEXT_ROUND', true),

      // Jupiter Integration (legacy)
      enableJupiterSwap: getEnvBoolean('ENABLE_JUPITER_SWAP', true),
      autoSwapWhenLowSol: getEnvBoolean('AUTO_SWAP_WHEN_LOW_SOL', true),
      swapOrbAmount: getEnvNumber('SWAP_ORB_AMOUNT', 10),
      minOrbToKeep: getEnvNumber('MIN_ORB_TO_KEEP', 5),
      minOrbSwapAmount: getEnvNumber('MIN_ORB_SWAP_AMOUNT', 0.1),
      slippageBps: getEnvNumber('SLIPPAGE_BPS', 50),
      swapPriorityFeeLamports: getEnvPriorityFee('SWAP_PRIORITY_FEE_LAMPORTS', 100000),
      jupiterApiUrl: getEnv('JUPITER_API_URL', 'https://quote-api.jup.ag/v6'),

      // Safety Settings
      dryRun: getEnvBoolean('DRY_RUN', false),
      requireConfirmation: getEnvBoolean('REQUIRE_CONFIRMATION', false),
      minSolBalance: getEnvNumber('MIN_SOL_BALANCE', 0.1),
      rateLimitMs: getEnvNumber('RATE_LIMIT_MS', 1000),
      incognitoMode: getEnvBoolean('INCOGNITO_MODE', false),
    };

    logger.info('Configuration loaded successfully');
    return config;
  } catch (error) {
    logger.error('Failed to load configuration:', error);
    throw error;
  }
}

export const config = loadConfig();
