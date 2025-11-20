import axios from 'axios';
import { VersionedTransaction, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { getConnection } from './solana';
import { getWallet } from './wallet';
import logger from './logger';
import { JupiterQuote, JupiterSwapResponse } from '../types';
import { retry, sleep } from './retry';
import { estimatePriorityFee, parseFeeLevel, COMPUTE_UNIT_LIMITS } from './feeEstimation';

const WSOL_MINT = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC

// Fallback endpoints if primary fails (use /swap/v1 for lite-api)
const FALLBACK_ENDPOINTS = [
  'https://lite-api.jup.ag/swap/v1',
  'https://quote-api.jup.ag/v6',
  'https://api.jup.ag/v6',
];

let workingEndpoint: string | null = null;

// Get price of ORB in SOL by using quote endpoint
// The lite-api doesn't have a /price endpoint, so we derive price from a small quote
export async function getOrbPrice(): Promise<{ priceInSol: number; priceInUsd: number }> {
  // Check cache first
  const cached = getCachedOrbPrice();
  if (cached !== null) return cached;

  try {
    // Use retry wrapper for robustness against temporary failures
    const result = await retry(
      async () => {
        // Request a quote for 1 ORB to SOL to get the current price
        const oneOrbInLamports = 1e9; // 1 ORB = 1,000,000,000 lamports

        const params = {
          inputMint: config.orbTokenMint.toBase58(),
          outputMint: WSOL_MINT,
          amount: oneOrbInLamports.toString(),
          slippageBps: '50',
          onlyDirectRoutes: 'false',
          asLegacyTransaction: 'false',
        };

        // Try to get quote from working endpoint
        let quote = null;

        // Try working endpoint first
        if (workingEndpoint) {
          quote = await tryGetQuote(workingEndpoint, params);
          if (quote) {
            logger.debug(`Using cached working endpoint: ${workingEndpoint}`);
          }
        }

        // Try primary endpoint if working endpoint failed
        if (!quote) {
          if (workingEndpoint) {
            logger.debug('Cached endpoint failed, trying primary endpoint');
            await sleep(500); // Small delay to avoid rate limiting
          }
          quote = await tryGetQuote(config.jupiterApiUrl, params);
        }

        // Try fallback endpoints with delays between attempts
        if (!quote) {
          logger.debug('Primary endpoint failed, trying fallbacks...');
          for (const fallbackUrl of FALLBACK_ENDPOINTS) {
            if (fallbackUrl === config.jupiterApiUrl) continue;

            await sleep(500); // Delay between endpoint attempts to avoid rate limiting
            quote = await tryGetQuote(fallbackUrl, params);
            if (quote) break;
          }
        }

        if (!quote || !quote.outAmount) {
          throw new Error('Failed to get ORB price quote from all endpoints');
        }

        // Calculate price: (output SOL in lamports) / (input ORB in lamports)
        // This gives us SOL per ORB
        const priceInSol = Number(quote.outAmount) / oneOrbInLamports;

        // Get SOL price in USD to calculate ORB price in USD
        const solPriceUsd = await getSolPriceInUsd();
        const priceInUsd = priceInSol * solPriceUsd;

        logger.debug(`ORB Price: ${priceInSol.toFixed(8)} SOL (~$${priceInUsd.toFixed(2)} USD) (from quote: 1 ORB → ${(Number(quote.outAmount) / 1e9).toFixed(8)} SOL)`);

        return {
          priceInSol,
          priceInUsd,
        };
      },
      {
        maxRetries: 3,
        initialDelayMs: 2000,
        maxDelayMs: 10000,
        exponentialBase: 2,
      },
      'ORB Price Fetch'
    );

    // Cache the result
    priceCache.orbPrice = {
      priceInSol: result.priceInSol,
      priceInUsd: result.priceInUsd,
      timestamp: Date.now()
    };

    return result;
  } catch (error) {
    logger.error('Failed to fetch ORB price after all retries:', error);
    return { priceInSol: 0, priceInUsd: 0 };
  }
}

// Price cache to reduce API calls (especially for dashboard)
interface PriceCache {
  orbPrice?: { priceInSol: number; priceInUsd: number; timestamp: number };
  solPrice?: { priceInUsd: number; timestamp: number };
}

const priceCache: PriceCache = {};
const PRICE_CACHE_DURATION_MS = 2 * 60 * 1000; // 2 minutes cache

// Get cached price if available and not expired
function getCachedOrbPrice(): { priceInSol: number; priceInUsd: number } | null {
  if (priceCache.orbPrice && Date.now() - priceCache.orbPrice.timestamp < PRICE_CACHE_DURATION_MS) {
    logger.debug(`Using cached ORB price (age: ${Math.floor((Date.now() - priceCache.orbPrice.timestamp) / 1000)}s)`);
    return { priceInSol: priceCache.orbPrice.priceInSol, priceInUsd: priceCache.orbPrice.priceInUsd };
  }
  return null;
}

function getCachedSolPrice(): number | null {
  if (priceCache.solPrice && Date.now() - priceCache.solPrice.timestamp < PRICE_CACHE_DURATION_MS) {
    logger.debug(`Using cached SOL price (age: ${Math.floor((Date.now() - priceCache.solPrice.timestamp) / 1000)}s)`);
    return priceCache.solPrice.priceInUsd;
  }
  return null;
}

// Get price of SOL in USD (via USDC)
export async function getSolPriceInUsd(): Promise<number> {
  // Check cache first
  const cached = getCachedSolPrice();
  if (cached !== null) return cached;

  try {
    return await retry(
      async () => {
        // Request a quote for 1 SOL to USDC to get the current price
        const oneSolInLamports = 1e9; // 1 SOL = 1,000,000,000 lamports

        const params = {
          inputMint: WSOL_MINT,
          outputMint: USDC_MINT,
          amount: oneSolInLamports.toString(),
          slippageBps: '50',
          onlyDirectRoutes: 'false',
          asLegacyTransaction: 'false',
        };

        // Try to get quote
        let quote = null;

        // Try working endpoint first
        if (workingEndpoint) {
          quote = await tryGetQuote(workingEndpoint, params);
        }

        // Try primary endpoint if working endpoint failed
        if (!quote) {
          if (workingEndpoint) {
            await sleep(500); // Small delay to avoid rate limiting
          }
          quote = await tryGetQuote(config.jupiterApiUrl, params);
        }

        // Try fallback endpoints with delays
        if (!quote) {
          for (const fallbackUrl of FALLBACK_ENDPOINTS) {
            if (fallbackUrl === config.jupiterApiUrl) continue;
            await sleep(500); // Delay between endpoint attempts
            quote = await tryGetQuote(fallbackUrl, params);
            if (quote) break;
          }
        }

        if (!quote || !quote.outAmount) {
          throw new Error('Failed to get SOL/USD price quote from all endpoints');
        }

        // USDC has 6 decimals, so divide by 1e6
        const priceInUsd = Number(quote.outAmount) / 1e6;

        logger.debug(`SOL Price: $${priceInUsd.toFixed(2)} USD (from quote: 1 SOL → ${priceInUsd.toFixed(2)} USDC)`);

        // Cache the result
        priceCache.solPrice = { priceInUsd, timestamp: Date.now() };

        return priceInUsd;
      },
      {
        maxRetries: 3,
        initialDelayMs: 2000,
        maxDelayMs: 10000,
        exponentialBase: 2,
      },
      'SOL Price Fetch'
    );
  } catch (error) {
    logger.error('Failed to fetch SOL/USD price after all retries:', error);
    return 0;
  }
}

// Try to get quote from a specific endpoint
async function tryGetQuote(
  endpoint: string,
  params: any
): Promise<JupiterQuote | null> {
  try {
    const quoteUrl = `${endpoint}/quote`;
    const response = await axios.get(quoteUrl, {
      params,
      timeout: 20000, // Increased from 15s to 20s for better reliability
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ORB-Mining-Bot/1.0', // Identify as bot to avoid rate limiting
      },
    });

    if (response.data && response.data.outAmount) {
      // Cache working endpoint
      if (!workingEndpoint) {
        workingEndpoint = endpoint;
        logger.info(`✅ Found working Jupiter endpoint: ${endpoint}`);
      }
      return response.data as JupiterQuote;
    }
    return null;
  } catch (error: any) {
    // Log more detailed error info for debugging
    const errorMsg = error.response?.status
      ? `HTTP ${error.response.status}: ${error.response.statusText}`
      : error.code || error.message;
    logger.debug(`Endpoint ${endpoint} failed: ${errorMsg}`);

    // If we get rate limited (429), clear the cached working endpoint
    if (error.response?.status === 429) {
      logger.warn(`Rate limited by ${endpoint} - will try other endpoints`);
      if (workingEndpoint === endpoint) {
        workingEndpoint = null;
      }
    }

    return null;
  }
}

