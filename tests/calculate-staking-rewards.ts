import { getWallet } from '../src/utils/wallet';
import { getConnection } from '../src/utils/solana';
import { getStakePDA } from '../src/utils/accounts';

/**
 * Calculate staking rewards by decoding the rewards_factor field
 * This mimics how the ORB UI calculates claimable yield
 *
 * Run with: npx ts-node tests/calculate-staking-rewards.ts
 */

// Decode I80F48 fixed-point number (16 bytes)
// I80F48 = 80-bit integer, 48-bit fractional
// Value = raw_value / 2^48
function decodeI80F48(buffer: Buffer, offset: number): number {
  // Read 16 bytes as a signed 128-bit number in little-endian
  // JavaScript can't handle 128-bit integers directly, so we use BigInt

  // Read the bytes
  const bytes = buffer.slice(offset, offset + 16);

  // Convert to BigInt (little-endian)
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }

  // Check if negative (sign bit is the 127th bit)
  const isNegative = (bytes[15] & 0x80) !== 0;
  if (isNegative) {
    // Two's complement for negative numbers
    value = value - (1n << 128n);
  }

  // Divide by 2^48 to get the actual value
  const divisor = 1n << 48n; // 2^48
  const integerPart = value / divisor;
  const fractionalPart = value % divisor;

  // Convert to JavaScript number
  const result = Number(integerPart) + Number(fractionalPart) / Number(divisor);

  return result;
}

async function main() {
  console.log('============================================================');
  console.log('Calculate Staking Rewards from rewards_factor');
  console.log('============================================================\n');

  try {
    const wallet = getWallet();
    const connection = getConnection();
    const [stakePDA] = getStakePDA(wallet.publicKey);

    console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`Stake PDA: ${stakePDA.toBase58()}\n`);

    // Fetch stake account
    console.log('Fetching stake account...');
    const accountInfo = await connection.getAccountInfo(stakePDA);

    if (!accountInfo) {
      console.log('❌ No stake account found\n');
      return;
    }

    console.log('✅ Stake account exists\n');

    const data = accountInfo.data;
    let offset = 8; // Skip discriminator

    // Skip authority (32 bytes)
    offset += 32;

    // Read balance (staked amount)
    const balanceLE = data.slice(offset, offset + 8);
    const balance = balanceLE.readBigUInt64LE(0);
    const stakedOrb = Number(balance) / 1e9;
    console.log(`Staked Amount: ${stakedOrb.toFixed(6)} ORB`);
    offset += 8;

    // Read last_claim_at
    const lastClaimAt = data.readBigInt64LE(offset);
    console.log(`Last Claim At: ${lastClaimAt} (Unix timestamp)`);
    offset += 8;

    // Skip last_deposit_at and last_withdraw_at
    offset += 8 + 8;

    // Read rewards_factor (I80F48, 16 bytes)
    console.log('\nRewards Factor (raw bytes):');
    const rewardsFactorBytes = data.slice(offset, offset + 16);
    console.log(`  Hex: ${rewardsFactorBytes.toString('hex')}`);

    const rewardsFactor = decodeI80F48(data, offset);
    console.log(`  Decoded: ${rewardsFactor}`);
    console.log(`  Scientific: ${rewardsFactor.toExponential(6)}`);
    offset += 16;

    // Read claimable rewards from account
    const rewardsLE = data.slice(offset, offset + 8);
    const rewardsInAccount = rewardsLE.readBigUInt64LE(0);
    const claimableFromAccount = Number(rewardsInAccount) / 1e9;
    console.log(`\nClaimable (from account field): ${claimableFromAccount.toFixed(6)} ORB`);
    offset += 8;

    // Read lifetime rewards
    const lifetimeRewardsLE = data.slice(offset, offset + 8);
    const lifetimeRewards = lifetimeRewardsLE.readBigUInt64LE(0);
    console.log(`Lifetime Rewards: ${(Number(lifetimeRewards) / 1e9).toFixed(6)} ORB\n`);

    // Calculate accrued rewards
    // Formula (guessing based on typical staking contracts):
    // accrued = (current_time - last_claim_at) * staked_amount * rewards_factor

    const currentTime = BigInt(Math.floor(Date.now() / 1000)); // Current Unix timestamp
    const timeSinceLastClaim = Number(currentTime - lastClaimAt);

    console.log('=== Calculating Accrued Rewards ===');
    console.log(`Current Time: ${currentTime}`);
    console.log(`Time Since Last Claim: ${timeSinceLastClaim} seconds (${(timeSinceLastClaim / 3600).toFixed(2)} hours)`);

    // Try different formulas
    console.log('\n--- Formula Attempts ---');

    // Attempt 1: Simple multiplication
    const attempt1 = timeSinceLastClaim * stakedOrb * rewardsFactor;
    console.log(`1. time * staked * factor = ${attempt1.toFixed(9)} ORB`);

    // Attempt 2: Per-second rate
    const attempt2 = (timeSinceLastClaim * stakedOrb * rewardsFactor) / 1e9;
    console.log(`2. (time * staked * factor) / 1e9 = ${attempt2.toFixed(9)} ORB`);

    // Attempt 3: rewards_factor might already include time component
    const attempt3 = stakedOrb * rewardsFactor;
    console.log(`3. staked * factor = ${attempt3.toFixed(9)} ORB`);

    // Attempt 4: Factor might be daily rate
    const daysElapsed = timeSinceLastClaim / 86400;
    const attempt4 = stakedOrb * rewardsFactor * daysElapsed;
    console.log(`4. staked * factor * days = ${attempt4.toFixed(9)} ORB`);

    console.log('\n💡 The UI shows approximately 0.078 ORB claimable');
    console.log('   Compare the formulas above to find the matching calculation\n');

    console.log('============================================================');
    console.log('Calculation Complete');
    console.log('============================================================');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
