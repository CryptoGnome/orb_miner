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

  console.log('\n===== MINER ACCOUNT DEBUG =====');
  console.log(`Miner PDA: ${minerPDA.toBase58()}`);
  console.log(`Current Board Round: ${board.roundId.toString()}`);

  const accountInfo = await connection.getAccountInfo(minerPDA);
  if (!accountInfo) {
    console.log('Miner account not found!');
    return;
  }

  const data = accountInfo.data;
  console.log(`\nAccount data length: ${data.length} bytes`);
  console.log(`\nBytes 440-520 (hex):`);
  console.log(data.slice(440, 520).toString('hex'));

  // Read checkpoint fields per IDL orb-idl.json
  console.log(`\n===== CHECKPOINT FIELDS (PER IDL) =====`);

  const fields = [
    { name: 'checkpoint_fee', offset: 440 },     // Per IDL
    { name: 'checkpoint_id', offset: 448 },      // Per IDL - last checkpointed round
    { name: 'last_claim_ore_at', offset: 456 },  // Per IDL
    { name: 'last_claim_sol_at', offset: 464 },  // Per IDL
    { name: 'round_id', offset: 512 },           // Per IDL - last deployed round
  ];

  for (const field of fields) {
    try {
      const value = new BN(data.slice(field.offset, field.offset + 8), 'le');
      console.log(`${field.name} @ ${field.offset}: ${value.toString()}`);
    } catch (e) {
      console.log(`${field.name} @ ${field.offset}: ERROR`);
    }
  }
}

main().catch(console.error);