// Get swap quote from Jupiter (ORB -> SOL) with automatic fallback
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
      slippageBps: (slippageBps || config.slippageBps).toString(),
      onlyDirectRoutes: 'false',
      asLegacyTransaction: 'false',
    };

    logger.debug('Requesting Jupiter quote with params:', params);

    // Try working endpoint first if we have one cached
    if (workingEndpoint) {
      const quote = await tryGetQuote(workingEndpoint, params);
      if (quote) {
        logger.info(`Quote: ${inputAmount} ORB → ${Number(quote.outAmount) / 1e9} SOL (impact: ${quote.priceImpactPct}%)`);
        return quote;
      }
      // If cached endpoint fails, clear it
      logger.warn(`Cached endpoint ${workingEndpoint} failed, trying fallbacks...`);
      workingEndpoint = null;
    }

    // Try primary endpoint from config
    const primaryQuote = await tryGetQuote(config.jupiterApiUrl, params);
    if (primaryQuote) {
      logger.info(`Quote: ${inputAmount} ORB → ${Number(primaryQuote.outAmount) / 1e9} SOL (impact: ${primaryQuote.priceImpactPct}%)`);
      return primaryQuote;
    }

    // Try fallback endpoints
    logger.warn('Primary endpoint failed, trying fallbacks...');
    for (const fallbackUrl of FALLBACK_ENDPOINTS) {
      if (fallbackUrl === config.jupiterApiUrl) continue; // Skip if same as primary

      logger.debug(`Trying fallback: ${fallbackUrl}`);
      const quote = await tryGetQuote(fallbackUrl, params);
      if (quote) {
        logger.info(`✅ Fallback successful: ${fallbackUrl}`);
        logger.info(`Quote: ${inputAmount} ORB → ${Number(quote.outAmount) / 1e9} SOL (impact: ${quote.priceImpactPct}%)`);
        logger.info(`💡 Consider updating .env: JUPITER_API_URL=${fallbackUrl}`);
        return quote;
      }
    }

    logger.error('❌ All Jupiter endpoints failed');
    return null;
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

    // Use working endpoint if available, otherwise use config
    const swapEndpoint = workingEndpoint || config.jupiterApiUrl;

    // Get swap transaction from Jupiter
    logger.info(`Requesting swap transaction from ${swapEndpoint}...`);

    // Determine priority fee (use dynamic estimation or config value)
    let priorityFeeLamports: number | 'auto';

    if (config.swapPriorityFeeLamports === 'auto') {
      // Use 'auto' to let Jupiter handle it
      priorityFeeLamports = 'auto';
      logger.debug('Using Jupiter auto priority fee');
    } else if (config.swapPriorityFeeLamports > 0) {
      // Use static config value
      priorityFeeLamports = config.swapPriorityFeeLamports;
      logger.debug(`Using static swap priority fee: ${priorityFeeLamports} lamports (~${(priorityFeeLamports / 1e9).toFixed(6)} SOL)`);
    } else {
      // Use dynamic fee estimation from our utility
      try {
        const feeLevel = parseFeeLevel(config.priorityFeeLevel);

        // Estimate fee for swap (use ORB and SOL token accounts)
        const accounts = [
          config.orbTokenMint,
          new PublicKey(WSOL_MINT),
          wallet.publicKey,
        ];

        const feeEstimate = await estimatePriorityFee(
          connection,
          accounts,
          feeLevel,
          COMPUTE_UNIT_LIMITS.SWAP
        );

        // Convert from micro-lamports to total lamports
        priorityFeeLamports = feeEstimate.totalFeeLamports;
        logger.debug(`Using dynamic swap fee estimate: ${priorityFeeLamports} lamports (~${(priorityFeeLamports / 1e9).toFixed(6)} SOL)`);
      } catch (error) {
        logger.warn('Fee estimation failed for swap, using fallback', error);
        priorityFeeLamports = 100000; // Fallback: 0.0001 SOL
      }
    }

    const swapResponse = await axios.post<JupiterSwapResponse>(
      `${swapEndpoint}/swap`,
      {
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: priorityFeeLamports,
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
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
        const sig = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(sig, 'confirmed');
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }
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
  getSolPriceInUsd,
  getSwapQuote,
  executeSwap,
  swapOrbToSol,
};
