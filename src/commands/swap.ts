import { getBalances } from '../utils/wallet';
import { swapOrbToSol, getSwapQuote } from '../utils/jupiter';
import { config } from '../utils/config';
import logger from '../utils/logger';

export async function swapCommand(amount?: number): Promise<void> {
  try {
    logger.info('Starting swap process...');

    if (!config.enableJupiterSwap) {
      throw new Error('Jupiter swap is disabled in config');
    }

    // Check current balances
    const balances = await getBalances();
    logger.info(`Current balances: ${balances.sol.toFixed(4)} SOL, ${balances.orb.toFixed(2)} ORB`);

    // Use provided amount or default to configured swap amount
    const swapAmount = amount || config.swapOrbAmount;

    if (swapAmount <= 0) {
      throw new Error('Swap amount must be greater than 0');
    }

    if (balances.orb < swapAmount) {
      throw new Error(`Insufficient ORB balance. Need ${swapAmount} ORB, have ${balances.orb.toFixed(2)} ORB`);
    }

    // Check if we're keeping minimum ORB
    const remainingOrb = balances.orb - swapAmount;
    if (remainingOrb < config.minOrbToKeep) {
      logger.warn(`Warning: After swap, ORB balance will be ${remainingOrb.toFixed(2)} ORB (below minimum of ${config.minOrbToKeep} ORB)`);
    }

    logger.info(`Swapping ${swapAmount.toFixed(2)} ORB to SOL...`);

    // Get quote first
    const quote = await getSwapQuote(swapAmount, config.slippageBps);
    if (!quote) {
      throw new Error('Failed to get swap quote');
    }

    const expectedSol = Number(quote.outAmount) / 1e9;
    const priceImpact = parseFloat(quote.priceImpactPct);

    logger.info(`Expected output: ${expectedSol.toFixed(4)} SOL`);
    logger.info(`Price impact: ${priceImpact.toFixed(2)}%`);

    // Dry run check
    if (config.dryRun) {
      logger.info('[DRY RUN] Would execute swap here');
      logger.info(`[DRY RUN] ${swapAmount.toFixed(2)} ORB → ${expectedSol.toFixed(4)} SOL`);
      return;
    }

    // Execute swap
    const result = await swapOrbToSol(swapAmount, config.slippageBps);

    if (result.success) {
      logger.info(`Swap successful!`);
      logger.info(`Transaction: ${result.signature}`);
      logger.info(`Swapped: ${swapAmount.toFixed(2)} ORB → ${result.solReceived?.toFixed(4)} SOL`);

      // Log to transactions file
      logger.info(`[TRANSACTION] Swap | ${swapAmount.toFixed(2)} ORB → ${result.solReceived?.toFixed(4)} SOL | ${result.signature}`);

      // Show updated balances
      const newBalances = await getBalances();
      logger.info(`New balances: ${newBalances.sol.toFixed(4)} SOL, ${newBalances.orb.toFixed(2)} ORB`);
    } else {
      throw new Error('Swap failed');
    }
  } catch (error) {
    logger.error('Swap command failed:', error);
    throw error;
  }
}
