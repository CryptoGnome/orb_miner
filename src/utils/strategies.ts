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
 * Calculate optimal rounds based on motherload (AUTO strategy)
 *
 * Monte Carlo optimized tiers for maximum ROI.
 * This is the existing logic from smartBot.ts
 */
function calculateTargetRoundsAuto(motherloadOrb: number): number {
  if (motherloadOrb >= 1200) return 60;
  if (motherloadOrb >= 1100) return 90;
  if (motherloadOrb >= 1000) return 120;
  if (motherloadOrb >= 900) return 160;
  if (motherloadOrb >= 800) return 200;
  if (motherloadOrb >= 700) return 240;
  if (motherloadOrb >= 600) return 280;
  if (motherloadOrb >= 500) return 320;
  if (motherloadOrb >= 400) return 360;
  if (motherloadOrb >= 300) return 400;
  if (motherloadOrb >= 200) return 440;
  return 880;
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
      // Original automatic calculation based on motherload tiers
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
        notes: `Auto-calculated: ${targetRounds} rounds based on ${motherloadOrb.toFixed(2)} ORB motherload`,
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
