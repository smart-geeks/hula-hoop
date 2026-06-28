#!/bin/bash

# Hula Hoop - macOS Printer Bridge Installer & Daemon Configurator
# This script installs Bun (if not present) and registers the printer-bridge.js
# as a macOS Launch Agent so it runs persistently in the background.

# Exit on error
set -e

echo "=========================================================="
echo "   HULA HOOP - INSTALADOR DE PUENTE DE IMPRESIÓN (macOS)  "
echo "=========================================================="

# 1. Detect or install Bun (recommended runtime, zero dependencies)
BUN_BIN=""
if command -v bun &> /dev/null; then
    BUN_BIN=$(which bun)
    echo "[✓] Bun ya está instalado en: $BUN_BIN"
elif [ -f "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
    echo "[✓] Bun encontrado en: $BUN_BIN"
else
    echo "[!] Bun no está instalado. Instalándolo ahora..."
    curl -fsSL https://bun.sh/install | bash
    
    # Load Bun environment for the current script session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    
    if [ -f "$HOME/.bun/bin/bun" ]; then
        BUN_BIN="$HOME/.bun/bin/bun"
        echo "[✓] Bun se instaló correctamente en: $BUN_BIN"
    else
        echo "[✗] Error: No se pudo instalar Bun automáticamente."
        exit 1
    fi
fi

# 2. Get absolute paths of the project
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRIDGE_PATH="$PROJECT_DIR/tools/printer-bridge.js"

if [ ! -f "$BRIDGE_PATH" ]; then
    echo "[✗] Error: No se encontró el archivo printer-bridge.js en $BRIDGE_PATH"
    exit 1
fi

echo "[i] Ubicación del bridge: $BRIDGE_PATH"

# 3. Create the LaunchAgent plist file
PLIST_LABEL="com.hulahoop.printbridge"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

echo "[i] Generando Launch Agent en: $PLIST_PATH"

# Create directories if they do not exist
mkdir -p "$HOME/Library/LaunchAgents"

cat <<EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BUN_BIN</string>
        <string>run</string>
        <string>$BRIDGE_PATH</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>StandardOutPath</key>
    <string>/tmp/hulahoop-printbridge.out.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/hulahoop-printbridge.err.log</string>
</dict>
</plist>
EOF

# Set standard permissions for macOS Plist
chmod 644 "$PLIST_PATH"

# 4. Stop and unload old service if it exists
echo "[i] Deteniendo servicio previo si existía..."
launchctl bootout gui/$(id -u) "$PLIST_PATH" 2>/dev/null || launchctl unload "$PLIST_PATH" 2>/dev/null || true

# 5. Load and bootstrap the new service
echo "[i] Registrando e iniciando servicio en segundo plano..."
launchctl bootstrap gui/$(id -u) "$PLIST_PATH" 2>/dev/null || launchctl load "$PLIST_PATH"

echo "=========================================================="
echo "   [✓] ¡INSTALACIÓN COMPLETADA EXITOSAMENTE!              "
echo "=========================================================="
echo " • El puente de impresión ya está corriendo en segundo plano."
echo " • Se iniciará automáticamente cada vez que enciendas la Mac."
echo " • Logs de salida: tail -f /tmp/hulahoop-printbridge.out.log"
echo " • Logs de errores: tail -f /tmp/hulahoop-printbridge.err.log"
echo "=========================================================="
