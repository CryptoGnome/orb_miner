// Quick test to read the Round account and see the raw data
const { Connection, PublicKey } = require('@solana/web3.js');

async function testRound() {
  const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey=01J60HT7WDENVAHVFBE0EEBK03');
  const programId = new PublicKey('boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk');

  // Find Round PDA for round 2204
  const roundId = Buffer.alloc(8);
  roundId.writeBigUInt64LE(BigInt(2204));

  const [roundPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('round'), roundId],
    programId
  );

  console.log('Round PDA:', roundPDA.toBase58());

  const accountInfo = await connection.getAccountInfo(roundPDA);
  if (!accountInfo) {
    console.log('Round account not found');
    return;
  }

  const data = accountInfo.data;
  console.log('Account size:', data.length, 'bytes');
  console.log('\nFirst 100 bytes (hex):');
  console.log(data.slice(0, 100).toString('hex'));

  // Try to find where 149.6 ORB might be stored
  // 149.6 ORB = 149,600,000,000 lamports (with 9 decimals)
  const target = BigInt(149600000000);

  console.log('\nSearching for motherload value (149,600,000,000):');
  for (let i = 0; i < data.length - 8; i++) {
    const value = data.readBigUInt64LE(i);
    if (value === target) {
      console.log('Found at offset ' + i + ': ' + value);
    }
    // Also check nearby values in case of rounding
    if (value > BigInt(149500000000) && value < BigInt(149700000000)) {
      const orb = Number(value) / 1e9;
      console.log('Close match at offset ' + i + ': ' + value + ' (' + orb + ' ORB)');
    }
  }

  // Also print all u64 values with their offsets
  console.log('\nAll u64 values in account:');
  for (let i = 8; i < Math.min(data.length - 8, 300); i += 8) {
    const value = data.readBigUInt64LE(i);
    if (value > 0) {
      console.log('Offset ' + i + ': ' + value + ' (' + (Number(value) / 1e9).toFixed(2) + ' ORB)');
    }
  }
}

testRound().catch(console.error);
