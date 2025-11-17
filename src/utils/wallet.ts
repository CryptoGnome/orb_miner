import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import bs58 from 'bs58';
import { config } from './config';
import { getConnection } from './solana';
import logger from './logger';

let wallet: Keypair | null = null;

export function getWallet(): Keypair {
  if (!wallet) {
    try {
      // Decode the base58 private key
      const privateKeyBytes = bs58.decode(config.privateKey);
      wallet = Keypair.fromSecretKey(privateKeyBytes);
      logger.info(`Wallet loaded: ${wallet.publicKey.toBase58()}`);
    } catch (error) {
      logger.error('Failed to load wallet from private key:', error);
      throw new Error('Invalid private key format. Please provide a base58-encoded private key.');
    }
  }
  return wallet;
}

export async function getSolBalance(publicKey?: PublicKey): Promise<number> {
  const connection = getConnection();
  const address = publicKey || getWallet().publicKey;

  const balance = await connection.getBalance(address);
  return balance / LAMPORTS_PER_SOL;
}

export async function getOrbBalance(publicKey?: PublicKey): Promise<number> {
  const connection = getConnection();
  const address = publicKey || getWallet().publicKey;

  try {
    // Get the associated token account for ORB
    const ata = await getAssociatedTokenAddress(
      config.orbTokenMint,
      address
    );

    // Get the token account info
    const accountInfo = await getAccount(connection, ata);

    // ORB typically has 9 decimals (like SOL)
    return Number(accountInfo.amount) / 1e9;
  } catch (error) {
    // If the account doesn't exist, balance is 0
    logger.debug(`ORB token account not found for ${address.toBase58()}, balance is 0`);
    return 0;
  }
}

export async function getBalances(publicKey?: PublicKey): Promise<{ sol: number; orb: number }> {
  const [sol, orb] = await Promise.all([
    getSolBalance(publicKey),
    getOrbBalance(publicKey),
  ]);

  return { sol, orb };
}

export default { getWallet, getSolBalance, getOrbBalance, getBalances };
