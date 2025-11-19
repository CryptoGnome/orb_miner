import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { getConnection } from './solana';
import { config } from './config';
import { Board, Round, Miner, Stake, Treasury } from '../types';
import logger from './logger';

// PDA seeds (from ORE source code)
const BOARD_SEED = Buffer.from('board');
const ROUND_SEED = Buffer.from('round');
const MINER_SEED = Buffer.from('miner');
const STAKE_SEED = Buffer.from('stake');
const TREASURY_SEED = Buffer.from('treasury');
const AUTOMATION_SEED = Buffer.from('automation');
const CONFIG_SEED = Buffer.from('config');

// Helper to deserialize u64 (8 bytes) as BN
function deserializeU64(buffer: Buffer, offset: number): BN {
  return new BN(buffer.slice(offset, offset + 8), 'le');
}

// Helper to deserialize an array of 25 u64 values
function deserializeU64Array25(buffer: Buffer, offset: number): BN[] {
  const array: BN[] = [];
  for (let i = 0; i < 25; i++) {
    array.push(deserializeU64(buffer, offset + i * 8));
  }
  return array;
}

// Helper to calculate accrued staking rewards from I80F48 reward factors
// Formula: (treasuryFactor - stakeFactor) * stakeBalance
// I80F48 has 48 fractional bits, so we need to shift right by 48 after multiplication
export function calculateAccruedStakingRewards(
  treasuryStakeRewardsFactor: Buffer,
  stakeRewardsFactor: Buffer,
  stakeBalance: BN
): BN {
  // Read 16-byte buffers as 128-bit little-endian integers
  // We'll use two 64-bit parts (low and high)
  const treasuryLow = treasuryStakeRewardsFactor.readBigUInt64LE(0);
  const treasuryHigh = treasuryStakeRewardsFactor.readBigUInt64LE(8);
  const treasuryFactor = (treasuryHigh << BigInt(64)) | treasuryLow;

  const stakeLow = stakeRewardsFactor.readBigUInt64LE(0);
  const stakeHigh = stakeRewardsFactor.readBigUInt64LE(8);
  const stakeFactor = (stakeHigh << BigInt(64)) | stakeLow;

  // Calculate difference in factors
  const factorDiff = treasuryFactor - stakeFactor;

  // Multiply by stake balance (which is in lamports, u64)
  const balanceBigInt = BigInt(stakeBalance.toString());
  const result = factorDiff * balanceBigInt;

  // I80F48 has 48 fractional bits, so shift right by 48 to get the integer part
  const accruedLamports = result >> BigInt(48);

  // Convert to BN and ensure non-negative
  return accruedLamports >= BigInt(0) ? new BN(accruedLamports.toString()) : new BN(0);
}

// Get Board PDA
export function getBoardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BOARD_SEED],
    config.orbProgramId
  );
}

// Get Round PDA for a specific round ID
export function getRoundPDA(roundId: BN): [PublicKey, number] {
  const roundIdBuffer = roundId.toArrayLike(Buffer, 'le', 8);
  return PublicKey.findProgramAddressSync(
    [ROUND_SEED, roundIdBuffer],
    config.orbProgramId
  );
}

// Get Miner PDA for a specific authority
export function getMinerPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINER_SEED, authority.toBuffer()],
    config.orbProgramId
  );
}

// Get Stake PDA for a specific authority
export function getStakePDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STAKE_SEED, authority.toBuffer()],
    config.orbProgramId
  );
}

// Get Treasury PDA (singleton)
export function getTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TREASURY_SEED],
    config.orbProgramId
  );
}

// Get Automation PDA for a specific authority
export function getAutomationPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [AUTOMATION_SEED, authority.toBuffer()],
    config.orbProgramId
  );
}

// Get Config PDA (singleton)
export function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    config.orbProgramId
  );
}

// Fetch entropy var address from Config account
export async function fetchEntropyVarAddress(): Promise<PublicKey> {
  const connection = getConnection();
  const [configPDA] = getConfigPDA();

  const accountInfo = await connection.getAccountInfo(configPDA);
  if (!accountInfo || accountInfo.data.length < 144) {
    throw new Error('Config account not found or invalid');
  }

  // Config structure (from IDL):
  // - discriminator: 8 bytes (offset 0)
  // - admin: 32 bytes (offset 8)
  // - bury_authority: 32 bytes (offset 40)
  // - fee_collector: 32 bytes (offset 72)
  // - swap_program: 32 bytes (offset 104)
  // - var_address: 32 bytes (offset 136)
  const varAddress = new PublicKey(accountInfo.data.slice(136, 168));

  return varAddress;
}

// Check if automation account is initialized
export async function isAutomationInitialized(authority: PublicKey): Promise<boolean> {
  try {
    const connection = getConnection();
    const [automationPDA] = getAutomationPDA(authority);
    const accountInfo = await connection.getAccountInfo(automationPDA);
    return accountInfo !== null && accountInfo.data.length > 0;
  } catch (error) {
    logger.debug('Error checking automation account:', error);
    return false;
  }
}

