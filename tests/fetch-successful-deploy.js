// Fetch a successful deploy transaction and analyze the instruction data
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

async function fetchTransaction() {
  const connection = new Connection(process.env.RPC_ENDPOINT);
  const signature = '278PzSGkMg95Pxvuczu5A9hYPPQgXbaWMcvN7hLmRgoKscAxSEKgYZVbCvstkfmsNyg5Se3RkejynRDccRH136GS';

  console.log('Fetching transaction:', signature);
  console.log();

  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    console.log('Transaction not found');
    return;
  }

  console.log('Transaction found!');
  console.log();

  // Find the deploy instruction (to the ORB program)
  const programId = 'boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk';

  const instructions = tx.transaction.message.compiledInstructions;
  const accountKeys = tx.transaction.message.staticAccountKeys;

  console.log('Instructions:', instructions.length);
  console.log();

  for (let i = 0; i < instructions.length; i++) {
    const ix = instructions[i];
    const programKey = accountKeys[ix.programIdIndex].toBase58();

    if (programKey === programId) {
      console.log(`Instruction ${i}: ORB Program`);
      console.log('Data (hex):', Buffer.from(ix.data).toString('hex'));
      console.log('Data (length):', ix.data.length, 'bytes');
      console.log();

      // Decode the data
      const data = Buffer.from(ix.data);
      console.log('Discriminator:', data.slice(0, 8).toString('hex'));

      if (data.length >= 16) {
        const amount = data.readBigUInt64LE(8);
        console.log('Amount:', amount.toString(), 'lamports');
      }

      if (data.length >= 20) {
        const squares = data.readUInt32LE(16);
        console.log('Squares mask: 0x' + squares.toString(16));
      }

      if (data.length > 20) {
        console.log('Additional data:', data.slice(20).toString('hex'));
      }

      console.log();
      console.log('Accounts:');
      ix.accountKeyIndexes.forEach((idx, j) => {
        console.log(`  ${j}: ${accountKeys[idx].toBase58()}`);
      });
    } else {
      console.log(`Instruction ${i}: ${programKey.slice(0, 20)}...`);
    }
  }
}

fetchTransaction().catch(console.error);
