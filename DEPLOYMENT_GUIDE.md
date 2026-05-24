# Guía de Despliegue Automático (GitHub Actions + VPS)

### 1. Preparar el Servidor (VPS)
*   Crear carpeta del proyecto: `mkdir -p /var/www/nombre-proyecto`
*   Instalar Node.js y PM2:
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    npm install -g pm2
    ```

### 2. Configurar Llaves SSH
*   En tu PC local, copia la llave al VPS:
    ```bash
    ssh-copy-id -i ~/.ssh/tu_llave.pub root@IP_DEL_VPS
    ```

### 3. Configurar GitHub Secrets
Ir a: **Settings > Secrets and variables > Actions > New repository secret**
*   `SSH_PRIVATE_KEY`: Contenido de tu llave privada local (`cat ~/.ssh/tu_llave`).
*   `VPS_IP`: La IP de tu servidor.
*   `VPS_USER`: El usuario (ej. `root`).

### 4. Archivos en el Proyecto (Raíz)

**`ecosystem.config.js`** (Para PM2):
```javascript
module.exports = {
  apps: [{
    name: 'nombre-app',
    script: 'dist/nombre-app/server/server.mjs', // Ruta al index de tu build
    env: { NODE_ENV: 'production', PORT: 4000 }
  }]
};
```

**`.github/workflows/deploy.yml`** (El Workflow):
```yaml
name: Deploy
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2 # O setup-node si no usas bun
      - run: bun install
      - run: bun run build
      - uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.VPS_IP }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          source: "dist/nombre-app/*,ecosystem.config.js,package.json"
          target: "/var/www/nombre-proyecto"
          strip_components: 1
      - uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_IP }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/nombre-proyecto
            pm2 startOrRestart ecosystem.config.js
            pm2 save
```

### 5. Primer Despliegue
*   Haz `git push origin main`.
*   Revisa la pestaña **Actions** en GitHub.
*   ¡Listo!
