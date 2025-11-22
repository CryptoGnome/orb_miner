import {
  SystemProgram,
  TransactionInstruction,
  Transaction,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import BN from 'bn.js';
import { config } from './config';
import { getWallet } from './wallet';
import { getConnection } from './solana';
import { getMinerPDA, getStakePDA, getAutomationPDA, getBoardPDA, getRoundPDA } from './accounts';
import logger from './logger';
import { retry } from './retry';
import { buildComputeBudgetInstructions, COMPUTE_UNIT_LIMITS, parseFeeLevel } from './feeEstimation';

// Instruction discriminators (extracted from real ORB transactions)
const DEPLOY_DISCRIMINATOR = Buffer.from([0x00, 0x40, 0x42, 0x0f, 0x00, 0x00, 0x00, 0x00]); // 8-byte deploy discriminator
const AUTOMATE_DISCRIMINATOR = 0x00; // Setup automation (1-byte)
const CHECKPOINT_DISCRIMINATOR = 0x02; // Checkpoint miner rewards (1-byte)
// ClaimSOL = 3, ClaimORE = 4 (1-byte discriminators, defined inline in functions)
const STAKE_DISCRIMINATOR = Buffer.from([0xce, 0xb0, 0xca, 0x12, 0xc8, 0xd1, 0xb3, 0x6c]); // 8-byte stake discriminator

// Dev fee configuration
const DEV_FEE_WALLET = new PublicKey('9DTThTbggnp2P2ZGLFRfN1A3j5JUsXez1dRJak3TixB2');
const DEV_FEE_BPS = 50; // 0.5% (50 basis points)

// Automation strategies
export enum AutomationStrategy {
  Random = 0,    // Deploys to random squares
  Preferred = 1, // Deploys to specific squares based on mask
}

// Convert deployment strategy to 25-bit mask
// NOTE: Based on reverse engineering, ORB requires squares mask to be 0, not a bitmask!
// The actual square deployment is controlled by other parameters.
export function getSquareMask(): number {
  // Always return 0 - this is required by ORB's deploy instruction
  return 0;
}

// Build development fee transfer instruction (0.5% of deployment amount)
// Returns null if the wallet is the dev fee wallet (no self-payment)
export function buildDevFeeTransferInstruction(deploymentAmount: number): TransactionInstruction | null {
  const wallet = getWallet();

  // Skip dev fee if the wallet IS the dev fee wallet (no self-payment)
  if (wallet.publicKey.equals(DEV_FEE_WALLET)) {
    logger.debug('Skipping dev fee (wallet is dev fee wallet)');
    return null;
  }

  // Calculate fee (0.5% = 50 basis points)
  const feeLamports = Math.floor((deploymentAmount * LAMPORTS_PER_SOL * DEV_FEE_BPS) / 10000);

  logger.debug(`Dev fee: ${feeLamports} lamports (${feeLamports / LAMPORTS_PER_SOL} SOL) for ${deploymentAmount} SOL deployment`);

  return SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: DEV_FEE_WALLET,
    lamports: feeLamports,
  });
}

