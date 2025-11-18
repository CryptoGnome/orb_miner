import { getWallet } from '../src/utils/wallet';
import { getConnection } from '../src/utils/solana';
import { getStakePDA, fetchStake } from '../src/utils/accounts';
import { config } from '../src/utils/config';

/**
 * Test script to diagnose staking rewards reading
 *
 * This script will:
 * 1. Fetch the stake account for your wallet
 * 2. Show raw account data (hex dump)
 * 3. Parse and display all stake account fields
 * 4. Verify PDA derivation is correct
 * 5. Compare with what the bot is reading
 *
 * Run with: npx ts-node tests/test-stake-rewards.ts
 */

function hexDump(buffer: Buffer, bytesPerLine = 16): string {
  let result = '';
  for (let i = 0; i < buffer.length; i += bytesPerLine) {
    const slice = buffer.slice(i, i + bytesPerLine);
    const offset = i.toString(16).padStart(8, '0');
    const hex = slice.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
    const ascii = slice
      .toString('ascii')
      .replace(/[^\x20-\x7E]/g, '.');
    result += `${offset}  ${hex.padEnd(bytesPerLine * 3, ' ')} ${ascii}\n`;
  }
  return result;
}

async function main() {
  console.log('============================================================');
  console.log('Staking Rewards Diagnostic Test');
  console.log('============================================================\n');

  try {
    const wallet = getWallet();
    const connection = getConnection();

    console.log(`Wallet: ${wallet.publicKey.toBase58()}\n`);

    // Step 1: Derive Stake PDA
    console.log('--- Step 1: Deriving Stake PDA ---');
    const [stakePDA, stakeBump] = getStakePDA(wallet.publicKey);
    console.log(`Stake PDA: ${stakePDA.toBase58()}`);
    console.log(`Bump: ${stakeBump}`);
    console.log(`Program ID: ${config.orbProgramId.toBase58()}\n`);

    // Step 2: Fetch raw account info
    console.log('--- Step 2: Fetching Raw Account Info ---');
    const accountInfo = await connection.getAccountInfo(stakePDA);

    if (!accountInfo) {
      console.log('❌ Stake account does NOT exist');
      console.log('\nPossible reasons:');
      console.log('1. You have never staked ORB tokens');
      console.log('2. The PDA derivation is incorrect');
      console.log('3. Wrong program ID in config\n');
      console.log('Action: Try staking some ORB first using the stake command:');
      console.log('  npx ts-node src/index.ts stake --amount 1\n');
      return;
    }

    console.log('✅ Stake account exists!');
    console.log(`Account owner: ${accountInfo.owner.toBase58()}`);
    console.log(`Account lamports: ${accountInfo.lamports}`);
    console.log(`Account data length: ${accountInfo.data.length} bytes\n`);

    // Step 3: Show raw hex dump
    console.log('--- Step 3: Raw Account Data (Hex Dump) ---');
    console.log(hexDump(accountInfo.data));

    // Step 4: Parse account data manually
    console.log('--- Step 4: Manual Parsing ---');
    const data = accountInfo.data;
    let offset = 0;

    // Discriminator (8 bytes)
    const discriminator = data.slice(offset, offset + 8);
    console.log(`Discriminator (8 bytes): ${discriminator.toString('hex')}`);
    offset += 8;

    // Authority (32 bytes)
    const authorityBytes = data.slice(offset, offset + 32);
    console.log(`Authority (32 bytes): ${authorityBytes.toString('hex')}`);
    offset += 32;

    // Balance (u64, 8 bytes) - staked amount
    const balanceLE = data.slice(offset, offset + 8);
    const balance = balanceLE.readBigUInt64LE(0);
    console.log(`Balance (u64): ${balance} lamports = ${(Number(balance) / 1e9).toFixed(6)} ORB (staked)`);
    offset += 8;

    // last_claim_at (i64, 8 bytes)
    const lastClaimAt = data.readBigInt64LE(offset);
    console.log(`Last Claim At (i64): ${lastClaimAt}`);
    offset += 8;

    // last_deposit_at (i64, 8 bytes)
    const lastDepositAt = data.readBigInt64LE(offset);
    console.log(`Last Deposit At (i64): ${lastDepositAt}`);
    offset += 8;

    // last_withdraw_at (i64, 8 bytes)
    const lastWithdrawAt = data.readBigInt64LE(offset);
    console.log(`Last Withdraw At (i64): ${lastWithdrawAt}`);
    offset += 8;

    // rewards_factor (Numeric/I80F48, 16 bytes)
    const rewardsFactor = data.slice(offset, offset + 16);
    console.log(`Rewards Factor (16 bytes): ${rewardsFactor.toString('hex')}`);
    offset += 16;

    // rewards (u64, 8 bytes) - CLAIMABLE ORB REWARDS!
    const rewardsLE = data.slice(offset, offset + 8);
    const rewards = rewardsLE.readBigUInt64LE(0);
    console.log(`Claimable Rewards (u64): ${rewards} lamports = ${(Number(rewards) / 1e9).toFixed(6)} ORB ⭐`);
    offset += 8;

    // lifetime_rewards (u64, 8 bytes)
    const lifetimeRewardsLE = data.slice(offset, offset + 8);
    const lifetimeRewards = lifetimeRewardsLE.readBigUInt64LE(0);
    console.log(`Lifetime Rewards (u64): ${lifetimeRewards} lamports = ${(Number(lifetimeRewards) / 1e9).toFixed(6)} ORB`);
    offset += 8;

    // Check if there are more bytes (account is 112 bytes total)
    if (offset < data.length) {
      console.log(`\n⚠️  Additional data found! ${data.length - offset} bytes remaining`);
      console.log(`Offset ${offset}-${data.length}:`);

      // Try reading as different types
      const remainingBytes = data.slice(offset);
      console.log(`  Raw hex: ${remainingBytes.toString('hex')}`);

      if (remainingBytes.length >= 8) {
        const possibleU64 = remainingBytes.readBigUInt64LE(0);
        console.log(`  As u64: ${possibleU64} = ${(Number(possibleU64) / 1e9).toFixed(9)} ORB`);
        console.log(`  As i64: ${remainingBytes.readBigInt64LE(0)}`);
      }

      if (remainingBytes.length >= 4) {
        const possibleU32 = remainingBytes.readUInt32LE(0);
        console.log(`  As u32: ${possibleU32}`);
      }

      if (remainingBytes.length >= 1) {
        const possibleBool = remainingBytes.readUInt8(0);
        console.log(`  As bool/u8: ${possibleBool}`);
      }

      offset = data.length;
    }

    console.log(`\nTotal bytes parsed: ${offset} / ${data.length}`);

    // Step 5: Compare with fetchStake()
    console.log('\n--- Step 5: Testing fetchStake() Function ---');
    const stake = await fetchStake(wallet.publicKey);

    if (!stake) {
      console.log('❌ fetchStake() returned NULL!');
      console.log('\nThis is the problem! The bot cannot read the stake account.');
      console.log('Possible issues:');
      console.log('1. fetchStake() is catching and ignoring an error');
      console.log('2. The parsing logic in accounts.ts has wrong offsets');
      console.log('3. PDA derivation mismatch\n');
    } else {
      console.log('✅ fetchStake() returned data:');
      console.log(`  Authority: ${stake.authority.toBase58()}`);
      console.log(`  Balance: ${(Number(stake.balance) / 1e9).toFixed(6)} ORB`);
      console.log(`  Claimable SOL: ${(Number(stake.rewardsSol) / 1e9).toFixed(6)} SOL`);
      console.log(`  Claimable ORB: ${(Number(stake.rewardsOre) / 1e9).toFixed(6)} ORB`);
      console.log(`  Lifetime SOL: ${(Number(stake.lifetimeRewardsSol) / 1e9).toFixed(6)} SOL`);
      console.log(`  Lifetime ORB: ${(Number(stake.lifetimeRewardsOre) / 1e9).toFixed(6)} ORB\n`);

      // Compare values
      const claimableOrb = Number(stake.rewardsOre) / 1e9;
      const manualClaimableOrb = Number(rewards) / 1e9;

      if (Math.abs(claimableOrb - manualClaimableOrb) < 0.000001) {
        console.log('✅ MATCH! fetchStake() reads the same value as manual parsing');
      } else {
        console.log('❌ MISMATCH!');
        console.log(`  Manual parsing: ${manualClaimableOrb.toFixed(6)} ORB`);
        console.log(`  fetchStake(): ${claimableOrb.toFixed(6)} ORB`);
        console.log('\nThe parsing offsets in accounts.ts may be incorrect!\n');
      }
    }

    // Step 6: Check against threshold
    console.log('--- Step 6: Threshold Check ---');
    const claimableOrb = Number(rewards) / 1e9;
    console.log(`Claimable ORB: ${claimableOrb.toFixed(6)}`);
    console.log(`Threshold: ${config.autoClaimStakingOrbThreshold}`);

    if (claimableOrb >= config.autoClaimStakingOrbThreshold) {
      console.log('✅ Claimable rewards are ABOVE threshold - should be claimed!');
    } else {
      console.log('⏳ Claimable rewards are below threshold - waiting...');
    }

    console.log('\n============================================================');
    console.log('Diagnostic Complete');
    console.log('============================================================');

  } catch (error) {
    console.error('\n❌ Error during diagnostic:', error);
    if (error instanceof Error) {
      console.error(`Message: ${error.message}`);
      console.error(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

main();