// Fetch and deserialize Board account
export async function fetchBoard(): Promise<Board> {
  const connection = getConnection();
  const [boardPDA] = getBoardPDA();

  logger.debug(`Fetching Board account: ${boardPDA.toBase58()}`);

  const accountInfo = await connection.getAccountInfo(boardPDA);
  if (!accountInfo) {
    throw new Error('Board account not found');
  }

  const data = accountInfo.data;

  // Parse Board structure (based on Rust struct)
  // Assuming: 8-byte discriminator + roundId (8) + startSlot (8) + endSlot (8)
  const board: Board = {
    roundId: deserializeU64(data, 8),
    startSlot: deserializeU64(data, 16),
    endSlot: deserializeU64(data, 24),
  };

  logger.debug(`Board: roundId=${board.roundId.toString()}, startSlot=${board.startSlot.toString()}, endSlot=${board.endSlot.toString()}`);

  return board;
}

// Fetch and deserialize Round account
export async function fetchRound(roundId: BN): Promise<Round> {
  const connection = getConnection();
  const [roundPDA] = getRoundPDA(roundId);

  logger.debug(`Fetching Round account: ${roundPDA.toBase58()} (roundId=${roundId.toString()})`);

  const accountInfo = await connection.getAccountInfo(roundPDA);
  if (!accountInfo) {
    throw new Error(`Round account not found for roundId ${roundId.toString()}`);
  }

  const data = accountInfo.data;

  // Parse Round structure (based on actual Rust struct from ORE)
  // pub struct Round {
  //   pub id: u64,                    // Offset 8
  //   pub deployed: [u64; 25],        // Offset 16-215 (200 bytes)
  //   pub slot_hash: [u8; 32],        // Offset 216-247 (32 bytes)
  //   pub count: [u64; 25],           // Offset 248-447 (200 bytes)
  //   pub expires_at: u64,            // Offset 448
  //   pub motherlode: u64,            // Offset 456 <-- CORRECT
  //   pub rent_payer: Pubkey,         // Offset 464
  //   pub top_miner: Pubkey,          // Offset 496
  //   pub top_miner_reward: u64,      // Offset 528
  //   pub total_deployed: u64,        // Offset 536
  //   pub total_vaulted: u64,         // Offset 544
  //   pub total_winnings: u64,        // Offset 552
  // }

  const round: Round = {
    id: deserializeU64(data, 8),                // Round ID
    deployed: deserializeU64Array25(data, 16),  // SOL deployed per square (200 bytes)
    slotHash: data.slice(216, 248),             // Slot hash (32 bytes)
    expireSlot: deserializeU64(data, 448),      // Expires at
    motherload: deserializeU64(data, 456),      // Motherload (CORRECT OFFSET)
    totalDeployed: deserializeU64(data, 536),   // Total deployed
    totalWinnings: deserializeU64(data, 552),   // Total winnings
  };

  logger.debug(`Round ${round.id.toString()}: motherload=${round.motherload.toString()}, totalDeployed=${round.totalDeployed.toString()}`);

  return round;
}

// Fetch and deserialize Miner account
export async function fetchMiner(authority: PublicKey): Promise<Miner | null> {
  const connection = getConnection();
  const [minerPDA] = getMinerPDA(authority);

  logger.debug(`Fetching Miner account: ${minerPDA.toBase58()}`);

  const accountInfo = await connection.getAccountInfo(minerPDA);
  if (!accountInfo) {
    logger.debug('Miner account not found (not initialized yet)');
    return null;
  }

  const data = accountInfo.data;

  // Parse Miner structure (based on Rust struct)
  let offset = 8; // Skip discriminator

  // Per IDL: authority(32) + deployed(200) + cumulative(200) + checkpoint_fee(8) + checkpoint_id(8) + ...
  const miner: Miner = {
    authority: new PublicKey(data.slice(offset, offset + 32)),
    deployed: deserializeU64Array25(data, offset + 32),        // offset 40, 200 bytes (25 * 8)
    cumulative: deserializeU64Array25(data, offset + 232),     // offset 240, 200 bytes (25 * 8)
    checkpointFee: deserializeU64(data, offset + 432),         // offset 440 (absolute)
    checkpointId: deserializeU64(data, offset + 440),          // offset 448 (absolute) - PER IDL
    lastClaimOreAt: deserializeU64(data, offset + 448),        // offset 456 (absolute), i64
    lastClaimSolAt: deserializeU64(data, offset + 456),        // offset 464 (absolute), i64
    rewardsFactor: deserializeU64(data, offset + 464),         // offset 472 (absolute), Numeric=16 bytes but reading first 8
    rewardsSol: deserializeU64(data, offset + 480),            // offset 488 (absolute), skip 16 for Numeric
    rewardsOre: deserializeU64(data, offset + 488),            // offset 496 (absolute)
    refinedOre: deserializeU64(data, offset + 496),            // offset 504 (absolute)
    roundId: deserializeU64(data, offset + 504),               // offset 512 (absolute) - PER IDL
    lifetimeRewardsSol: deserializeU64(data, offset + 512),    // offset 520 (absolute)
    lifetimeRewardsOre: deserializeU64(data, offset + 520),    // offset 528 (absolute)
  };

  logger.debug(`Miner: roundId=${miner.roundId.toString()}, checkpointId=${miner.checkpointId.toString()}, rewardsSol=${miner.rewardsSol.toString()}, rewardsOre=${miner.rewardsOre.toString()}`);

  return miner;
}

