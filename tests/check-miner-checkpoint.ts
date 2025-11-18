import { getWallet } from '../src/utils/wallet';
import { getMinerPDA, fetchBoard } from '../src/utils/accounts';
import { getConnection } from '../src/utils/solana';

/**
 * Check miner checkpoint status
 */

async function main() {
  const wallet = getWallet();
  const connection = getConnection();
  const [minerPDA] = getMinerPDA(wallet.publicKey);

  console.log('Wallet:', wallet.publicKey.toBase58());
  console.log('Miner PDA:', minerPDA.toBase58());
  console.log('');

  const accountInfo = await connection.getAccountInfo(minerPDA);
  if (!accountInfo) {
    console.log('Miner account not found');
    return;
  }

  const data = accountInfo.data;

  // Per IDL orb-idl.json:
  // checkpoint_fee at offset 440 (absolute)
  // checkpoint_id at offset 448 (absolute) - PER IDL
  // round_id at offset 512 (absolute) - PER IDL
  const checkpointId = data.readBigUInt64LE(448);  // Read checkpoint_id per IDL
  const roundId = data.readBigUInt64LE(512);       // Read round_id per IDL

  // Get current board round
  const board = await fetchBoard();

  console.log('Current Board Round:', board.roundId.toString());
  console.log('Miner Checkpoint ID (offset 448):', checkpointId.toString());
  console.log('Miner Round ID (offset 512):', roundId.toString());
  console.log('');
  console.log('Rounds behind:', (board.roundId.toNumber() - Number(checkpointId)));
  console.log('');

  if (Number(checkpointId) < board.roundId.toNumber()) {
    console.log('⚠️  Miner needs to checkpoint before deploying');
    console.log(`Need to process rounds ${Number(checkpointId) + 1} through ${board.roundId.subn(1).toString()}`);
  } else {
    console.log('✅ Miner is caught up');
  }
}

main();
