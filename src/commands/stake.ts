import { getWallet, getOrbBalance } from '../utils/wallet';
import { fetchStake } from '../utils/accounts';
import { buildStakeInstruction, sendAndConfirmTransaction } from '../utils/program';
import { config } from '../utils/config';
import logger from '../utils/logger';

export async function stakeCommand(amount?: number): Promise<void> {
  try {
    logger.info('Starting stake process...');

    // Check ORB balance
    const orbBalance = await getOrbBalance();
    logger.info(`Current ORB balance: ${orbBalance.toFixed(2)} ORB`);

    // Use provided amount or default to all available ORB
    const stakeAmount = amount || orbBalance;

    if (stakeAmount <= 0) {
      throw new Error('Stake amount must be greater than 0');
    }

    if (orbBalance < stakeAmount) {
      throw new Error(`Insufficient ORB balance. Need ${stakeAmount} ORB, have ${orbBalance.toFixed(2)} ORB`);
    }

    logger.info(`Staking ${stakeAmount.toFixed(2)} ORB`);

    // Dry run check
    if (config.dryRun) {
      logger.info('[DRY RUN] Would stake transaction here');
      logger.info(`[DRY RUN] Amount: ${stakeAmount.toFixed(2)} ORB`);
      return;
    }

    // Build and send stake instruction
    const stakeIx = buildStakeInstruction(stakeAmount);
    const { signature, fee: actualFee } = await sendAndConfirmTransaction([stakeIx], 'Stake');

    logger.info(`Stake successful!`);
    logger.info(`Transaction: ${signature}`);
    logger.info(`Transaction Fee: ${actualFee.toFixed(6)} SOL`);
    logger.info(`Staked: ${stakeAmount.toFixed(2)} ORB`);

    // Log to transactions file
    logger.info(`[TRANSACTION] Stake | ${stakeAmount.toFixed(2)} ORB | Fee: ${actualFee.toFixed(6)} SOL | ${signature}`);

    // Show updated stake info
    const wallet = getWallet();
    const stake = await fetchStake(wallet.publicKey);
    if (stake) {
      const totalStaked = Number(stake.balance) / 1e9;
      logger.info(`Total staked balance: ${totalStaked.toFixed(2)} ORB`);
    }
  } catch (error) {
    logger.error('Stake command failed:', error);
    throw error;
  }
}
