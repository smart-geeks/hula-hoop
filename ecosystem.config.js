module.exports = {
  apps: [
    {
      name: 'hula-hoop-ssr',
      script: 'dist/hula-hoop/server/server.mjs',
      instances: 'max',           // Utiliza el modo cluster para aprovechar todos los núcleos del CPU
      exec_mode: 'cluster',       // Balanceo de carga nativo
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    },
    {
      name: 'hula-hoop-print-bridge',
      script: 'tools/printer-bridge.js',
      interpreter: 'bun',         // Corre con Bun para la máxima velocidad y menor consumo
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 9101
      }
    }
  ]
};
