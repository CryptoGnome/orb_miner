import { getWallet } from '../src/utils/wallet';
import { fetchStake, fetchTreasury, calculateAccruedStakingRewards } from '../src/utils/accounts';
import { PublicKey } from '@solana/web3.js';

/**
 * Test accrued staking rewards calculation
 * This should match the value shown on the official ORB site
 */

async function main() {
  try {
    const wallet = getWallet();
    const walletPublicKey = new PublicKey(wallet.publicKey.toBase58());

    console.log('=== Accrued Staking Rewards Test ===\n');

    const [stake, treasury] = await Promise.all([
      fetchStake(walletPublicKey),
      fetchTreasury()
    ]);

    if (!stake) {
      console.log('❌ No stake account found');
      return;
    }

    if (!treasury) {
      console.log('❌ Treasury account not found');
      return;
    }

    console.log('Staked Balance:', (Number(stake.balance) / 1e9).toFixed(9), 'ORB');
    console.log('');

    console.log('On-Chain Settled Rewards:', (Number(stake.rewardsOre) / 1e9).toFixed(9), 'ORB');
    console.log('  (This is what\'s in your Stake account now)');
    console.log('');

    const accrued = calculateAccruedStakingRewards(
      treasury.stakeRewardsFactor,
      stake.rewardsFactor,
      stake.balance
    );

    console.log('Calculated Accrued Rewards:', (Number(accrued) / 1e9).toFixed(9), 'ORB');
    console.log('  (This is calculated from Treasury factors)');
    console.log('');

    console.log('Expected from official site: 0.083555704 ORB');
    console.log('');

    const match = Math.abs((Number(accrued) / 1e9) - 0.083555704) < 0.000000001;
    if (match) {
      console.log('✅ SUCCESS! Calculation matches official site');
    } else {
      console.log('⚠️  Values differ - may need to check calculation logic');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