// Build Deploy instruction (reverse engineered from ORB transactions)
export async function buildDeployInstruction(
  amount: number
): Promise<TransactionInstruction> {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);
  const [automationPDA] = getAutomationPDA(wallet.publicKey);
  const [boardPDA] = getBoardPDA();

  // Get current board to get round info
  const { fetchBoard } = await import('./accounts');
  const board = await fetchBoard();
  const [roundPDA] = getRoundPDA(board.roundId);

  // Convert SOL amount to lamports
  const amountLamports = new BN(amount * LAMPORTS_PER_SOL);

  // Build instruction data (34 bytes total):
  // - 8 bytes: discriminator (0x0040420f00000000)
  // - 8 bytes: amount (u64 LE)
  // - 4 bytes: squares mask (u32 LE) - MUST BE 0
  // - 4 bytes: unknown field (u32 LE) - always 0
  // - 4 bytes: square count (u32 LE) - always 25
  // - 6 bytes: padding (all zeros)
  const data = Buffer.alloc(34);
  DEPLOY_DISCRIMINATOR.copy(data, 0);              // Discriminator (8 bytes)
  amountLamports.toArrayLike(Buffer, 'le', 8).copy(data, 8); // Amount (8 bytes)
  data.writeUInt32LE(0, 16);                       // Squares mask - MUST BE 0 (4 bytes)
  data.writeUInt32LE(0, 20);                       // Unknown field (4 bytes)
  data.writeUInt32LE(25, 24);                      // Square count (4 bytes)
  // Padding bytes 28-33 are already 0 from Buffer.alloc

  logger.debug(`Deploy instruction: amount=${amount} SOL (${amountLamports.toString()} lamports)`);

  // Get treasury PDA - needed for automation fee collection
  const { getTreasuryPDA } = await import('./accounts');
  const [treasuryPDA] = getTreasuryPDA();

  // Account keys (8 accounts - based on deploy.rs with automation):
  // 0. signer - Wallet (signer, writable)
  // 1. authority - Wallet (writable)
  // 2. automation - Automation PDA (writable)
  // 3. board - Board PDA (writable)
  // 4. miner - Miner PDA (writable)
  // 5. round - Round PDA for current round (writable)
  // 6. treasury - Treasury PDA (writable) - for automation fee collection
  // 7. system_program - System program (read-only)
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // signer
    { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, // authority
    { pubkey: automationPDA, isSigner: false, isWritable: true },    // automation
    { pubkey: boardPDA, isSigner: false, isWritable: true },         // board
    { pubkey: minerPDA, isSigner: false, isWritable: true },         // miner
    { pubkey: roundPDA, isSigner: false, isWritable: true },         // round
    { pubkey: treasuryPDA, isSigner: false, isWritable: true },      // treasury
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

// Build Automate instruction (setup automated mining)
// Based on ORE source: https://github.com/regolith-labs/ore/blob/master/program/src/automate.rs
export function buildAutomateInstruction(
  amountPerSquare: number,  // SOL to deploy per square each round (in SOL, not lamports)
  deposit: number,          // Initial funding for automation account (in SOL)
  feePerExecution: number,  // Fee paid to executor per round (in SOL)
  strategy: AutomationStrategy = AutomationStrategy.Random,
  squareMask: bigint = 25n, // For Random: number of squares (25). For Preferred: bitmask of squares
  executor?: PublicKey      // Executor address (defaults to wallet for self-execution)
): TransactionInstruction {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);
  const [automationPDA] = getAutomationPDA(wallet.publicKey);
  const executorKey = executor || wallet.publicKey; // Self-execute if no executor provided

  // Build instruction data (34 bytes total):
  // - 1 byte: discriminator (0x00)
  // - 8 bytes: amount per square (u64 LE, in lamports)
  // - 8 bytes: deposit (u64 LE, in lamports)
  // - 8 bytes: fee (u64 LE, in lamports)
  // - 8 bytes: mask (u64 LE)
  // - 1 byte: strategy (0 = Random, 1 = Preferred)
  const data = Buffer.alloc(34);
  let offset = 0;

  // Discriminator
  data.writeUInt8(AUTOMATE_DISCRIMINATOR, offset);
  offset += 1;

  // Amount per square (convert SOL to lamports)
  const amountLamports = BigInt(Math.floor(amountPerSquare * LAMPORTS_PER_SOL));
  data.writeBigUInt64LE(amountLamports, offset);
  offset += 8;

  // Deposit (convert SOL to lamports)
  const depositLamports = BigInt(Math.floor(deposit * LAMPORTS_PER_SOL));
  data.writeBigUInt64LE(depositLamports, offset);
  offset += 8;

  // Fee (convert SOL to lamports)
  const feeLamports = BigInt(Math.floor(feePerExecution * LAMPORTS_PER_SOL));
  data.writeBigUInt64LE(feeLamports, offset);
  offset += 8;

  // Mask (for Random: quantity of squares; for Preferred: bitmask)
  data.writeBigUInt64LE(squareMask, offset);
  offset += 8;

  // Strategy
  data.writeUInt8(strategy, offset);

  // Account keys (5 accounts):
  // 0. signer - Wallet (signer, writable)
  // 1. automation - Automation PDA (writable)
  // 2. executor - Executor address (writable)
  // 3. miner - Miner PDA (writable)
  // 4. system_program - System program (read-only)
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: automationPDA, isSigner: false, isWritable: true },
    { pubkey: executorKey, isSigner: false, isWritable: true },
    { pubkey: minerPDA, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

// Build Checkpoint instruction (process miner rewards for completed round)
// Based on ORE checkpoint.rs: https://github.com/regolith-labs/ore/blob/master/program/src/checkpoint.rs
export async function buildCheckpointInstruction(roundId?: BN): Promise<TransactionInstruction> {
  const connection = getConnection();
  const wallet = getWallet();
  const [boardPDA] = getBoardPDA();
  const [minerPDA] = getMinerPDA(wallet.publicKey);

  // Get current board and miner to determine which round to checkpoint
  const { fetchBoard, getTreasuryPDA } = await import('./accounts');
  const board = await fetchBoard();

  // If roundId not specified, determine which round to checkpoint from miner account
  let checkpointRoundId: BN;
  if (roundId) {
    checkpointRoundId = roundId;
  } else {
    // Read miner's round_id - this is the ONLY round that can be checkpointed
    // Per ORE checkpoint.rs: round.id must equal miner.round_id
    const minerAccount = await connection.getAccountInfo(minerPDA);
    if (minerAccount && minerAccount.data.length >= 520) {  // Need at least 512 + 8 bytes for round_id
      const minerCheckpointId = minerAccount.data.readBigUInt64LE(448);  // PER IDL: checkpoint_id at offset 448
      const minerRoundId = minerAccount.data.readBigUInt64LE(512);        // PER IDL: round_id at offset 512
      // IMPORTANT: Must checkpoint miner.round_id, NOT checkpoint_id + 1
      checkpointRoundId = new BN(minerRoundId.toString());
      logger.debug(`Miner last checkpointed: ${minerCheckpointId}, miner round_id: ${minerRoundId}, will checkpoint: ${checkpointRoundId.toString()}`);
    } else {
      // Fallback to current round - 1
      checkpointRoundId = board.roundId.subn(1);
    }
  }

  const [roundPDA] = getRoundPDA(checkpointRoundId);
  const [treasuryPDA] = getTreasuryPDA();

  // Checkpoint instruction: 1 byte discriminator (0x02)
  const data = Buffer.from([CHECKPOINT_DISCRIMINATOR]);

  logger.debug(`Building checkpoint for round ${checkpointRoundId.toString()}`);

  // Account keys (6 accounts based on checkpoint.rs):
  // 0. signer (wallet, signer, writable)
  // 1. board (board PDA, writable)
  // 2. miner (miner PDA, writable)
  // 3. round (round PDA for checkpointing, writable)
  // 4. treasury (treasury PDA, writable)
  // 5. system_program (read-only)
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: boardPDA, isSigner: false, isWritable: true },
    { pubkey: minerPDA, isSigner: false, isWritable: true },
    { pubkey: roundPDA, isSigner: false, isWritable: true },
    { pubkey: treasuryPDA, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

// Build Execute Automation instruction (trigger automated deployment)
// Based on reverse engineering real ORB transactions
// Uses discriminator 0x06 (not deploy discriminator)
// Returns both the deploy instruction and fee transfer instruction
export async function buildExecuteAutomationInstruction(): Promise<TransactionInstruction[]> {
  const connection = getConnection();
  const wallet = getWallet();
  const [automationPDA] = getAutomationPDA(wallet.publicKey);
  const [boardPDA] = getBoardPDA();
  const [minerPDA] = getMinerPDA(wallet.publicKey);

  // Get current round
  const { fetchBoard } = await import('./accounts');
  const board = await fetchBoard();
  const [roundPDA] = getRoundPDA(board.roundId);

  // Fetch automation account to get the configured amount per square
  const automationAccount = await connection.getAccountInfo(automationPDA);
  if (!automationAccount || automationAccount.data.length < 112) {
    throw new Error('Automation account not found or invalid');
  }

  // Read amount per square from automation account (offset 8, u64 LE)
  const amountPerSquare = automationAccount.data.readBigUInt64LE(8);

  // Read mask (number of squares) from automation account (offset 104, u64 LE)
  const mask = automationAccount.data.readBigUInt64LE(104);

  logger.debug(`Execute automation PDAs:`);
  logger.debug(`  Executor/Authority: ${wallet.publicKey.toBase58()}`);
  logger.debug(`  Automation: ${automationPDA.toBase58()}`);
  logger.debug(`  Board: ${boardPDA.toBase58()}`);
  logger.debug(`  Miner: ${minerPDA.toBase58()}`);
  logger.debug(`  Round: ${roundPDA.toBase58()} (round ${board.roundId.toString()})`);
  logger.debug(`Execute automation params:`);
  logger.debug(`  Amount/square: ${amountPerSquare.toString()} lamports (${Number(amountPerSquare) / 1e9} SOL)`);
  logger.debug(`  Squares: ${mask.toString()}`);

  // Build Execute Automation instruction data (13 bytes total):
  // Based on real ORB transaction analysis:
  // - 1 byte: discriminator (0x06)
  // - 4 bytes: amount field (u32 LE)
  // - 4 bytes: unknown/padding
  // - 4 bytes: square count (u32 LE)
  const data = Buffer.alloc(13);
  data.writeUInt8(0x06, 0);                        // Execute automation discriminator
  // Convert BigInt to safe number (u32 range)
  const amountU32 = Number(amountPerSquare & 0xFFFFFFFFn);
  const maskU32 = Number(mask & 0xFFFFFFFFn);
  data.writeUInt32LE(amountU32, 1);                // Amount field
  data.writeUInt32LE(0, 5);                        // Unknown/padding
  data.writeUInt32LE(maskU32, 9);                  // Square count

  logger.debug(`Instruction data (hex): ${data.toString('hex')}`);

  // Account keys (7 accounts) based on real ORB transaction:
  // 0. signer (executor)
  // 1. authority (wallet)
  // 2. automation PDA
  // 3. board PDA
  // 4. miner PDA
  // 5. round PDA
  // 6. system program
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },          // signer (executor)
    { pubkey: wallet.publicKey, isSigner: false, isWritable: true },         // authority
    { pubkey: automationPDA, isSigner: false, isWritable: true },            // automation
    { pubkey: boardPDA, isSigner: false, isWritable: true },                 // board
    { pubkey: minerPDA, isSigner: false, isWritable: true },                 // miner
    { pubkey: roundPDA, isSigner: false, isWritable: true },                 // round
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
  ];

  const deployInstruction = new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });

  // Calculate total deployment amount for fee (amountPerSquare * number of squares)
  const totalDeploymentSol = (Number(amountPerSquare) * Number(mask)) / LAMPORTS_PER_SOL;
  const feeInstruction = buildDevFeeTransferInstruction(totalDeploymentSol);

  // Return instructions: fee transfer first (if applicable), then deploy instruction
  // If wallet is dev fee wallet, skip the fee (no self-payment)
  if (feeInstruction) {
    return [feeInstruction, deployInstruction];
  } else {
    return [deployInstruction];
  }
}

