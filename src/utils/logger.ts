import winston from 'winston';
import path from 'path';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// File log format (detailed)
const fileLogFormat = printf(({ level, message, timestamp, stack }) => {
  if (stack) {
    return `${timestamp} [${level}]: ${message}\n${stack}`;
  }
  return `${timestamp} [${level}]: ${message}`;
});

// Console log format (clean, user-friendly)
const consoleLogFormat = printf(({ message }) => {
  // Strip technical details from console output
  // Keep only user-friendly messages
  return String(message);
});

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    fileLogFormat
  ),
  transports: [
    // Console transport - clean UI (no timestamps, colors, or technical details)
    new winston.transports.Console({
      format: combine(
        colorize(),
        consoleLogFormat
      ),
      level: 'info', // Only show info and above on console
    }),
    // File transport for all logs (detailed)
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        fileLogFormat
      ),
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        fileLogFormat
      ),
    }),
    // File transport for transactions
    new winston.transports.File({
      filename: path.join('logs', 'transactions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        fileLogFormat
      ),
    }),
  ],
});

// Helper functions for clean console output
export const ui = {
  header: (text: string) => {
    logger.info(`\n${'═'.repeat(60)}`);
    logger.info(`  ${text}`);
    logger.info('═'.repeat(60));
  },

  section: (text: string) => {
    logger.info(`\n${'─'.repeat(60)}`);
    logger.info(`  ${text}`);
    logger.info('─'.repeat(60));
  },

  success: (text: string) => {
    logger.info(`✅ ${text}`);
  },

  error: (text: string) => {
    logger.info(`❌ ${text}`);
  },

  warning: (text: string) => {
    logger.info(`⚠️  ${text}`);
  },

  info: (text: string) => {
    logger.info(`ℹ️  ${text}`);
  },

  mining: (text: string) => {
    logger.info(`⛏️  ${text}`);
  },

  claim: (text: string) => {
    logger.info(`💰 ${text}`);
  },

  swap: (text: string) => {
    logger.info(`🔄 ${text}`);
  },

  stake: (text: string) => {
    logger.info(`📈 ${text}`);
  },

  status: (label: string, value: string) => {
    logger.info(`   ${label.padEnd(20)} ${value}`);
  },

  blank: () => {
    logger.info('');
  },
};

export default logger;
