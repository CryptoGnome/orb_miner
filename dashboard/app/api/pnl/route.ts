import { NextResponse } from 'next/server';
import { ensureBotInitialized } from '@/lib/init-bot';
import { getImprovedPnLSummary } from '@bot/utils/database';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '@bot/utils/config';
import { fetchMiner, fetchStake, getAutomationPDA } from '@bot/utils/accounts';
import { getWallet, getBalances } from '@bot/utils/wallet';
import { getOrbPrice } from '@bot/utils/jupiter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Ensure bot utilities are initialized
    await ensureBotInitialized();

    const connection = new Connection(config.rpcEndpoint);
    const wallet = getWallet();
    const walletPublicKey = new PublicKey(wallet.publicKey.toBase58());

    // Fetch all required data in parallel
    const [miner, stake, walletBalances, orbPrice] = await Promise.all([
      fetchMiner(walletPublicKey),
      fetchStake(walletPublicKey).catch(() => null),
      getBalances(walletPublicKey),
      getOrbPrice().catch(() => ({ priceInSol: 0, priceInUsd: 0 })),
    ]);

    // Calculate values needed for PnL
    const currentPendingSol = miner ? Number(miner.rewardsSol) / 1e9 : 0;
    const currentPendingOrb = miner ? Number(miner.rewardsOre) / 1e9 : 0;
    const currentStakedOrb = stake ? Number(stake.balance) / 1e9 : 0;

    // Calculate automation balance
    let currentAutomationSol = 0;
    if (miner) {
      try {
        const [automationPDA] = getAutomationPDA(walletPublicKey);
        const automationAccountInfo = await connection.getAccountInfo(automationPDA);
        if (automationAccountInfo) {
          currentAutomationSol = automationAccountInfo.lamports / 1e9;
        }
      } catch (error) {
        console.error('Error fetching automation balance:', error);
      }
    }

    const pnlSummary = await getImprovedPnLSummary(
      walletBalances.sol,
      currentAutomationSol,
      currentPendingSol,
      currentPendingOrb,
      walletBalances.orb,
      currentStakedOrb,
      orbPrice.priceInSol
    );

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...pnlSummary,
    });
  } catch (error) {
    console.error('Error fetching PnL:', error);
    return NextResponse.json(
      { error: 'Failed to fetch PnL', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
