import { getWallet } from '../src/utils/wallet';
import { getMinerPDA, fetchBoard } from '../src/utils/accounts';
import { getConnection } from '../src/utils/solana';
import '../src/utils/config';
import BN from 'bn.js';

async function main() {
  const wallet = getWallet();
  const [minerPDA] = getMinerPDA(wallet.publicKey);
  const connection = getConnection();
  const board = await fetchBoard();

  console.log('\n===== FULL MINER ACCOUNT DUMP =====');
  console.log(`Miner PDA: ${minerPDA.toBase58()}`);
  console.log(`Current Board Round: ${board.roundId.toString()}\n`);

  const accountInfo = await connection.getAccountInfo(minerPDA);
  if (!accountInfo) {
    console.log('Miner account not found!');
    return;
  }

  const data = accountInfo.data;
  console.log(`Account data length: ${data.length} bytes\n`);

  // We're looking for values close to 2973 (current round) and 2937-2960 (checkpoint)
  console.log('Searching for u64 values between 2900-3000 (likely round/checkpoint IDs):\n');

  for (let offset = 0; offset < data.length - 8; offset += 8) {
    const value = new BN(data.slice(offset, offset + 8), 'le');

    // Check if value is small enough to convert to number safely
    if (value.lte(new BN(1000000))) {
      const num = value.toNumber();

      if (num >= 2900 && num <= 3000) {
        const hex = data.slice(offset, offset + 8).toString('hex');
        console.log(`Offset ${offset.toString().padStart(3)}: ${num.toString().padStart(4)} (hex: ${hex})`);
      }
    }
  }

  // Also show bytes 0-100 for structure reference
  console.log('\n===== FIRST 100 BYTES (HEX) =====');
  for (let i = 0; i < 100; i += 16) {
    const chunk = data.slice(i, Math.min(i + 16, 100));
    const hex = chunk.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
    console.log(`${i.toString().padStart(3)}: ${hex}`);
  }
}

main().catch(console.error);
