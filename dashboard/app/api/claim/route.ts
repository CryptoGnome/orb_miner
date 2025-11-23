import { NextResponse } from 'next/server';

/**
 * Manual Claim API Endpoint
 *
 * Allows users to trigger claims manually when CLAIM_STRATEGY is set to 'manual'.
 * This endpoint executes the claim command and returns the results.
 */
export async function POST(request: Request) {
  try {
    const { claimCommand } = await import('../../../../src/commands/claim');

    // Execute the claim command
    await claimCommand();

    return NextResponse.json({
      success: true,
      message: 'Claim executed successfully',
    });
  } catch (error: any) {
    console.error('Manual claim failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to execute claim',
      },
      { status: 500 }
    );
  }
}

/**
 * Get claimable amounts (for display on dashboard)
 */
export async function GET() {
  try {
    const { getWallet } = await import('../../../../src/utils/wallet');
    const { fetchMiner, fetchStake } = await import('../../../../src/utils/accounts');

    const wallet = getWallet();

    // Fetch miner account for mining rewards
    const miner = await fetchMiner(wallet.publicKey);
    const stake = await fetchStake(wallet.publicKey);

    const claimableData = {
      mining: {
        sol: miner ? Number(miner.rewardsSol) / 1e9 : 0,
        orb: miner ? Number(miner.rewardsOre) / 1e9 : 0,
      },
      staking: {
        sol: stake ? Number(stake.rewardsSol) / 1e9 : 0,
        orb: stake ? Number(stake.rewardsOre) / 1e9 : 0,
      },
      total: {
        sol: 0,
        orb: 0,
      },
    };

    // Calculate totals
    claimableData.total.sol = claimableData.mining.sol + claimableData.staking.sol;
    claimableData.total.orb = claimableData.mining.orb + claimableData.staking.orb;

    return NextResponse.json({
      success: true,
      claimable: claimableData,
    });
  } catch (error: any) {
    console.error('Failed to fetch claimable amounts:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch claimable amounts',
      },
      { status: 500 }
    );
  }
}
