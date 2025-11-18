import { getWallet } from '../src/utils/wallet';
import { getAutomationPDA, getMinerPDA } from '../src/utils/accounts';
import { sendAndConfirmTransaction } from '../src/utils/program';
import { getConnection } from '../src/utils/solana';
import { config } from '../src/utils/config';
import { TransactionInstruction, PublicKey, SystemProgram } from '@solana/web3.js';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAutomationInfo() {
  const connection = getConnection();
  const [automationPDA] = getAutomationPDA(getWallet().publicKey);
  const accountInfo = await connection.getAccountInfo(automationPDA);

  if (!accountInfo || accountInfo.data.length < 112) {
    return null;
  }

  const data = accountInfo.data;
  const amountPerSquare = data.readBigUInt64LE(8);
  const balance = data.readBigUInt64LE(48);
  const mask = data.readBigUInt64LE(104);

  return {
    pda: automationPDA,
    amountPerSquare: Number(amountPerSquare),
    balance: Number(balance),
    mask: Number(mask),
    costPerRound: Number(amountPerSquare) * Number(mask),
  };
}

function buildCloseAutomationInstruction(): TransactionInstruction {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);
  const [automationPDA] = getAutomationPDA(wallet.publicKey);

  // Build automate instruction with executor = Pubkey::default() to signal closure
  // Format: discriminator + amount + deposit + fee + mask + strategy (34 bytes)
  const data = Buffer.alloc(34);
  data.writeUInt8(0x00, 0); // AUTOMATE_DISCRIMINATOR
  // Rest is all zeros to signal closure

  // Account keys (5 accounts):
  // 0. signer (wallet)
  // 1. automation PDA
  // 2. executor (Pubkey::default() = all zeros to signal close)
  // 3. miner PDA
  // 4. system program
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: automationPDA, isSigner: false, isWritable: true },
    { pubkey: PublicKey.default, isSigner: false, isWritable: true }, // default pubkey signals close
    { pubkey: minerPDA, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: config.orbProgramId,
    data,
  });
}

async function resetAutomation() {
  try {
    console.log('\n🔄 Resetting automation account...');

    const automationInfo = await getAutomationInfo();
    if (automationInfo) {
      const refundAmount = automationInfo.balance / 1e9;
      console.log(`Closing automation to refund ${refundAmount.toFixed(6)} SOL...`);

      // Close automation using PublicKey.default as executor
      const closeInstruction = buildCloseAutomationInstruction();

      const closeSig = await sendAndConfirmTransaction([closeInstruction], 'Close Automation');
      console.log(`✅ Automation closed: ${closeSig}`);
      console.log(`💰 Refunded ${refundAmount.toFixed(6)} SOL to wallet`);

      await sleep(2000);
    } else {
      console.log('No automation account found to close.');
    }

    console.log('\n✅ Reset complete! You can now run the bot with: npm start');
    console.log('The bot will auto-create a fresh automation account on first run.');

  } catch (error) {
    console.error('Failed to reset automation:', error);
  }
}

resetAutomation().catch(console.error);
