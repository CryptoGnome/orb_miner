import {
  SystemProgram,
  TransactionInstruction,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { config } from './config';
import { getWallet } from './wallet';
import { getConnection } from './solana';
import { getBoardPDA, getRoundPDA, getMinerPDA, getStakePDA, getAutomationPDA, fetchBoard } from './accounts';
import logger from './logger';
import { retry } from './retry';

// Instruction discriminators (extracted from real ORB transactions)
const DEPLOY_DISCRIMINATOR = Buffer.from([0x00, 0x40, 0x42, 0x0f, 0x00, 0x00, 0x00, 0x00]);
const CLAIM_SOL_DISCRIMINATOR = Buffer.from([0x8b, 0x71, 0xb3, 0xbd, 0xbe, 0x1e, 0x84, 0xc3]);
const CLAIM_ORE_DISCRIMINATOR = Buffer.from([0x84, 0xc7, 0x0b, 0xa0, 0xb1, 0x27, 0x38, 0x72]);
const STAKE_DISCRIMINATOR = Buffer.from([0xce, 0xb0, 0xca, 0x12, 0xc8, 0xd1, 0xb3, 0x6c]);

// Convert deployment strategy to 25-bit mask
// For "all" strategy, all 25 bits are set (deploy to all squares)
export function getSquareMask(strategy: 'all' | 'specific', squares?: number[]): number {
  if (strategy === 'all') {
    // All 25 bits set: 0b1111111111111111111111111 = 0x1FFFFFF
    return 0x1FFFFFF;
  }

  if (strategy === 'specific' && squares) {
    let mask = 0;
    for (const square of squares) {
      if (square >= 0 && square < 25) {
        mask |= (1 << square);
      }
    }
    return mask;
  }

  throw new Error('Invalid deployment strategy');
}

// Build Deploy instruction (based on ORE source code)
export async function buildDeployInstruction(
  amount: number,
  squareMask: number
): Promise<TransactionInstruction> {
  const wallet = getWallet();
  const [boardPDA] = getBoardPDA();
  const [minerPDA] = getMinerPDA(wallet.publicKey);
  const [automationPDA] = getAutomationPDA(wallet.publicKey);

  // Get current board to find round ID
  const board = await fetchBoard();
  const [roundPDA] = getRoundPDA(board.roundId);

  // Convert SOL amount to lamports
  const amountLamports = new BN(amount * LAMPORTS_PER_SOL);

  // Build instruction data based on ORE Deploy struct:
  // pub struct Deploy { amount: [u8; 8], squares: [u8; 4] }
  // Total: 8 bytes discriminator + 8 bytes amount + 4 bytes squares = 20 bytes
  const data = Buffer.alloc(20);
  DEPLOY_DISCRIMINATOR.copy(data, 0);
  amountLamports.toArrayLike(Buffer, 'le', 8).copy(data, 8);
  data.writeUInt32LE(squareMask, 16); // 4-byte squares mask

  logger.debug(`Deploy instruction: amount=${amount} SOL, mask=0x${squareMask.toString(16)}`);

  // Account keys based on ORE deploy.rs:
  // 1. signer - Transaction signer
  // 2. authority - Writable authority (same as signer)
  // 3. automation - Writable automation PDA [AUTOMATION, authority]
  // 4. board - Writable board account
  // 5. miner - Writable miner PDA [MINER, authority]
  // 6. round - Writable round account
  // 7. system_program - System program
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // signer
    { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, // authority (same as signer)
    { pubkey: automationPDA, isSigner: false, isWritable: true },    // automation PDA
    { pubkey: boardPDA, isSigner: false, isWritable: true },         // board
    { pubkey: minerPDA, isSigner: false, isWritable: true },         // miner
    { pubkey: roundPDA, isSigner: false, isWritable: true },         // round
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

// Build Claim SOL instruction
export function buildClaimSolInstruction(): TransactionInstruction {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);

  const data = Buffer.alloc(8);
  CLAIM_SOL_DISCRIMINATOR.copy(data, 0);

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

// Build Claim ORE instruction
export function buildClaimOreInstruction(): TransactionInstruction {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);

  const data = Buffer.alloc(8);
  CLAIM_ORE_DISCRIMINATOR.copy(data, 0);

  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: minerPDA, isSigner: false, isWritable: true },
    { pubkey: config.orbTokenMint, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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

// Send and confirm transaction with retries
export async function sendAndConfirmTransaction(
  instructions: TransactionInstruction[],
  context: string
): Promise<string> {
  const connection = getConnection();
  const wallet = getWallet();

  return await retry(
    async () => {
      // Create transaction
      const transaction = new Transaction();
      instructions.forEach(ix => transaction.add(ix));

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign transaction
      transaction.sign(wallet);

      // Send transaction with detailed error logging
      let signature: string;
      try {
        signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
      } catch (error: any) {
        // Log detailed error information
        logger.error(`${context}: Transaction simulation failed`);
        if (error.logs) {
          logger.error(`${context}: Simulation logs:`, error.logs);
        }
        if (error.message) {
          logger.error(`${context}: Error message:`, error.message);
        }
        throw error;
      }

      logger.info(`${context}: Transaction sent: ${signature}`);

      // Confirm transaction
      await connection.confirmTransaction(signature, 'confirmed');

      logger.info(`${context}: Transaction confirmed: ${signature}`);
      return signature;
    },
    { maxRetries: config.deployMaxRetries },
    context
  );
}

export default {
  getSquareMask,
  buildDeployInstruction,
  buildClaimSolInstruction,
  buildClaimOreInstruction,
  buildStakeInstruction,
  sendAndConfirmTransaction,
};
