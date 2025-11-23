/**
 * Strategy Handlers for ORB Mining Bot
 *
 * Implements the logic for each deployment and claim strategy.
 * To add a new strategy:
 * 1. Add enum value to src/types/strategies.ts
 * 2. Add case to the appropriate handler function here
 * 3. Add settings to database defaults (if needed)
 */

import logger from './logger';
import {
  DeploymentAmountStrategy,
  ClaimStrategy,
  DeploymentStrategyConfig,
  ClaimStrategyConfig,
  DeploymentCalculation,
} from '../types/strategies';

/**
 * Default motherload tiers for AUTO strategy
 * Monte Carlo optimized tiers for maximum ROI
 */
const DEFAULT_AUTO_TIERS = [
  { motherloadThreshold: 1600, targetRounds: 40 },
  { motherloadThreshold: 1500, targetRounds: 50 },
  { motherloadThreshold: 1400, targetRounds: 60 },
  { motherloadThreshold: 1300, targetRounds: 70 },
  { motherloadThreshold: 1200, targetRounds: 80 },
  { motherloadThreshold: 1100, targetRounds: 100 },
  { motherloadThreshold: 1000, targetRounds: 120 },
  { motherloadThreshold: 900, targetRounds: 160 },
  { motherloadThreshold: 800, targetRounds: 200 },
  { motherloadThreshold: 700, targetRounds: 240 },
  { motherloadThreshold: 600, targetRounds: 280 },
  { motherloadThreshold: 500, targetRounds: 320 },
  { motherloadThreshold: 400, targetRounds: 360 },
  { motherloadThreshold: 300, targetRounds: 400 },
  { motherloadThreshold: 200, targetRounds: 440 },
  { motherloadThreshold: 0, targetRounds: 880 },
];

/**
 * Calculate optimal rounds based on motherload (AUTO strategy)
 *
 * Supports custom tier configuration or falls back to default Monte Carlo optimized tiers
 */
function calculateTargetRoundsAuto(
  motherloadOrb: number,
  customTiers?: Array<{ motherloadThreshold: number; targetRounds: number }>
): number {
  const tiers = customTiers && customTiers.length > 0 ? customTiers : DEFAULT_AUTO_TIERS;

  // Sort tiers by threshold descending (highest first)
  const sortedTiers = [...tiers].sort((a, b) => b.motherloadThreshold - a.motherloadThreshold);

  // Find the first tier where motherload >= threshold
  for (const tier of sortedTiers) {
    if (motherloadOrb >= tier.motherloadThreshold) {
      return tier.targetRounds;
    }
  }

  // Fallback to the last tier's target rounds
  return sortedTiers[sortedTiers.length - 1]?.targetRounds || 880;
}

/**
 * Calculate deployment amount based on selected strategy
 *
 * @param config - Strategy configuration with all necessary parameters
 * @returns Deployment calculation with amount per square/round
 */
export function calculateDeploymentAmount(
  config: DeploymentStrategyConfig
): DeploymentCalculation {
  const { strategy, usableBudget, motherloadOrb } = config;

  logger.debug(`Calculating deployment amount using strategy: ${strategy}`);

  switch (strategy) {
    case DeploymentAmountStrategy.AUTO: {
      // Automatic calculation based on motherload tiers (with optional custom tiers)
      const targetRounds = calculateTargetRoundsAuto(motherloadOrb, config.customAutoTiers);
      const totalSquares = targetRounds * 25;
      const solPerSquare = usableBudget / totalSquares;
      const solPerRound = solPerSquare * 25;

      const tierNote = config.customAutoTiers ? 'Custom tiers' : 'Optimized tiers';
      logger.info(`Using AUTO strategy: ${targetRounds} rounds at ${motherloadOrb.toFixed(2)} ORB motherload`);

      return {
        solPerSquare,
        solPerRound,
        totalSquares: 25,
        estimatedRounds: targetRounds,
        strategyUsed: DeploymentAmountStrategy.AUTO,
        notes: `Auto (${tierNote}): ${targetRounds} rounds @ ${motherloadOrb.toFixed(2)} ORB`,
      };
    }

    case DeploymentAmountStrategy.MANUAL: {
      // User specifies exact amount per round
      const manualAmount = config.manualAmountPerRound || 0.01;
      const solPerSquare = manualAmount / 25;
      const estimatedRounds = Math.floor(usableBudget / manualAmount);

      logger.info(`Using MANUAL strategy: ${manualAmount} SOL per round`);

      return {
        solPerSquare,
        solPerRound: manualAmount,
        totalSquares: 25,
        estimatedRounds,
        strategyUsed: DeploymentAmountStrategy.MANUAL,
        notes: `Manual: ${manualAmount} SOL per round (user-specified)`,
      };
    }

    case DeploymentAmountStrategy.FIXED_ROUNDS: {
      // User specifies target number of rounds
      const targetRounds = config.targetRounds || 100;
      const totalSquares = targetRounds * 25;
      const solPerSquare = usableBudget / totalSquares;
      const solPerRound = solPerSquare * 25;

      logger.info(`Using FIXED_ROUNDS strategy: ${targetRounds} target rounds`);

      return {
        solPerSquare,
        solPerRound,
        totalSquares: 25,
        estimatedRounds: targetRounds,
        strategyUsed: DeploymentAmountStrategy.FIXED_ROUNDS,
        notes: `Fixed rounds: ${targetRounds} rounds (user-specified)`,
      };
    }

    case DeploymentAmountStrategy.PERCENTAGE: {
      // User specifies percentage of budget per round
      const percentage = config.budgetPercentagePerRound || 1.0;
      const solPerRound = (usableBudget * percentage) / 100;
      const solPerSquare = solPerRound / 25;
      const estimatedRounds = Math.floor(100 / percentage);

      logger.info(`Using PERCENTAGE strategy: ${percentage}% per round`);

      return {
        solPerSquare,
        solPerRound,
        totalSquares: 25,
        estimatedRounds,
        strategyUsed: DeploymentAmountStrategy.PERCENTAGE,
        notes: `Percentage: ${percentage}% of budget per round`,
      };
    }

    default: {
      logger.warn(`Unknown deployment strategy: ${strategy}, falling back to AUTO`);

      // Fallback to AUTO strategy
      const targetRounds = calculateTargetRoundsAuto(motherloadOrb);
      const totalSquares = targetRounds * 25;
      const solPerSquare = usableBudget / totalSquares;
      const solPerRound = solPerSquare * 25;

      return {
        solPerSquare,
        solPerRound,
        totalSquares: 25,
        estimatedRounds: targetRounds,
        strategyUsed: DeploymentAmountStrategy.AUTO,
        notes: `Fallback to AUTO: ${targetRounds} rounds`,
      };
    }
  }
}

