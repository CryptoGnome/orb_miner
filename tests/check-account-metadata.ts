import { getConnection } from '../src/utils/solana';

/**
 * Check account metadata (signer and writable flags) from a transaction
 */

async function main() {
  const signature = 'H8P6zQ7xkdKyPfRsacRZYcVR9QB8Vq1y2KnmMZ9zo2jJhhoz4Ysmb3UiyHYXG7SasX2esX9AgFSNNcoFBBqaAyj';

  console.log('Fetching transaction:', signature);
  console.log('');

  const connection = getConnection();

  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0
  });

  if (!tx) {
    console.log('Transaction not found');
    return;
  }

  console.log('Transaction found!');
  console.log('');

  // Get message
  const message = tx.transaction.message;

  // Display account keys with metadata
  console.log('=== Account Keys with Metadata ===');
  console.log('');

  message.staticAccountKeys.forEach((key, idx) => {
    const isWritable = message.isAccountWritable(idx);
    const isSigner = message.isAccountSigner(idx);

    console.log(`Account ${idx}: ${key.toBase58()}`);
    console.log(`  Signer: ${isSigner}`);
    console.log(`  Writable: ${isWritable}`);
    console.log('');
  });

  // Find execute automation instruction (discriminator 0x06)
  console.log('=== Execute Automation Instruction (0x06) ===');
  console.log('');

  tx.transaction.message.compiledInstructions.forEach((ix, idx) => {
    const data = Buffer.from(ix.data);
    if (data[0] === 0x06) {
      console.log(`Found at instruction index ${idx}`);
      console.log('');
      console.log('Instruction accounts:');
      ix.accountKeyIndexes.forEach((accountIndex, i) => {
        const accountKey = message.staticAccountKeys[accountIndex];
        const isWritable = message.isAccountWritable(accountIndex);
        const isSigner = message.isAccountSigner(accountIndex);

        console.log(`  ${i}: ${accountKey.toBase58()}`);
        console.log(`     Signer: ${isSigner}, Writable: ${isWritable}`);
      });
    }
  });
}

main();
