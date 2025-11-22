import { TransactionInstruction } from '@solana/web3.js';
import { getWallet } from '../utils/wallet';
import { fetchMiner, fetchStake } from '../utils/accounts';
import { buildClaimSolInstruction, buildClaimOreInstruction, sendAndConfirmTransaction } from '../utils/program';
import { config } from '../utils/config';
import logger from '../utils/logger';

export async function claimCommand(): Promise<void> {
  try {
    logger.info('Starting claim process...');

    const wallet = getWallet();
    const instructions: TransactionInstruction[] = [];
    let totalSolClaimed = 0;
    let totalOrbClaimed = 0;

    // Fetch miner account for mining rewards
    if (config.claimFromMining) {
      logger.info('Checking mining rewards...');
      const miner = await fetchMiner(wallet.publicKey);

      if (miner) {
        const miningSol = Number(miner.rewardsSol) / 1e9;
        const miningOrb = Number(miner.rewardsOre) / 1e9;

        logger.info(`Mining Rewards: ${miningSol.toFixed(4)} SOL, ${miningOrb.toFixed(2)} ORB`);

        // Claim SOL from mining
        if ((config.claimType === 'sol' || config.claimType === 'both') && miningSol > 0) {
          logger.info('Adding claim SOL instruction (mining)');
          instructions.push(buildClaimSolInstruction());
          totalSolClaimed += miningSol;
        }

        // Claim ORB from mining
        if ((config.claimType === 'orb' || config.claimType === 'both') && miningOrb > 0) {
          logger.info('Adding claim ORB instruction (mining)');
          instructions.push(await buildClaimOreInstruction());
          totalOrbClaimed += miningOrb;
        }
      } else {
        logger.info('No miner account found');
      }
    }

    // Fetch stake account for staking rewards
    if (config.claimFromStaking) {
      logger.info('Checking staking rewards...');
      const stake = await fetchStake(wallet.publicKey);

      if (stake) {
        const stakingSol = Number(stake.rewardsSol) / 1e9;
        const stakingOrb = Number(stake.rewardsOre) / 1e9;

        logger.info(`Staking Rewards: ${stakingSol.toFixed(4)} SOL, ${stakingOrb.toFixed(2)} ORB`);

        // Note: Staking claim instructions would be different from mining
        // For now, we'll just report the rewards
        // TODO: Add staking claim instructions when available
        if ((config.claimType === 'sol' || config.claimType === 'both') && stakingSol > 0) {
          logger.info('Staking SOL rewards detected (claim instruction not implemented yet)');
        }

        if ((config.claimType === 'orb' || config.claimType === 'both') && stakingOrb > 0) {
          logger.info('Staking ORB rewards detected (claim instruction not implemented yet)');
        }
      } else {
        logger.info('No stake account found');
      }
    }

    // Check if there are any rewards to claim
    if (instructions.length === 0) {
      logger.info('No rewards to claim');
      return;
    }

    logger.info(`Total to claim: ${totalSolClaimed.toFixed(4)} SOL, ${totalOrbClaimed.toFixed(2)} ORB`);

    // Dry run check
    if (config.dryRun) {
      logger.info('[DRY RUN] Would send claim transaction here');
      logger.info(`[DRY RUN] SOL: ${totalSolClaimed.toFixed(4)}, ORB: ${totalOrbClaimed.toFixed(2)}`);
      return;
    }

    // Send all claim instructions in a single transaction
    const { signature, fee: actualFee } = await sendAndConfirmTransaction(instructions, 'Claim');

    logger.info(`Claim successful!`);
    logger.info(`Transaction: ${signature}`);
    logger.info(`Transaction Fee: ${actualFee.toFixed(6)} SOL`);
    logger.info(`Claimed: ${totalSolClaimed.toFixed(4)} SOL, ${totalOrbClaimed.toFixed(2)} ORB`);

    // Log to transactions file
    logger.info(`[TRANSACTION] Claim | ${totalSolClaimed.toFixed(4)} SOL, ${totalOrbClaimed.toFixed(2)} ORB | Fee: ${actualFee.toFixed(6)} SOL | ${signature}`);
  } catch (error) {
    logger.error('Claim command failed:', error);
    throw error;
  }
}
