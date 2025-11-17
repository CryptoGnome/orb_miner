// Test the corrected deploy instruction
const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
require('dotenv').config();

async function testCorrectedDeploy() {
  const connection = new Connection(process.env.RPC_ENDPOINT);
  const programId = new PublicKey('boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk');

  const privateKeyBytes = bs58.decode(process.env.PRIVATE_KEY);
  const wallet = Keypair.fromSecretKey(privateKeyBytes);

  console.log('Wallet:', wallet.publicKey.toBase58());

  // Get PDAs
  const [boardPDA] = PublicKey.findProgramAddressSync([Buffer.from('board')], programId);
  const [minerPDA] = PublicKey.findProgramAddressSync([Buffer.from('miner'), wallet.publicKey.toBuffer()], programId);
  const [automationPDA] = PublicKey.findProgramAddressSync([Buffer.from('automation'), wallet.publicKey.toBuffer()], programId);

  // Get current board to find round ID
  const boardData = await connection.getAccountInfo(boardPDA);
  const roundId = boardData.data.readBigUInt64LE(8);
  const roundIdBuf = Buffer.alloc(8);
  roundIdBuf.writeBigUInt64LE(roundId);
  const [roundPDA] = PublicKey.findProgramAddressSync([Buffer.from('round'), roundIdBuf], programId);

  console.log('Board PDA:', boardPDA.toBase58());
  console.log('Miner PDA:', minerPDA.toBase58());
  console.log('Automation PDA:', automationPDA.toBase58());
  console.log('Round ID:', roundId.toString());
  console.log('Round PDA:', roundPDA.toBase58());
  console.log();

  // Build instruction data: discriminator (8) + amount (8) + squares (4) = 20 bytes
  const amount = 0.01 * LAMPORTS_PER_SOL;
  const squaresMask = 0x1FFFFFF; // All 25 squares

  const data = Buffer.alloc(20);
  Buffer.from([0x00, 0x40, 0x42, 0x0f, 0x00, 0x00, 0x00, 0x00]).copy(data, 0);
  data.writeBigUInt64LE(BigInt(amount), 8);
  data.writeUInt32LE(squaresMask, 16);

  console.log('Instruction data:', data.toString('hex'));
  console.log('  Discriminator:', data.slice(0, 8).toString('hex'));
  console.log('  Amount:', amount, 'lamports');
  console.log('  Squares mask: 0x' + squaresMask.toString(16));
  console.log();

  // Build instruction with corrected accounts
  const ix = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // signer
      { pubkey: wallet.publicKey, isSigner: false, isWritable: true }, // authority
      { pubkey: automationPDA, isSigner: false, isWritable: true },    // automation
      { pubkey: boardPDA, isSigner: false, isWritable: true },         // board
      { pubkey: minerPDA, isSigner: false, isWritable: true },         // miner
      { pubkey: roundPDA, isSigner: false, isWritable: true },         // round
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: programId,
    data: data,
  });

  console.log('Accounts:');
  ix.keys.forEach((key, i) => {
    console.log(`  ${i}: ${key.pubkey.toBase58()} (${key.isSigner ? 'signer' : 'nosign'}, ${key.isWritable ? 'write' : 'read'})`);
  });
  console.log();

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  console.log('Simulating...\n');

  const simulation = await connection.simulateTransaction(tx, [wallet]);

  if (simulation.value.err) {
    console.log('❌ Failed:', JSON.stringify(simulation.value.err, null, 2));
  } else {
    console.log('✅ SUCCESS!');
  }

  console.log('\nLogs:');
  if (simulation.value.logs) {
    simulation.value.logs.forEach(log => console.log('  ', log));
  }
}

testCorrectedDeploy().catch(console.error);
