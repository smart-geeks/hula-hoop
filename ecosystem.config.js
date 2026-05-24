module.exports = {
  apps: [
    {
      name: 'hula-hoop-ssr',
      script: 'dist/hula-hoop/server/server.mjs',
      cwd: '/var/www/hula-hoop',   // Asegura que PM2 resuelva las rutas relativas al proyecto
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'hula-hoop-print-bridge',
      script: 'tools/printer-bridge.js',
      cwd: '/var/www/hula-hoop',   // Evita que PM2 busque en la carpeta home del usuario SSH
      interpreter: 'bun',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 9101
      }
    }
  ]
};
