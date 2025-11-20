import crypto from 'crypto';
import os from 'os';
import path from 'path';

/**
 * Simple encryption/decryption for sensitive settings
 * Uses AES-256-GCM with a key derived from machine hostname and data directory
 *
 * NOTE: This provides basic encryption for local storage. The database file
 * itself should be protected with proper file permissions.
 */

// Generate a stable encryption key based on machine hostname and data directory
// This ensures the key is consistent across restarts but unique per installation
function generateEncryptionKey(): Buffer {
  const hostname = os.hostname();
  const dataDir = path.resolve(__dirname, '../../data');
  const keyMaterial = `orb-miner-${hostname}-${dataDir}`;
  return crypto.createHash('sha256').update(keyMaterial).digest();
}

const ENCRYPTION_KEY = generateEncryptionKey();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

/**
 * Encrypt a string value
 */
export function encrypt(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt an encrypted string
 */
export function decrypt(encryptedText: string): string {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error('Decryption failed');
  }
}

/**
 * Check if a value appears to be encrypted
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1]);
}
