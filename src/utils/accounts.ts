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

  const miner: Miner = {
    authority: new PublicKey(data.slice(offset, offset + 32)),
    deployed: deserializeU64Array25(data, offset + 32),        // 200 bytes
    cumulative: deserializeU64Array25(data, offset + 232),     // 200 bytes
    roundId: deserializeU64(data, offset + 432),
    checkpointFee: deserializeU64(data, offset + 440),
    checkpointId: deserializeU64(data, offset + 448),
    lastClaimOreAt: deserializeU64(data, offset + 456),
    lastClaimSolAt: deserializeU64(data, offset + 464),
    rewardsFactor: deserializeU64(data, offset + 472),
    rewardsSol: deserializeU64(data, offset + 480),
    rewardsOre: deserializeU64(data, offset + 488),
    refinedOre: deserializeU64(data, offset + 496),
    lifetimeRewardsSol: deserializeU64(data, offset + 504),
    lifetimeRewardsOre: deserializeU64(data, offset + 512),
  };

  logger.debug(`Miner: roundId=${miner.roundId.toString()}, rewardsSol=${miner.rewardsSol.toString()}, rewardsOre=${miner.rewardsOre.toString()}`);

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

  // Parse Stake structure (estimated layout)
  let offset = 8; // Skip discriminator

  const stake: Stake = {
    authority: new PublicKey(data.slice(offset, offset + 32)),
    balance: deserializeU64(data, offset + 32),
    rewardsSol: deserializeU64(data, offset + 40),
    rewardsOre: deserializeU64(data, offset + 48),
    lifetimeRewardsSol: deserializeU64(data, offset + 56),
    lifetimeRewardsOre: deserializeU64(data, offset + 64),
  };

  logger.debug(`Stake: balance=${stake.balance.toString()}, rewardsSol=${stake.rewardsSol.toString()}, rewardsOre=${stake.rewardsOre.toString()}`);

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

  // Parse Treasury structure (based on Rust struct from ORE)
  // pub struct Treasury {
  //   pub balance: u64,              // Offset 8
  //   pub motherlode: u64,           // Offset 16 <-- GLOBAL MOTHERLODE
  //   pub miner_rewards_factor: ...  // Complex type
  //   pub stake_rewards_factor: ...  // Complex type
  //   pub total_staked: u64,         // Offset varies
  //   pub total_unclaimed: u64,
  //   pub total_refined: u64,
  // }

  const treasury: Treasury = {
    balance: deserializeU64(data, 8),         // SOL balance
    motherlode: deserializeU64(data, 16),     // ORE motherlode (GLOBAL)
    totalStaked: deserializeU64(data, 72),    // Total staked (approximate)
    totalUnclaimed: deserializeU64(data, 80), // Total unclaimed
    totalRefined: deserializeU64(data, 88),   // Total refined
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
  fetchBoard,
  fetchRound,
  fetchMiner,
  fetchStake,
  fetchTreasury,
};
