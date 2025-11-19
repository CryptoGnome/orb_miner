import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

// Board account - tracks current round info
export interface Board {
  roundId: BN;      // Current round number
  startSlot: BN;    // When current round started
  endSlot: BN;      // When current round ends
}

// Round account - tracks game state for a round
export interface Round {
  deployed: BN[];       // Array of 25 u64 values (SOL deployed per square)
  motherload: BN;       // ORE vault balance for this round
  totalDeployed: BN;    // Total SOL deployed across all squares
  totalWinnings: BN;    // Total winnings distributed
  // Additional fields from the contract (not all may be used)
  id: BN;               // Round ID
  expireSlot: BN;       // When the round expires
  slotHash: Buffer;     // Slot hash for randomness
}

// Miner account - tracks individual miner state
export interface Miner {
  authority: PublicKey;         // Account owner
  deployed: BN[];               // Array of 25 u64 values (your SOL in each square)
  cumulative: BN[];             // Array of 25 u64 values (SOL withheld in reserve)
  roundId: BN;                  // Round you're currently in
  checkpointFee: BN;            // Reserve funds for checkpoint payments
  checkpointId: BN;             // Last round when checkpointing occurred
  lastClaimOreAt: BN;           // Timestamp of last ORE claim
  lastClaimSolAt: BN;           // Timestamp of last SOL claim
  rewardsFactor: BN;            // Current rewards multiplier
  rewardsSol: BN;               // Claimable SOL amount
  rewardsOre: BN;               // Claimable ORE amount
  refinedOre: BN;               // ORE earned from claim fees
  lifetimeRewardsSol: BN;       // Total SOL earned
  lifetimeRewardsOre: BN;       // Total ORE earned
}

// Stake account - tracks staking info
export interface Stake {
  authority: PublicKey;     // Account owner
  balance: BN;              // Staked ORB amount
  rewardsFactor: Buffer;    // I80F48 rewards factor (16 bytes)
  rewardsSol: BN;           // Claimable SOL from staking
  rewardsOre: BN;           // Claimable ORE from staking
  lifetimeRewardsSol: BN;   // Total SOL earned from staking
  lifetimeRewardsOre: BN;   // Total ORE earned from staking
}

// Treasury account - global singleton for ORE rewards
export interface Treasury {
  balance: BN;              // SOL balance for buy-bury
  motherlode: BN;           // ORE in the global rewards pool
  minerRewardsFactor: Buffer;  // I80F48 miner rewards factor (16 bytes)
  stakeRewardsFactor: Buffer;  // I80F48 stake rewards factor (16 bytes)
  totalStaked: BN;          // Current total staking deposits
  totalUnclaimed: BN;       // Unclaimed mining rewards
  totalRefined: BN;         // Refined mining rewards
}

// Jupiter swap types
export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: any[];
}

export interface JupiterSwapResponse {
  swapTransaction: string;  // Base64 encoded transaction
  lastValidBlockHeight: number;
}

// Helper types
export interface DeploymentStrategy {
  type: 'all' | 'specific' | 'random';
  squares?: number[];  // For 'specific' strategy
}

export interface ClaimOptions {
  claimSol: boolean;
  claimOrb: boolean;
  fromMining: boolean;
  fromStaking: boolean;
}
