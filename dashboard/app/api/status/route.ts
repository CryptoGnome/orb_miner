import { NextResponse } from 'next/server';
import { ensureBotInitialized } from '@/lib/init-bot';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '@bot/utils/config';
import { fetchBoard, fetchMiner, fetchStake, fetchTreasury } from '@bot/utils/accounts';
import { getBalances } from '@bot/utils/wallet';
import { getOrbPrice } from '@bot/utils/jupiter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Ensure bot utilities are initialized
    await ensureBotInitialized();

    const connection = new Connection(config.rpcUrl);
    const walletPublicKey = new PublicKey(config.walletPublicKey);

    // Fetch blockchain data in parallel
    const [board, miner, stake, treasury, walletBalances, orbPrice] = await Promise.all([
      fetchBoard(connection),
      fetchMiner(connection, walletPublicKey),
      fetchStake(connection, walletPublicKey).catch(() => null),
      fetchTreasury(connection),
      getBalances(connection, walletPublicKey),
      getOrbPrice().catch(() => ({ priceInSol: 0, priceInUsd: 0 })),
    ]);

    // Calculate claimable rewards
    const claimableSol = miner ? Number(miner.claimableSol) / 1e9 : 0;
    const claimableOrb = miner ? Number(miner.claimableOrb) / 1e11 : 0;
    const stakedOrb = stake ? Number(stake.balance) / 1e11 : 0;
    const claimableStakingRewards = stake ? Number(stake.claimable) / 1e11 : 0;

    // Calculate automation balance (if automation account exists)
    let automationBalance = 0;
    if (miner && miner.automation) {
      try {
        const automationAccountInfo = await connection.getAccountInfo(miner.automation);
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
        motherload: treasury ? Number(treasury.motherload) / 1e11 : 0,
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
        stakingRewards: claimableStakingRewards,
      },

      // Staking info
      staking: {
        stakedOrb,
        claimableRewards: claimableStakingRewards,
      },

      // Price info
      prices: {
        orbPriceUsd: orbPrice.priceInUsd,
        orbPriceSol: orbPrice.priceInSol,
      },

      // Miner stats
      miner: miner ? {
        totalDeployed: Number(miner.totalDeployed) / 1e9,
        totalClaimed: Number(miner.totalClaimed) / 1e9,
        hasAutomation: !!miner.automation,
      } : null,

      // Treasury info
      treasury: treasury ? {
        totalStaked: Number(treasury.totalStaked) / 1e11,
        totalUnclaimed: Number(treasury.totalUnclaimed) / 1e11,
      } : null,
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
