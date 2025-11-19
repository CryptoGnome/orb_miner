// Load environment variables from parent directory BEFORE importing bot modules
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Load .env from parent directory
dotenvConfig({ path: path.join(process.cwd(), '..', '.env') });

// Now import and initialize database
import { initializeDatabase } from '@bot/utils/database';

let isInitialized = false;

export async function ensureBotInitialized() {
  if (!isInitialized) {
    try {
      await initializeDatabase();
      isInitialized = true;
      console.log('Bot utilities initialized successfully');
    } catch (error) {
      console.error('Failed to initialize bot utilities:', error);
      throw error;
    }
  }
}
