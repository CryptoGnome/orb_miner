// Verify the motherload at offset 456
const { Connection, PublicKey } = require('@solana/web3.js');

async function verifyMotherload() {
  const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey=01J60HT7WDENVAHVFBE0EEBK03');
  const programId = new PublicKey('boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk');

  // Find Round PDA for round 2204
  const roundId = Buffer.alloc(8);
  roundId.writeBigUInt64LE(BigInt(2204));

  const [roundPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('round'), roundId],
    programId
  );

  const accountInfo = await connection.getAccountInfo(roundPDA);
  const data = accountInfo.data;

  console.log('Reading motherload from offset 456:');
  const motherload = data.readBigUInt64LE(456);
  const motherloadOrb = Number(motherload) / 1e9;
  console.log('Raw value:', motherload.toString());
  console.log('ORB value:', motherloadOrb.toFixed(2), 'ORB');

  console.log('\nOther fields:');
  console.log('Total Deployed (offset 536):', (Number(data.readBigUInt64LE(536)) / 1e9).toFixed(4), 'SOL');
  console.log('Total Winnings (offset 552):', (Number(data.readBigUInt64LE(552)) / 1e9).toFixed(4), 'SOL');
}

verifyMotherload().catch(console.error);
