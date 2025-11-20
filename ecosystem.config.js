module.exports = {
  apps: [
    {
      name: 'orb-bot',
      script: 'npm',
      args: 'run start:bot',
      cwd: '/home/gizmo/orb_miner',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '~/.pm2/logs/orb-bot-error.log',
      out_file: '~/.pm2/logs/orb-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: 'orb-dashboard',
      script: 'npm',
      args: 'run start:dashboard',
      cwd: '/home/gizmo/orb_miner',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '~/.pm2/logs/orb-dashboard-error.log',
      out_file: '~/.pm2/logs/orb-dashboard-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
