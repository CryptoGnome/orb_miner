#!/usr/bin/env ts-node
/**
 * Test Jupiter NEW API (api.jup.ag) with and without API key
 * Rate Limit: Basic tier = 1 request per second (RPS) with API key required
 */

import axios from 'axios';

const NEW_API_ENDPOINT = 'https://api.jup.ag/v6';
const FALLBACK_ENDPOINT = 'https://quote-api.jup.ag/v6';

const testMints = {
  ORB: 'orebyr4mDiPDVgnfqvF5xiu5gKnh94Szuz8dqgNqdJn',
  WSOL: 'So11111111111111111111111111111111111111112',
};

async function testEndpoint(baseUrl: string, apiKey?: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${baseUrl}`);
  console.log(`API Key: ${apiKey ? '***' + apiKey.slice(-4) : 'NOT PROVIDED'}`);
  console.log('='.repeat(60));

  try {
    console.log('\nFetching quote for 1 ORB → SOL...');
    const quoteUrl = `${baseUrl}/quote`;
    const params = {
      inputMint: testMints.ORB,
      outputMint: testMints.WSOL,
      amount: '1000000000', // 1 ORB
      slippageBps: '50',
    };

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'ORB-Mining-Bot/1.0',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    console.log(`GET ${quoteUrl}`);
    console.log('Params:', JSON.stringify(params, null, 2));
    console.log('Headers:', JSON.stringify(headers, null, 2));

    const response = await axios.get(quoteUrl, {
      params,
      headers,
      timeout: 20000,
    });

    if (response.data && response.data.outAmount) {
      const solReceived = Number(response.data.outAmount) / 1e9;
      console.log(`✅ SUCCESS!`);
      console.log(`  1 ORB = ${solReceived.toFixed(8)} SOL`);
      console.log(`  Price Impact: ${response.data.priceImpactPct}%`);
      console.log(`  Response status: ${response.status}`);
      return true;
    } else {
      console.log(`❌ Invalid response (no outAmount)`);
      return false;
    }
  } catch (error: any) {
    console.log(`❌ FAILED!`);
    if (error.response) {
      console.log(`  Status: ${error.response.status} ${error.response.statusText}`);
      console.log(`  Error:`, JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 401) {
        console.log(`\n  💡 401 Unauthorized = API key required or invalid`);
      } else if (error.response.status === 429) {
        console.log(`\n  💡 429 Rate Limited = Exceeded 1 RPS limit`);
      }
    } else {
      console.log(`  Error: ${error.code || error.message}`);
    }
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('JUPITER NEW API TEST');
  console.log('='.repeat(60));
  console.log('\nℹ️  Jupiter migrated from lite-api.jup.ag to api.jup.ag');
  console.log('ℹ️  NEW API requires API key: https://station.jup.ag/api-keys');
  console.log('ℹ️  Rate Limit: 1 request per second (RPS)');

  // Read API key from environment if available
  const apiKey = process.env.JUPITER_API_KEY;

  // Test 1: New API without key (should fail with 401)
  console.log('\n\n📝 TEST 1: New API WITHOUT key (expect 401)');
  await testEndpoint(NEW_API_ENDPOINT);

  await new Promise(resolve => setTimeout(resolve, 2000)); // Respect rate limit

  // Test 2: Fallback endpoint without key
  console.log('\n\n📝 TEST 2: Fallback endpoint WITHOUT key');
  await testEndpoint(FALLBACK_ENDPOINT);

  // Test 3: New API with key (if provided)
  if (apiKey) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Respect rate limit
    console.log('\n\n📝 TEST 3: New API WITH key (should succeed)');
    await testEndpoint(NEW_API_ENDPOINT, apiKey);
  } else {
    console.log('\n\n📝 TEST 3: SKIPPED (no API key provided)');
    console.log('💡 To test with API key, run:');
    console.log('   JUPITER_API_KEY=your_key npx ts-node tests/test-jupiter-new-api.ts');
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('✅ Migration steps:');
  console.log('  1. Get free API key: https://station.jup.ag/api-keys');
  console.log('  2. Add to dashboard: Settings → Swap → Jupiter API Key');
  console.log('  3. Default endpoint updated to: https://api.jup.ag/v6');
  console.log('\n⚠️  Rate Limit: 1 request/second - bot is cached (2min) so should be fine');
}

main().catch(console.error);
