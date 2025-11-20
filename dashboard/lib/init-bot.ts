/**
 * Initialize bot utilities for dashboard API routes
 * Configuration is loaded from SQLite database (no .env needed)
 */
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
