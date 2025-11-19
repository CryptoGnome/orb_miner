import { config } from 'dotenv';
import path from 'path';

// Load environment variables from parent directory
config({ path: path.join(process.cwd(), '..', '.env') });

// Re-export the config after loading env vars
export { config as botConfig } from '@bot/utils/config';
export { Connection, PublicKey } from '@solana/web3.js';
