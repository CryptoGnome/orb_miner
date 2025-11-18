import { getConnection } from '../src/utils/solana';
import { config } from '../src/utils/config';

/**
 * Analyze a transaction to see its account structure
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

  // Find ORB program instruction
  const orbProgramId = config.orbProgramId.toBase58();

  tx.transaction.message.compiledInstructions.forEach((ix, idx) => {
    const programId = tx.transaction.message.staticAccountKeys[ix.programIdIndex].toBase58();

    if (programId === orbProgramId) {
      console.log(`=== ORB Instruction #${idx} ===`);
      console.log(`Program: ${programId}`);
      console.log('');

      console.log('Instruction Data (hex):');
      console.log(Buffer.from(ix.data).toString('hex'));
      console.log('');

      console.log('Instruction Data (first 34 bytes):');
      const data = Buffer.from(ix.data);
      for (let i = 0; i < Math.min(34, data.length); i++) {
        console.log(`  Byte ${i}: 0x${data[i].toString(16).padStart(2, '0')} (${data[i]})`);
      }
      console.log('');

      console.log('Account Keys:');
      ix.accountKeyIndexes.forEach((accountIndex, i) => {
        const accountKey = tx.transaction.message.staticAccountKeys[accountIndex];
        console.log(`  ${i}: ${accountKey.toBase58()}`);
      });
      console.log('');

      console.log('Total accounts:', ix.accountKeyIndexes.length);
    }
  });
}

main();
