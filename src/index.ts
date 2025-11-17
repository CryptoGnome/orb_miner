import { config } from './utils/config';
import logger from './utils/logger';
import { queryCommand } from './commands/query';
import { deployCommand } from './commands/deploy';
import { claimCommand } from './commands/claim';
import { stakeCommand } from './commands/stake';
import { swapCommand } from './commands/swap';
import { autoDeployCommand } from './commands/autoDeploy';

async function main() {
  try {
    logger.info('ORB Mining Bot Starting...');
    logger.info(`Bot Action: ${config.botAction}`);
    logger.info(`Network: ${config.network}`);
    logger.info(`ORB Program ID: ${config.orbProgramId.toBase58()}`);
    logger.info('');

    // Route to appropriate command based on config
    switch (config.botAction) {
      case 'query':
        await queryCommand();
        break;

      case 'deploy':
        await deployCommand();
        break;

      case 'claim':
        await claimCommand();
        break;

      case 'stake':
        await stakeCommand();
        break;

      case 'swap':
        await swapCommand();
        break;

      case 'auto-deploy':
        await autoDeployCommand();
        break;

      default:
        logger.error(`Unknown bot action: ${config.botAction}`);
        logger.info('Valid actions: query, deploy, claim, stake, swap, auto-deploy');
        process.exit(1);
    }

    logger.info('Bot execution completed successfully');
  } catch (error) {
    logger.error('Bot execution failed:', error);
    process.exit(1);
  }
}

// Run the bot
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