/**
 * Check if auto-claim should be triggered based on claim strategy
 *
 * @param config - Claim strategy configuration
 * @param claimableSol - Current claimable SOL amount
 * @param claimableOrb - Current claimable ORB amount
 * @param isStaking - Whether this is for staking rewards
 * @returns true if should auto-claim, false otherwise
 */
export function shouldAutoClaim(
  config: ClaimStrategyConfig,
  claimableSol: number,
  claimableOrb: number,
  isStaking: boolean = false
): boolean {
  const { strategy } = config;

  logger.debug(`Checking claim strategy: ${strategy}`);

  switch (strategy) {
    case ClaimStrategy.AUTO: {
      // Original threshold-based auto-claiming
      const solThreshold = config.autoClaimSolThreshold || 0.1;
      const orbThreshold = isStaking
        ? config.autoClaimStakingOrbThreshold || 0.5
        : config.autoClaimOrbThreshold || 1.0;

      const shouldClaimSol = claimableSol >= solThreshold;
      const shouldClaimOrb = claimableOrb >= orbThreshold;

      if (shouldClaimSol || shouldClaimOrb) {
        logger.debug(
          `AUTO claim triggered: SOL=${claimableSol.toFixed(4)} (threshold: ${solThreshold}), ` +
          `ORB=${claimableOrb.toFixed(4)} (threshold: ${orbThreshold})`
        );
        return true;
      }

      return false;
    }

    case ClaimStrategy.MANUAL: {
      // Never auto-claim - user must trigger manually
      logger.debug('MANUAL claim strategy: skipping auto-claim');
      return false;
    }

    // Future strategies can be added here:
    // case ClaimStrategy.TIME_BASED:
    // case ClaimStrategy.VALUE_BASED:
    // case ClaimStrategy.HYBRID:

    default: {
      logger.warn(`Unknown claim strategy: ${strategy}, falling back to AUTO`);

      // Fallback to AUTO behavior
      const solThreshold = config.autoClaimSolThreshold || 0.1;
      const orbThreshold = isStaking
        ? config.autoClaimStakingOrbThreshold || 0.5
        : config.autoClaimOrbThreshold || 1.0;

      return claimableSol >= solThreshold || claimableOrb >= orbThreshold;
    }
  }
}

/**
 * Validate deployment strategy configuration
 *
 * Ensures all required parameters are present for the selected strategy
 */
export function validateDeploymentStrategy(
  config: DeploymentStrategyConfig
): { valid: boolean; error?: string } {
  switch (config.strategy) {
    case DeploymentAmountStrategy.MANUAL:
      if (!config.manualAmountPerRound || config.manualAmountPerRound <= 0) {
        return {
          valid: false,
          error: 'MANUAL strategy requires manualAmountPerRound > 0',
        };
      }
      break;

    case DeploymentAmountStrategy.FIXED_ROUNDS:
      if (!config.targetRounds || config.targetRounds <= 0) {
        return {
          valid: false,
          error: 'FIXED_ROUNDS strategy requires targetRounds > 0',
        };
      }
      break;

    case DeploymentAmountStrategy.PERCENTAGE:
      if (!config.budgetPercentagePerRound || config.budgetPercentagePerRound <= 0) {
        return {
          valid: false,
          error: 'PERCENTAGE strategy requires budgetPercentagePerRound > 0',
        };
      }
      if (config.budgetPercentagePerRound > 100) {
        return {
          valid: false,
          error: 'PERCENTAGE strategy: budgetPercentagePerRound cannot exceed 100%',
        };
      }
      break;

  }

  return { valid: true };
}

/**
 * Get human-readable description of current strategy
 */
export function getStrategyDescription(
  calculation: DeploymentCalculation
): string {
  return `${calculation.notes} • ${calculation.solPerRound.toFixed(4)} SOL/round • ~${calculation.estimatedRounds} rounds`;
}
