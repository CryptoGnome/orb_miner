// Search for 149.6 ORB anywhere in the account
const { Connection, PublicKey } = require('@solana/web3.js');

async function findMotherload() {
  const connection = new Connection('https://rpc.ironforge.network/mainnet?apiKey=01J60HT7WDENVAHVFBE0EEBK03');
  const programId = new PublicKey('boreXQWsKpsJz5RR9BMtN8Vk4ndAk23sutj8spWYhwk');

  // Find Round PDA for round 2204
  const roundId = Buffer.alloc(8);
  roundId.writeBigUInt64LE(BigInt(2204));

  const [roundPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('round'), roundId],
    programId
  );

  console.log('Searching for 149.6 ORB in Round account...\n');

  const accountInfo = await connection.getAccountInfo(roundPDA);
  const data = accountInfo.data;

  // Search for values around 149.6 ORB (149,600,000,000 lamports)
  const target = 149.6 * 1e9;
  const tolerance = 1e9; // Within 1 ORB

  console.log('Account size:', data.length, 'bytes\n');
  console.log('Searching for values around', target, 'lamports (', (target / 1e9).toFixed(2), 'ORB)\n');

  let found = false;
  for (let i = 0; i < data.length - 8; i++) {
    const value = Number(data.readBigUInt64LE(i));
    if (Math.abs(value - target) < tolerance) {
      console.log('FOUND at offset', i, ':', value, '(', (value / 1e9).toFixed(2), 'ORB)');
      found = true;
    }
  }

  if (!found) {
    console.log('NOT FOUND! Maybe the motherload is somewhere else?');
    console.log('\nLet me check ALL non-zero u64 values > 1 billion:');
    for (let i = 0; i < data.length - 8; i++) {
      const value = Number(data.readBigUInt64LE(i));
      if (value > 1e9 && value < 1e15) {  // Between 1 ORB and 1M ORB
        console.log('Offset', i, ':', value, '(', (value / 1e9).toFixed(2), 'ORB)');
      }
    }
  }
}

findMotherload().catch(console.error);
