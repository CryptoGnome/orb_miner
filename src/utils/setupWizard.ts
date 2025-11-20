import readline from 'readline';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { saveSetting } from './settingsLoader';
import logger, { ui } from './logger';

/**
 * Interactive first-run setup wizard
 * Prompts user for PRIVATE_KEY and RPC_ENDPOINT
 */
export async function runSetupWizard(): Promise<boolean> {
  try {
    ui.blank();
    ui.header('🚀 FIRST-TIME SETUP WIZARD');
    ui.info('Welcome to ORB Mining Bot! Let\'s get you configured.');
    ui.blank();

    ui.section('REQUIRED SETTINGS');
    ui.info('We need a few settings to get started:');
    ui.info('  1. PRIVATE_KEY - Your Solana wallet private key (Base58 format)');
    ui.info('  2. RPC_ENDPOINT - Your Solana RPC endpoint URL');
    ui.blank();

    ui.warning('⚠️  Your private key will be encrypted and stored securely in the database.');
    ui.blank();

    // Prompt for PRIVATE_KEY
    const privateKey = await promptForPrivateKey();
    if (!privateKey) {
      ui.error('Setup cancelled - PRIVATE_KEY is required');
      return false;
    }

    // Prompt for RPC_ENDPOINT
    const rpcEndpoint = await promptForRpcEndpoint();

    // Save settings
    ui.section('SAVING SETTINGS');

    await saveSetting('PRIVATE_KEY', privateKey, 'string', 'Base58 wallet private key (REQUIRED)', true);
    ui.success('✓ PRIVATE_KEY saved (encrypted)');

    await saveSetting('RPC_ENDPOINT', rpcEndpoint, 'string', 'Solana RPC URL');
    ui.success(`✓ RPC_ENDPOINT saved: ${rpcEndpoint}`);

    ui.blank();
    ui.header('✅ SETUP COMPLETE!');
    ui.info('Your bot is now configured and ready to run.');
    ui.info('You can change settings anytime via the dashboard at http://localhost:3000/settings');
    ui.blank();

    return true;
  } catch (error) {
    logger.error('Setup wizard failed:', error);
    return false;
  }
}

/**
 * Prompt for PRIVATE_KEY with validation
 */
async function promptForPrivateKey(): Promise<string | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const askForKey = () => {
      rl.question('\n📝 Enter your wallet PRIVATE_KEY (Base58 format): ', (answer) => {
        const trimmed = answer.trim();

        if (!trimmed) {
          ui.error('PRIVATE_KEY cannot be empty');
          askForKey();
          return;
        }

        // Validate Base58 format by attempting to decode
        try {
          const decoded = bs58.decode(trimmed);

          // Validate it's a valid keypair (should be 64 bytes)
          if (decoded.length !== 64) {
            ui.error(`Invalid key length: ${decoded.length} bytes (expected 64)`);
            ui.info('Make sure you\'re using the full Base58 private key, not just the public key');
            askForKey();
            return;
          }

          // Validate it creates a valid Keypair
          try {
            Keypair.fromSecretKey(decoded);
            ui.success('✓ Valid private key format');
            rl.close();
            resolve(trimmed);
          } catch {
            ui.error('Invalid keypair - cannot create wallet from this key');
            askForKey();
            return;
          }
        } catch (error) {
          ui.error('Invalid Base58 format - please check your private key');
          askForKey();
          return;
        }
      });
    };

    askForKey();
  });
}

/**
 * Prompt for RPC_ENDPOINT with default fallback
 */
async function promptForRpcEndpoint(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const defaultRpc = 'https://api.mainnet-beta.solana.com';

  return new Promise((resolve) => {
    rl.question(
      `\n📝 Enter RPC_ENDPOINT (press Enter for default: ${defaultRpc}): `,
      (answer) => {
        const trimmed = answer.trim();
        rl.close();

        if (!trimmed) {
          ui.info(`Using default RPC: ${defaultRpc}`);
          resolve(defaultRpc);
        } else {
          // Basic URL validation
          try {
            new URL(trimmed);
            resolve(trimmed);
          } catch {
            ui.warning('Invalid URL format, using default instead');
            resolve(defaultRpc);
          }
        }
      }
    );
  });
}

/**
 * Check if setup wizard is needed (PRIVATE_KEY is missing or empty)
 */
export function isSetupNeeded(privateKey: string | undefined): boolean {
  return !privateKey || privateKey.trim() === '';
}
