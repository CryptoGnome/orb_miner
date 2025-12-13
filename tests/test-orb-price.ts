import { getOrbPrice } from '../src/utils/jupiter';
import { loadConfigWithDB } from '../src/utils/config';
import logger from '../src/utils/logger';

/**
 * Test ORB price fetching from Jupiter API
 */
async function testOrbPrice() {
  logger.info('='.repeat(60));
  logger.info('Testing ORB Price Fetching');
  logger.info('='.repeat(60));

  // Load config from database first
  const config = await loadConfigWithDB();

  logger.info(`Jupiter API URL: ${config.jupiterApiUrl}`);
  logger.info(`Jupiter API Key: ${config.jupiterApiKey ? '***' + config.jupiterApiKey.slice(-4) : '(not set)'}`);
  logger.info(`ORB Token Mint: ${config.orbTokenMint.toBase58()}`);

  logger.info('\nAttempting to fetch ORB price...');

  try {
    const { priceInSol, priceInUsd } = await getOrbPrice();

    if (priceInSol === 0) {
      logger.error('❌ Price fetch returned 0 - API call likely failed');
      logger.info('\n💡 Jupiter API now requires an API key from https://station.jup.ag/api-keys');
      logger.info('💡 Free tier: 60 requests/minute');
      logger.info('💡 Add your key in dashboard settings under "Swap" → "Jupiter API Key"');
    } else {
      logger.info(`✅ ORB Price fetched successfully!`);
      logger.info(`  Price in SOL: ${priceInSol.toFixed(8)} SOL`);
      logger.info(`  Price in USD: $${priceInUsd.toFixed(6)}`);
    }
  } catch (error) {
    logger.error('❌ Test failed:', error);
  }
}

testOrbPrice().catch(console.error);
