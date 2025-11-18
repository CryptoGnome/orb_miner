import { getWallet } from '../src/utils/wallet';
import { getAutomationPDA, getMinerPDA, getBoardPDA, getRoundPDA, fetchBoard } from '../src/utils/accounts';
import { sendAndConfirmTransaction } from '../src/utils/program';
import { getConnection } from '../src/utils/solana';
import { config } from '../src/utils/config';
import { TransactionInstruction, SystemProgram } from '@solana/web3.js';

/**
 * Execute automation to deploy for current round
 *
 * This script triggers the automation account to deploy SOL
 * to all configured squares for the current round.
 *
 * Uses the Deploy instruction (discriminator 0x00) with automation account.
 * When automation account is present, Deploy uses automation funds instead of wallet.
 *
 * The executor (you) gets a small fee for each execution.
 *
 * Run with: npx ts-node tests/test-execute-automation.ts
 */

async function buildExecuteAutomationInstruction(): Promise<TransactionInstruction> {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);
  const [automationPDA] = getAutomationPDA(wallet.publicKey);
  const [boardPDA] = getBoardPDA();

  // Get current round
  const board = await fetchBoard();
  const [roundPDA] = getRoundPDA(board.roundId);

  // Build deploy instruction data (34 bytes total):
  // When automation account is present with data, the deploy instruction
  // automatically uses automation.amount instead of this amount parameter
  // Build Execute Automation instruction data (13 bytes total):
  // Based on real ORB transaction analysis:
  // - 1 byte: discriminator (0x06)
  // - 4 bytes: amount field (u32 LE)
  // - 4 bytes: unknown/padding
  // - 4 bytes: square count (u32 LE)
  const data = Buffer.alloc(13);
  data.writeUInt8(0x06, 0);                        // Execute automation discriminator
  data.writeUInt32LE(0, 1);                        // Amount field (0 = use automation amount)
  data.writeUInt32LE(0, 5);                        // Unknown/padding
  data.writeUInt32LE(25, 9);                       // Square count

  // Account keys (7 accounts) based on real ORB transaction:
  // 0. signer (executor)
  // 1. authority (wallet)
  // 2. automation PDA
  // 3. board PDA
  // 4. miner PDA
  // 5. round PDA
  // 6. system program
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // signer (executor)
    { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, // authority
    { pubkey: automationPDA, isSigner: false, isWritable: true },    // automation
    { pubkey: boardPDA, isSigner: false, isWritable: true },         // board
    { pubkey: minerPDA, isSigner: false, isWritable: true },         // miner
    { pubkey: roundPDA, isSigner: false, isWritable: true },         // round
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system program
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

async function main() {
  console.log('============================================================');
  console.log('Execute Automation');
  console.log('============================================================\n');

  try {
    const wallet = getWallet();
    const connection = getConnection();
    const [automationPDA] = getAutomationPDA(wallet.publicKey);

    console.log(`Executor: ${wallet.publicKey.toBase58()}`);
    console.log(`Automation PDA: ${automationPDA.toBase58()}\n`);

    // Check if automation account exists
    console.log('Checking automation account...');
    const accountInfo = await connection.getAccountInfo(automationPDA);

    if (!accountInfo) {
      console.log('❌ No automation account found');
      console.log('Please setup automation first with test-setup-smart-automation.ts\n');
      return;
    }

    console.log('✅ Automation account exists');
    console.log(`Account balance: ${(accountInfo.lamports / 1e9).toFixed(6)} SOL\n`);

    // Parse automation details
    const data = accountInfo.data;
    if (data.length >= 112) {
      const amountPerSquare = data.readBigUInt64LE(8);
      const balance = data.readBigUInt64LE(48);
      const mask = data.readBigUInt64LE(104);

      console.log('Automation Configuration:');
      console.log(`  Amount per square: ${(Number(amountPerSquare) / 1e9).toFixed(6)} SOL`);
      console.log(`  Remaining balance: ${(Number(balance) / 1e9).toFixed(6)} SOL`);
      console.log(`  Squares: ${mask.toString()}`);
      console.log(`  SOL per round: ${(Number(amountPerSquare) * Number(mask) / 1e9).toFixed(4)} SOL\n`);
    }

    // Get current round
    const board = await fetchBoard();
    console.log(`Current Round: ${board.roundId}`);
    console.log(`Round ends at slot: ${board.endSlot}\n`);

    // Check if we have enough balance for one more round
    const balanceLamports = data.readBigUInt64LE(48);
    const amountPerSquare = data.readBigUInt64LE(8);
    const mask = data.readBigUInt64LE(104);
    const costPerRound = Number(amountPerSquare) * Number(mask);

    if (Number(balanceLamports) < costPerRound) {
      console.log('⚠️  WARNING: Automation balance too low for another round');
      console.log(`Need: ${(costPerRound / 1e9).toFixed(4)} SOL`);
      console.log(`Have: ${(Number(balanceLamports) / 1e9).toFixed(6)} SOL\n`);
      return;
    }

    // Dry run check
    if (config.dryRun) {
      console.log('[DRY RUN] Would execute automation for current round');
      console.log('✅ Dry run completed');
      return;
    }

    console.log('⚠️  Press Ctrl+C to cancel, or wait 2 seconds to proceed...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Executing automation...');
    const instruction = await buildExecuteAutomationInstruction();

    console.log('Sending transaction...');
    const signature = await sendAndConfirmTransaction([instruction], 'Execute Automation');

    console.log('\n✅ Automation executed successfully!');
    console.log(`Transaction: ${signature}`);
    console.log(`\nDeployment has been made for round ${board.roundId}`);
    console.log(`You received the executor fee for triggering this deployment.`);
  } catch (error) {
    console.error('\n❌ Failed to execute automation:', error);
    console.error('\nPossible reasons:');
    console.error('  - Wrong execute discriminator (needs reverse engineering)');
    console.error('  - Incorrect account order');
    console.error('  - Already deployed for this round');
    console.error('  - Insufficient balance in automation account');
    process.exit(1);
  }
}

main();
