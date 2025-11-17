import { Connection, ConnectionConfig } from '@solana/web3.js';
import { config } from './config';
import logger from './logger';

let connection: Connection | null = null;

const connectionConfig: ConnectionConfig = {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
};

export function getConnection(): Connection {
  if (!connection) {
    logger.info(`Connecting to Solana RPC: ${config.rpcEndpoint}`);
    connection = new Connection(config.rpcEndpoint, connectionConfig);
    logger.info('Solana connection established');
  }
  return connection;
}

export async function getCurrentSlot(): Promise<number> {
  const conn = getConnection();
  return await conn.getSlot();
}

export async function waitForSlot(targetSlot: number): Promise<void> {
  const conn = getConnection();
  logger.info(`Waiting for slot ${targetSlot}...`);

  while (true) {
    const currentSlot = await conn.getSlot();
    if (currentSlot >= targetSlot) {
      logger.info(`Reached slot ${currentSlot}`);
      break;
    }
    // Wait 400ms before checking again (Solana slot time is ~400ms)
    await new Promise(resolve => setTimeout(resolve, 400));
  }
}

export default { getConnection, getCurrentSlot, waitForSlot };
