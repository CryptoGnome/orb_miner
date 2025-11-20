import { NextResponse } from 'next/server';
import { ensureBotInitialized } from '@/lib/init-bot';
import { Connection, PublicKey } from '@solana/web3.js';
import { config, loadAndCacheConfig } from '@bot/utils/config';
import { fetchBoard, fetchMiner, fetchStake, fetchTreasury, getAutomationPDA, calculateAccruedStakingRewards } from '@bot/utils/accounts';
import { getWallet, getBalances } from '@bot/utils/wallet';
import { getOrbPrice } from '@bot/utils/jupiter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Ensure bot utilities are initialized
    await ensureBotInitialized();

    // Load configuration from database
    await loadAndCacheConfig();

    const connection = new Connection(config.rpcEndpoint);
    const wallet = getWallet();
    // Create a fresh PublicKey instance from the string to avoid toBuffer() issues
    const walletPublicKey = new PublicKey(wallet.publicKey.toBase58());

    // Fetch blockchain data in parallel
    const [board, miner, stake, treasury, walletBalances, orbPrice] = await Promise.all([
      fetchBoard(),
      fetchMiner(walletPublicKey),
      fetchStake(walletPublicKey).catch(() => null),
      fetchTreasury(),
      getBalances(walletPublicKey),
      getOrbPrice().catch(() => ({ priceInSol: 0, priceInUsd: 0 })),
    ]);

    // Calculate claimable rewards
    const claimableSol = miner ? Number(miner.rewardsSol) / 1e9 : 0;
    const claimableOrb = miner ? Number(miner.rewardsOre) / 1e9 : 0;
    const stakedOrb = stake ? Number(stake.balance) / 1e9 : 0;
    const claimableStakingRewardsSol = stake ? Number(stake.rewardsSol) / 1e9 : 0;
    const claimableStakingRewardsOre = stake ? Number(stake.rewardsOre) / 1e9 : 0;

    // Calculate accrued (unsettled) staking rewards using I80F48 reward factors
    let accruedStakingRewardsOre = 0;
    if (stake && treasury) {
      const accruedLamports = calculateAccruedStakingRewards(
        treasury.stakeRewardsFactor,
        stake.rewardsFactor,
        stake.balance
      );
      accruedStakingRewardsOre = Number(accruedLamports) / 1e9;
    }

    // Calculate automation balance (if automation account exists)
    let automationBalance = 0;
    if (miner) {
      try {
        const [automationPDA] = getAutomationPDA(walletPublicKey);
        const automationAccountInfo = await connection.getAccountInfo(automationPDA);
        if (automationAccountInfo) {
          automationBalance = automationAccountInfo.lamports / 1e9;
        }
      } catch (error) {
        console.error('Error fetching automation balance:', error);
      }
    }

    const status = {
      timestamp: new Date().toISOString(),

      // Current round info
      round: {
        id: board.roundId.toString(),
        motherlode: treasury ? Number(treasury.motherlode) / 1e9 : 0,
        startSlot: board.startSlot.toString(),
        endSlot: board.endSlot.toString(),
      },

      // Wallet balances
      balances: {
        sol: walletBalances.sol,
        orb: walletBalances.orb,
        automationSol: automationBalance,
      },

      // Claimable rewards
      claimable: {
        sol: claimableSol,
        orb: claimableOrb,
        stakingRewardsSol: claimableStakingRewardsSol,
        stakingRewardsOrb: claimableStakingRewardsOre,
      },

      // Staking info
      staking: {
        stakedOrb,
        claimableRewardsSol: claimableStakingRewardsSol,
        claimableRewardsOrb: claimableStakingRewardsOre,
        accruedRewardsOrb: accruedStakingRewardsOre, // Accrued but not yet settled
      },

      // Price info
      prices: {
        orbPriceUsd: orbPrice.priceInUsd,
        orbPriceSol: orbPrice.priceInSol,
      },

      // Miner stats
      miner: miner ? {
        lifetimeRewardsSol: Number(miner.lifetimeRewardsSol) / 1e9,
        lifetimeRewardsOre: Number(miner.lifetimeRewardsOre) / 1e9,
        hasAutomation: automationBalance > 0,
      } : null,

      // Treasury info
      treasury: treasury ? {
        totalStaked: Number(treasury.totalStaked) / 1e9,
        totalUnclaimed: Number(treasury.totalUnclaimed) / 1e9,
      } : null,

      // Automation info
      automation: {
        isActive: automationBalance > 0,
        balance: automationBalance,
        motherloadThreshold: config.motherloadThreshold,
      },

      // Bot status - determine if bot is mining, waiting, or idle
      botStatus: (() => {
        if (automationBalance === 0) return 'idle';

        const currentMotherlode = treasury ? Number(treasury.motherlode) / 1e9 : 0;
        const isAboveThreshold = currentMotherlode >= config.motherloadThreshold;

        // Bot is waiting if automation is active but motherload is below threshold
        if (!isAboveThreshold) return 'waiting';

        // If above threshold and automation is active, assume mining
        return 'mining';
      })(),
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
