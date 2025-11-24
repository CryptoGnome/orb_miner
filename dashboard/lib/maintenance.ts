import * as fs from 'fs';
import * as path from 'path';

const MAINTENANCE_FILE = path.join(process.cwd(), '..', 'data', '.maintenance');

/**
 * Check if the system is in maintenance mode
 * Returns true if maintenance file exists
 */
export function isMaintenanceMode(): boolean {
  try {
    return fs.existsSync(MAINTENANCE_FILE);
  } catch {
    return false;
  }
}

/**
 * Maintenance mode response for API endpoints
 */
export const MAINTENANCE_RESPONSE = {
  maintenance: true,
  message: 'System is currently undergoing maintenance. Please wait...',
};