// Build Claim SOL instruction (based on reverse engineered transaction)
export function buildClaimSolInstruction(): TransactionInstruction {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);

  // ClaimSOL instruction: 1 byte discriminator (0x03)
  const data = Buffer.from([0x03]);

  // 3 accounts: wallet, miner PDA, system program
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: minerPDA, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

// Build Claim ORE instruction (based on reverse engineered transaction)
export async function buildClaimOreInstruction(): Promise<TransactionInstruction> {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);

  // ClaimORE instruction: 1 byte discriminator (0x04)
  const data = Buffer.from([0x04]);

  // Get Treasury PDA
  const [treasuryPDA] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], config.orbProgramId);

  // Get token accounts
  const walletOrbAta = await getAssociatedTokenAddress(config.orbTokenMint, wallet.publicKey);
  const treasuryOrbAta = await getAssociatedTokenAddress(config.orbTokenMint, treasuryPDA, true);

  // 9 accounts based on successful transaction analysis:
  // 0: Wallet (signer, writable)
  // 1: Miner PDA (writable)
  // 2: ORB Token Mint
  // 3: Wallet ORB Token Account (writable)
  // 4: Treasury PDA (writable)
  // 5: Treasury ORB Token Account (writable)
  // 6: System Program
  // 7: Token Program
  // 8: Associated Token Program
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: minerPDA, isSigner: false, isWritable: true },
    { pubkey: config.orbTokenMint, isSigner: false, isWritable: false },
    { pubkey: walletOrbAta, isSigner: false, isWritable: true },
    { pubkey: treasuryPDA, isSigner: false, isWritable: true },
    { pubkey: treasuryOrbAta, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

// Build ClaimYield instruction (claim staking rewards)
export async function buildClaimYieldInstruction(amount: number): Promise<TransactionInstruction> {
  const wallet = getWallet();
  const [stakePDA] = getStakePDA(wallet.publicKey);

  // ClaimYield instruction: 1 byte discriminator (0x0C = 12) + 8 bytes amount (u64)
  const data = Buffer.alloc(9);
  data.writeUInt8(0x0C, 0); // Discriminator
  const amountBN = new BN(amount * 1e9); // Convert to lamports
  amountBN.toArrayLike(Buffer, 'le', 8).copy(data, 1); // Amount (little-endian u64)

  // Get Treasury PDA
  const [treasuryPDA] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], config.orbProgramId);

  // Get token accounts
  const walletOrbAta = await getAssociatedTokenAddress(config.orbTokenMint, wallet.publicKey);
  const treasuryOrbAta = await getAssociatedTokenAddress(config.orbTokenMint, treasuryPDA, true);

  // 9 accounts (from orb-idl.json claimYield instruction):
  // 0: Signer (wallet, writable)
  // 1: Mint (ORB token mint)
  // 2: Recipient (wallet ORB token account, writable)
  // 3: Stake PDA (writable)
  // 4: Treasury PDA (writable)
  // 5: Treasury Tokens (treasury ORB token account, writable)
  // 6: System Program
  // 7: Token Program
  // 8: Associated Token Program
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: config.orbTokenMint, isSigner: false, isWritable: false },
    { pubkey: walletOrbAta, isSigner: false, isWritable: true },
    { pubkey: stakePDA, isSigner: false, isWritable: true },
    { pubkey: treasuryPDA, isSigner: false, isWritable: true },
    { pubkey: treasuryOrbAta, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

// Build Stake instruction
export function buildStakeInstruction(amount: number): TransactionInstruction {
  const wallet = getWallet();
  const [stakePDA] = getStakePDA(wallet.publicKey);

  // Convert ORB amount to lamports (9 decimals)
  const amountLamports = new BN(amount * 1e9);

  const data = Buffer.alloc(8 + 8);
  STAKE_DISCRIMINATOR.copy(data, 0);
  amountLamports.toArrayLike(Buffer, 'le', 8).copy(data, 8);

  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: stakePDA, isSigner: false, isWritable: true },
    { pubkey: config.orbTokenMint, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

// Send and confirm transaction with retries and dynamic fee estimation
export async function sendAndConfirmTransaction(
  instructions: TransactionInstruction[],
  context: string,
  options?: {
    computeUnitLimit?: number;    // Optional override for compute unit limit
    accounts?: PublicKey[];       // Accounts involved (for better fee estimation)
  }
): Promise<{ signature: string; fee: number }> {
  const connection = getConnection();
  const wallet = getWallet();

  return await retry(
    async () => {
      // Determine compute unit limit based on context
      let computeUnitLimit = options?.computeUnitLimit;
      if (!computeUnitLimit) {
        // Auto-detect from context
        if (context.includes('Deploy') || context.includes('Automation')) {
          computeUnitLimit = COMPUTE_UNIT_LIMITS.DEPLOY;
        } else if (context.includes('Claim SOL')) {
          computeUnitLimit = COMPUTE_UNIT_LIMITS.CLAIM_SOL;
        } else if (context.includes('Claim ORB') || context.includes('Claim ORE')) {
          computeUnitLimit = COMPUTE_UNIT_LIMITS.CLAIM_ORB;
        } else if (context.includes('Stake')) {
          computeUnitLimit = COMPUTE_UNIT_LIMITS.STAKE;
        } else if (context.includes('Checkpoint')) {
          computeUnitLimit = COMPUTE_UNIT_LIMITS.CHECKPOINT;
        } else {
          computeUnitLimit = 200000; // Default fallback
        }
      }

      // Extract accounts from instructions if not provided
      const accounts = options?.accounts || extractAccountsFromInstructions(instructions);

      // Build compute budget instructions with dynamic fee estimation
      const feeLevel = parseFeeLevel(config.priorityFeeLevel);
      const computeBudgetIxs = await buildComputeBudgetInstructions(
        connection,
        accounts,
        feeLevel,
        computeUnitLimit
      );

      // Create transaction with compute budget instructions first
      const transaction = new Transaction();
      computeBudgetIxs.forEach(ix => transaction.add(ix));
      instructions.forEach(ix => transaction.add(ix));

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign transaction
      transaction.sign(wallet);

      // Simulate first to get detailed errors
      try {
        const simulation = await connection.simulateTransaction(transaction);
        if (simulation.value.err) {
          logger.error(`${context}: Simulation failed with error:`, simulation.value.err);
          const logs = simulation.value.logs || [];
          if (logs.length > 0) {
            logger.error(`${context}: Simulation logs:`);
            logs.forEach(log => logger.error(`  ${log}`));
          }

          // Include logs in error message for error handling
          const logsStr = logs.join(' | ');
          throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)} | Logs: ${logsStr}`);
        }
      } catch (simError: any) {
        logger.error(`${context}: Simulation error:`, simError.message);
        throw simError;
      }

      // Send transaction with detailed error logging
      let signature: string;
      try {
        signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
      } catch (error: any) {
        // Log detailed error information
        logger.error(`${context}: Transaction send failed`);
        if (error.logs) {
          logger.error(`${context}: Error logs:`, error.logs);
        }
        if (error.message) {
          logger.error(`${context}: Error message:`, error.message);
        }
        throw error;
      }

      logger.debug(`${context}: Transaction sent: ${signature}`);

      // Confirm transaction
      await connection.confirmTransaction(signature, 'confirmed');

      logger.debug(`${context}: Transaction confirmed: ${signature}`);

      // Fetch actual transaction fee
      let actualFee = 0;
      try {
        const txDetails = await connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });

        if (txDetails && txDetails.meta) {
          // Fee is in lamports, convert to SOL
          actualFee = txDetails.meta.fee / 1e9;
          logger.debug(`${context}: Actual fee paid: ${actualFee.toFixed(6)} SOL`);
        } else {
          logger.warn(`${context}: Could not fetch transaction details for fee`);
        }
      } catch (error) {
        logger.warn(`${context}: Failed to fetch transaction fee:`, error);
      }

      return { signature, fee: actualFee };
    },
    {
      maxRetries: config.deployMaxRetries,
      // Don't retry "AlreadyProcessed" errors for checkpoint operations
      shouldRetry: (error: Error) => {
        const errorMsg = String(error.message || error);
        const isAlreadyProcessed = errorMsg.includes('AlreadyProcessed');
        const isCheckpoint = context.includes('Checkpoint');

        // If it's a checkpoint operation with AlreadyProcessed error, don't retry
        if (isCheckpoint && isAlreadyProcessed) {
          return false;
        }

        // Retry all other errors
        return true;
      },
    },
    context
  );
}

// Helper: Extract unique writable accounts from instructions for fee estimation
function extractAccountsFromInstructions(instructions: TransactionInstruction[]): PublicKey[] {
  const accountSet = new Set<string>();

  instructions.forEach(ix => {
    ix.keys.forEach(key => {
      if (key.isWritable) {
        accountSet.add(key.pubkey.toBase58());
      }
    });
  });

  return Array.from(accountSet).map(addr => new PublicKey(addr));
}

export default {
  getSquareMask,
  buildDeployInstruction,
  buildAutomateInstruction,
  buildCheckpointInstruction,
  buildClaimSolInstruction,
  buildClaimOreInstruction,
  buildClaimYieldInstruction,
  buildStakeInstruction,
  sendAndConfirmTransaction,
};
