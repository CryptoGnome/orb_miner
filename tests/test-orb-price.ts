import { getOrbPrice } from '../src/utils/jupiter';
import { config } from '../src/utils/config';
import logger from '../src/utils/logger';

/**
 * Test ORB price fetching from Jupiter API
 */
async function testOrbPrice() {
  logger.info('='.repeat(60));
  logger.info('Testing ORB Price Fetching');
  logger.info('='.repeat(60));

  logger.info(`Jupiter API URL: ${config.jupiterApiUrl}`);
  logger.info(`ORB Token Mint: ${config.orbTokenMint.toBase58()}`);

  logger.info('\nAttempting to fetch ORB price...');

  try {
    const { priceInSol, priceInUsd } = await getOrbPrice();

    if (priceInSol === 0) {
      logger.error('❌ Price fetch returned 0 - API call likely failed');
      logger.info('\n💡 The issue is that lite-api.jup.ag does NOT have a /price endpoint');
      logger.info('💡 We need to use the quote endpoint instead to derive the price');
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
