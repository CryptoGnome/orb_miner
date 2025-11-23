/**
 * Strategy Types for ORB Mining Bot
 *
 * Extensible strategy system for deployment amounts and claiming behavior.
 * Add new strategies by extending these enums and implementing their handlers.
 */

/**
 * Deployment Amount Strategy
 *
 * Determines how much SOL to deploy per round
 */
export enum DeploymentAmountStrategy {
  /**
   * AUTO: Automatic calculation based on motherload tiers (current behavior)
   * Uses Monte Carlo optimized tiers for maximum ROI
   */
  AUTO = 'auto',

  /**
   * MANUAL: User specifies exact SOL amount per round
   * Bot uses MANUAL_AMOUNT_PER_ROUND setting
   */
  MANUAL = 'manual',

  /**
   * FIXED_ROUNDS: User specifies target number of rounds
   * Bot calculates amount per round: budget / (target_rounds * 25 squares)
   */
  FIXED_ROUNDS = 'fixed_rounds',

  /**
   * PERCENTAGE: User specifies percentage of total budget per round
   * Bot calculates amount per round: budget * (percentage / 100) / 25 squares
   */
  PERCENTAGE = 'percentage',

  // Future strategies can be added here:
  // AGGRESSIVE = 'aggressive',
  // CONSERVATIVE = 'conservative',
  // DYNAMIC = 'dynamic',
  // RISK_ADJUSTED = 'risk_adjusted',
}

/**
 * Claim Strategy
 *
 * Determines when and how to claim rewards
 */
export enum ClaimStrategy {
  /**
   * AUTO: Automatic threshold-based claiming (current behavior)
   * Claims when rewards exceed configured thresholds
   */
  AUTO = 'auto',

  /**
   * MANUAL: User triggers claims manually via dashboard
   * Bot never auto-claims, user has full control
   */
  MANUAL = 'manual',

  // Future strategies can be added here:
  // TIME_BASED = 'time_based',      // Claim every X hours
  // VALUE_BASED = 'value_based',    // Claim when USD value exceeds threshold
  // HYBRID = 'hybrid',              // Combination of auto + manual
  // GAS_OPTIMIZED = 'gas_optimized', // Claim when gas fees are low
}

/**
 * Deployment Amount Strategy Configuration
 *
 * Contains all parameters needed for each deployment strategy
 */
export interface DeploymentStrategyConfig {
  strategy: DeploymentAmountStrategy;

  // MANUAL strategy params
  manualAmountPerRound?: number;

  // FIXED_ROUNDS strategy params
  targetRounds?: number;

  // PERCENTAGE strategy params
  budgetPercentagePerRound?: number;

  // Common params (used by AUTO and other strategies)
  usableBudget: number;
  motherloadOrb: number;
}

/**
 * Claim Strategy Configuration
 *
 * Contains all parameters needed for each claim strategy
 */
export interface ClaimStrategyConfig {
  strategy: ClaimStrategy;

  // AUTO strategy params (thresholds)
  autoClaimSolThreshold?: number;
  autoClaimOrbThreshold?: number;
  autoClaimStakingOrbThreshold?: number;

  // TIME_BASED strategy params (future)
  // claimIntervalHours?: number;

  // VALUE_BASED strategy params (future)
  // minClaimValueUsd?: number;
}

/**
 * Strategy calculation result for deployment
 */
export interface DeploymentCalculation {
  solPerSquare: number;
  solPerRound: number;
  totalSquares: number;
  estimatedRounds: number;
  strategyUsed: DeploymentAmountStrategy;
  notes: string;
}

/**
 * Strategy labels for UI dropdowns
 */
export const DEPLOYMENT_STRATEGY_LABELS: Record<DeploymentAmountStrategy, string> = {
  [DeploymentAmountStrategy.AUTO]: 'Auto (Motherload-Based)',
  [DeploymentAmountStrategy.MANUAL]: 'Manual (Fixed Amount)',
  [DeploymentAmountStrategy.FIXED_ROUNDS]: 'Fixed Rounds',
  [DeploymentAmountStrategy.PERCENTAGE]: 'Percentage of Budget',
};

export const CLAIM_STRATEGY_LABELS: Record<ClaimStrategy, string> = {
  [ClaimStrategy.AUTO]: 'Auto (Threshold-Based)',
  [ClaimStrategy.MANUAL]: 'Manual (Dashboard Button)',
};
