module.exports = {
  apps: [
    {
      name: 'hula-hoop',
      script: '/var/www/hula-hoop/server/server.mjs',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      watch: false,
    },
  ],
};
