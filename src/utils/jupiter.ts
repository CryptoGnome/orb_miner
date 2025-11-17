import axios from 'axios';
import { VersionedTransaction } from '@solana/web3.js';
import { config } from './config';
import { getConnection } from './solana';
import { getWallet } from './wallet';
import logger from './logger';
import { JupiterQuote, JupiterSwapResponse } from '../types';
import { retry } from './retry';

const WSOL_MINT = 'So11111111111111111111111111111111111111112'; // Wrapped SOL

// Get price of ORB in SOL and USD
export async function getOrbPrice(): Promise<{ priceInSol: number; priceInUsd: number }> {
  try {
    const response = await axios.get(`${config.jupiterApiUrl}/price`, {
      params: {
        ids: config.orbTokenMint.toBase58(),
      },
    });

    const priceData = response.data.data[config.orbTokenMint.toBase58()];
    if (!priceData) {
      throw new Error('ORB price not found');
    }

    return {
      priceInSol: priceData.price || 0,
      priceInUsd: priceData.price || 0,
    };
  } catch (error) {
    logger.error('Failed to fetch ORB price:', error);
    return { priceInSol: 0, priceInUsd: 0 };
  }
}

// Get swap quote from Jupiter (ORB -> SOL)
export async function getSwapQuote(
  inputAmount: number,
  slippageBps?: number
): Promise<JupiterQuote | null> {
  try {
    // Convert ORB amount to lamports (ORB has 9 decimals)
    const inputAmountLamports = Math.floor(inputAmount * 1e9);

    const params = {
      inputMint: config.orbTokenMint.toBase58(),
      outputMint: WSOL_MINT,
      amount: inputAmountLamports.toString(),
      slippageBps: slippageBps || config.slippageBps,
    };

    logger.debug('Requesting Jupiter quote:', params);

    const response = await retry(
      async () => await axios.get(`${config.jupiterApiUrl}/quote`, { params }),
      { maxRetries: 2 },
      'Jupiter quote'
    );

    const quote = response.data as JupiterQuote;
    logger.info(`Quote: ${inputAmount} ORB → ${Number(quote.outAmount) / 1e9} SOL (impact: ${quote.priceImpactPct}%)`);

    return quote;
  } catch (error) {
    logger.error('Failed to get swap quote:', error);
    return null;
  }
}

// Execute swap transaction
export async function executeSwap(quote: JupiterQuote): Promise<string | null> {
  try {
    const wallet = getWallet();
    const connection = getConnection();

    // Get swap transaction from Jupiter
    logger.info('Requesting swap transaction from Jupiter...');
    const swapResponse = await axios.post<JupiterSwapResponse>(
      `${config.jupiterApiUrl}/swap`,
      {
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      }
    );

    const { swapTransaction } = swapResponse.data;

    // Deserialize the transaction
    const transactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuf);

    // Sign the transaction
    transaction.sign([wallet]);

    // Send and confirm transaction
    logger.info('Sending swap transaction...');
    const signature = await retry(
      async () => {
        const sig = await connection.sendTransaction(transaction, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for confirmation
        await connection.confirmTransaction(sig, 'confirmed');
        return sig;
      },
      { maxRetries: config.deployMaxRetries },
      'Swap transaction'
    );

    logger.info(`Swap successful! Signature: ${signature}`);
    return signature;
  } catch (error) {
    logger.error('Failed to execute swap:', error);
    return null;
  }
}

// Swap ORB to SOL (convenience function)
export async function swapOrbToSol(
  orbAmount: number,
  slippageBps?: number
): Promise<{ success: boolean; signature?: string; solReceived?: number }> {
  try {
    logger.info(`Swapping ${orbAmount} ORB to SOL...`);

    // Get quote
    const quote = await getSwapQuote(orbAmount, slippageBps);
    if (!quote) {
      return { success: false };
    }

    const expectedSol = Number(quote.outAmount) / 1e9;
    logger.info(`Expected to receive: ${expectedSol} SOL`);

    // Execute swap
    const signature = await executeSwap(quote);
    if (!signature) {
      return { success: false };
    }

    return {
      success: true,
      signature,
      solReceived: expectedSol,
    };
  } catch (error) {
    logger.error('Swap failed:', error);
    return { success: false };
  }
}

export default {
  getOrbPrice,
  getSwapQuote,
  executeSwap,
  swapOrbToSol,
};
