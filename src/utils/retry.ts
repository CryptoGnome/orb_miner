import logger from './logger';

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
}

const defaultOptions: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
};

export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context: string = 'Operation'
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(
          opts.initialDelayMs * Math.pow(opts.exponentialBase, attempt - 1),
          opts.maxDelayMs
        );
        logger.info(`${context}: Retry attempt ${attempt}/${opts.maxRetries} after ${delay}ms delay`);
        await sleep(delay);
      }

      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === opts.maxRetries) {
        logger.error(`${context}: Failed after ${opts.maxRetries} retries:`, lastError);
        throw lastError;
      }
      logger.warn(`${context}: Attempt ${attempt + 1} failed:`, error);
    }
  }

  throw lastError || new Error(`${context}: Unknown error`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { retry, sleep };