// Fetch and deserialize Stake account
export async function fetchStake(authority: PublicKey): Promise<Stake | null> {
  const connection = getConnection();
  const [stakePDA] = getStakePDA(authority);

  logger.debug(`Fetching Stake account: ${stakePDA.toBase58()}`);

  const accountInfo = await connection.getAccountInfo(stakePDA);
  if (!accountInfo) {
    logger.debug('Stake account not found (no staking yet)');
    return null;
  }

  const data = accountInfo.data;

  // Parse Stake structure (from orb-idl.json)
  // Fields (after 8-byte discriminator):
  // - authority: 32 bytes (Pubkey)
  // - balance: 8 bytes (u64) - staked amount
  // - last_claim_at: 8 bytes (i64)
  // - last_deposit_at: 8 bytes (i64)
  // - last_withdraw_at: 8 bytes (i64)
  // - rewards_factor: 16 bytes (Numeric/I80F48)
  // - rewards: 8 bytes (u64) - CLAIMABLE ORB REWARDS!
  // - lifetime_rewards: 8 bytes (u64)
  // - is_seeker: 8 bytes (u64)
  let offset = 8; // Skip discriminator

  const stakeAuthority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const balance = deserializeU64(data, offset);
  offset += 8;

  // Skip timestamps (last_claim_at, last_deposit_at, last_withdraw_at)
  offset += 8 + 8 + 8; // 24 bytes

  // Read rewards_factor (Numeric = I80F48, 16 bytes)
  const rewardsFactor = data.slice(offset, offset + 16);
  offset += 16;

  // Read claimable rewards (ORB only for staking)
  const rewardsOre = deserializeU64(data, offset);
  offset += 8;

  const lifetimeRewardsOre = deserializeU64(data, offset);

  const stake: Stake = {
    authority: stakeAuthority,
    balance,
    rewardsFactor,
    rewardsSol: new BN(0), // Staking only gives ORB rewards, not SOL
    rewardsOre,
    lifetimeRewardsSol: new BN(0), // Staking only gives ORB rewards
    lifetimeRewardsOre,
  };

  logger.debug(`Stake: balance=${stake.balance.toString()}, claimable ORB=${rewardsOre.toString()}`);

  return stake;
}

// Fetch and deserialize Treasury account (global singleton)
export async function fetchTreasury(): Promise<Treasury> {
  const connection = getConnection();
  const [treasuryPDA] = getTreasuryPDA();

  logger.debug(`Fetching Treasury account: ${treasuryPDA.toBase58()}`);

  const accountInfo = await connection.getAccountInfo(treasuryPDA);
  if (!accountInfo) {
    throw new Error('Treasury account not found');
  }

  const data = accountInfo.data;

  // Parse Treasury structure (based on IDL)
  // pub struct Treasury {
  //   pub balance: u64,                    // Offset 8
  //   pub motherlode: u64,                 // Offset 16
  //   pub miner_rewards_factor: Numeric,   // Offset 24 (16 bytes I80F48)
  //   pub stake_rewards_factor: Numeric,   // Offset 40 (16 bytes I80F48)
  //   pub total_staked: u64,               // Offset 56
  //   pub total_unclaimed: u64,            // Offset 64
  //   pub total_refined: u64,              // Offset 72
  // }

  const treasury: Treasury = {
    balance: deserializeU64(data, 8),              // SOL balance
    motherlode: deserializeU64(data, 16),          // ORE motherlode (GLOBAL)
    minerRewardsFactor: data.slice(24, 40),        // Miner rewards factor (I80F48)
    stakeRewardsFactor: data.slice(40, 56),        // Stake rewards factor (I80F48)
    totalStaked: deserializeU64(data, 56),         // Total staked
    totalUnclaimed: deserializeU64(data, 64),      // Total unclaimed
    totalRefined: deserializeU64(data, 72),        // Total refined
  };

  logger.debug(`Treasury: motherlode=${treasury.motherlode.toString()}, totalStaked=${treasury.totalStaked.toString()}`);

  return treasury;
}

export default {
  getBoardPDA,
  getRoundPDA,
  getMinerPDA,
  getStakePDA,
  getTreasuryPDA,
  getAutomationPDA,
  fetchBoard,
  fetchRound,
  fetchMiner,
  fetchStake,
  fetchTreasury,
};
