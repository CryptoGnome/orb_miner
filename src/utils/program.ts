import {
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BN from 'bn.js';
import { config } from './config';
import { getWallet } from './wallet';
import { getConnection } from './solana';
import { getBoardPDA, getMinerPDA, getStakePDA } from './accounts';
import logger from './logger';
import { retry } from './retry';

// Instruction discriminators (8-byte identifiers for each instruction)
// These need to match the actual ORE/ORB program discriminators
// Typically these are the first 8 bytes of the sha256 hash of "global:instruction_name"
const DEPLOY_DISCRIMINATOR = Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const CLAIM_SOL_DISCRIMINATOR = Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const CLAIM_ORE_DISCRIMINATOR = Buffer.from([0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const STAKE_DISCRIMINATOR = Buffer.from([0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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

// Build Deploy instruction
export function buildDeployInstruction(
  amount: number,
  squareMask: number
): TransactionInstruction {
  const wallet = getWallet();
  const [boardPDA] = getBoardPDA();
  const [minerPDA] = getMinerPDA(wallet.publicKey);

  // Convert SOL amount to lamports
  const amountLamports = new BN(amount * LAMPORTS_PER_SOL);

  // Build instruction data: discriminator + amount (8 bytes) + mask (4 bytes)
  const data = Buffer.alloc(8 + 8 + 4);
  DEPLOY_DISCRIMINATOR.copy(data, 0);
  amountLamports.toArrayLike(Buffer, 'le', 8).copy(data, 8);
  data.writeUInt32LE(squareMask, 16);

  // Account keys (order matters!)
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: minerPDA, isSigner: false, isWritable: true },
    { pubkey: boardPDA, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
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

      // Send transaction
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

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
