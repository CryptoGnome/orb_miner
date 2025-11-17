import { getWallet, getBalances } from '../utils/wallet';
import { fetchBoard, fetchRound, fetchMiner, fetchStake, fetchTreasury } from '../utils/accounts';
import { getOrbPrice } from '../utils/jupiter';
import { getCurrentSlot } from '../utils/solana';
import logger from '../utils/logger';

export async function queryCommand(): Promise<void> {
  try {
    logger.info('='.repeat(60));
    logger.info('Querying ORB Mining Bot Status');
    logger.info('='.repeat(60));

    const wallet = getWallet();
    logger.info(`Wallet: ${wallet.publicKey.toBase58()}`);
    logger.info('');

    // Fetch wallet balances
    logger.info('Fetching wallet balances...');
    const balances = await getBalances();
    logger.info(`Wallet SOL Balance: ${balances.sol.toFixed(4)} SOL`);
    logger.info(`Wallet ORB Balance: ${balances.orb.toFixed(2)} ORB`);
    logger.info('');

    // Fetch ORB price
    logger.info('Fetching ORB price...');
    const price = await getOrbPrice();
    logger.info(`ORB Price: ${price.priceInSol.toFixed(6)} SOL | $${price.priceInUsd.toFixed(4)} USD`);
    logger.info('');

    // Fetch Board (current round info)
    logger.info('Fetching current round info...');
    const board = await fetchBoard();
    const currentSlot = await getCurrentSlot();
    logger.info(`Current Round ID: ${board.roundId.toString()}`);
    logger.info(`Round Start Slot: ${board.startSlot.toString()}`);
    logger.info(`Round End Slot: ${board.endSlot.toString()}`);
    logger.info(`Current Slot: ${currentSlot}`);

    const slotsRemaining = board.endSlot.toNumber() - currentSlot;
    const timeRemainingSeconds = slotsRemaining * 0.4; // ~400ms per slot
    logger.info(`Slots Remaining: ${slotsRemaining} (~${Math.floor(timeRemainingSeconds / 60)} minutes)`);
    logger.info('');

    // Fetch Treasury (global motherload info)
    logger.info('Fetching global motherload...');
    const treasury = await fetchTreasury();
    const motherloadOrb = Number(treasury.motherlode) / 1e9; // Convert to ORB
    logger.info(`Global Motherload: ${motherloadOrb.toFixed(2)} ORB`);

    // Fetch Round (round-specific info)
    logger.info('Fetching round details...');
    const round = await fetchRound(board.roundId);
    const totalDeployedSol = Number(round.totalDeployed) / 1e9; // Convert to SOL
    logger.info(`Total Deployed This Round: ${totalDeployedSol.toFixed(4)} SOL`);
    logger.info('');

    // Fetch Miner account (your mining info)
    logger.info('Fetching mining rewards...');
    const miner = await fetchMiner(wallet.publicKey);
    if (miner) {
      const miningSol = Number(miner.rewardsSol) / 1e9;
      const miningOrb = Number(miner.rewardsOre) / 1e9;
      const lifetimeSol = Number(miner.lifetimeRewardsSol) / 1e9;
      const lifetimeOrb = Number(miner.lifetimeRewardsOre) / 1e9;

      logger.info(`Mining Rewards (Claimable):`);
      logger.info(`  SOL: ${miningSol.toFixed(4)} SOL`);
      logger.info(`  ORB: ${miningOrb.toFixed(2)} ORB`);
      logger.info(`Lifetime Mining Rewards:`);
      logger.info(`  SOL: ${lifetimeSol.toFixed(4)} SOL`);
      logger.info(`  ORB: ${lifetimeOrb.toFixed(2)} ORB`);

      // Show deployed amounts per square
      logger.info(`Current Deployments:`);
      let totalDeployed = 0;
      for (let i = 0; i < 25; i++) {
        const deployed = Number(miner.deployed[i]) / 1e9;
        if (deployed > 0) {
          totalDeployed += deployed;
        }
      }
      logger.info(`  Total Deployed: ${totalDeployed.toFixed(4)} SOL across squares`);
    } else {
      logger.info('No miner account found (not initialized yet)');
    }
    logger.info('');

    // Fetch Stake account (staking info)
    logger.info('Fetching staking rewards...');
    const stake = await fetchStake(wallet.publicKey);
    if (stake) {
      const stakingSol = Number(stake.rewardsSol) / 1e9;
      const stakingOrb = Number(stake.rewardsOre) / 1e9;
      const stakedBalance = Number(stake.balance) / 1e9;
      const lifetimeStakingSol = Number(stake.lifetimeRewardsSol) / 1e9;
      const lifetimeStakingOrb = Number(stake.lifetimeRewardsOre) / 1e9;

      logger.info(`Staked Balance: ${stakedBalance.toFixed(2)} ORB`);
      logger.info(`Staking Rewards (Claimable):`);
      logger.info(`  SOL: ${stakingSol.toFixed(4)} SOL`);
      logger.info(`  ORB: ${stakingOrb.toFixed(2)} ORB`);
      logger.info(`Lifetime Staking Rewards:`);
      logger.info(`  SOL: ${lifetimeStakingSol.toFixed(4)} SOL`);
      logger.info(`  ORB: ${lifetimeStakingOrb.toFixed(2)} ORB`);
    } else {
      logger.info('No stake account found (no staking yet)');
    }

    logger.info('');
    logger.info('='.repeat(60));
  } catch (error) {
    logger.error('Query command failed:', error);
    throw error;
  }
}
