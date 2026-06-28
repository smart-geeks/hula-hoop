# Guía de Integración de Impresora de Tickets en macOS (POS)

Esta guía describe el flujo de impresión de tickets del Punto de Venta (POS) en macOS, las diferencias con Ubuntu/Linux, y cómo configurar la computadora Mac de la sucursal de manera remota sin clonar todo el código del proyecto.

---

## 🚀 Método Recomendado: Instalación Directa desde GitHub

Para evitar clonar el monorepo completo del proyecto en la computadora local de la sucursal, se ha creado un **repositorio dedicado, público y ultra-ligero** que contiene únicamente el script del puente y su instalador:

👉 **[hula-hoop-print-bridge en GitHub](https://github.com/Eddy-C127/hula-hoop-print-bridge)**

### Comando de Instalación Único (macOS)
Abre la Terminal en la Mac del negocio y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/Eddy-C127/hula-hoop-print-bridge/main/install.sh | bash
```

### ¿Qué hace este comando automáticamente?
1. **Instala Bun** localmente en la Mac (si no existe).
2. Crea el directorio local `~/.hulahoop-print-bridge/` donde residirá el puente.
3. Descarga de forma aislada el script `printer-bridge.js`.
4. Registra un Launch Agent (`com.hulahoop.printbridge.plist`) para que el puente corra permanentemente en segundo plano y se ejecute automáticamente cada vez que se encienda la Mac.

---

## 1. Flujo General en macOS

La aplicación web (Angular) no habla directo con la impresora, sino con el script puente (`printer-bridge.js`) local mediante WebSockets:

```
[Tablet / Navegador Mac]
       │
       │ WebSocket (ws://localhost:9101 o IP local/Tailscale)
       │
[printer-bridge.js] (Servicio en segundo plano en la Mac)
       │
       ├─► Caso A (Red): TCP Socket Port 9100 ────► [Impresora IP]
       │
       └─► Caso B (USB): CUPS (lp -o raw) ────────► [Impresora USB]
```

---

## 2. Configuración según el Tipo de Impresora

### Caso A: Impresora Térmica de Red (Ethernet / Wi-Fi)
Si la impresora está conectada por cable de red o Wi-Fi al router de la sucursal:
* **Funcionamiento:** Es el escenario ideal. El script `printer-bridge.js` abre una conexión TCP a nivel de socket directo a la IP de la impresora.
* **Acción:** Configura la IP de la impresora en la pantalla del POS.

### Caso B: Impresora Térmica por USB
Dado que macOS restringe la escritura directa a puertos USB (no existe `/dev/usb/lp0`), el puente utiliza el sistema nativo **CUPS** en modo **raw** (crudo). Esto envía comandos ESC/POS puros sin pasar por renderizado de página.

#### Paso 1: Obtener el nombre del sistema de la impresora USB
1. Conecta la impresora por USB a la Mac y enciéndela.
2. Abre la Terminal y ejecuta el comando:
   ```bash
   lpstat -p
   ```
3. Identifica el nombre de tu impresora en el listado (ej: `Xprinter_XP_80` o `Generic_Thermal_Printer`).

#### Paso 2: Configuración en el POS
En el panel de configuración de la impresora de la aplicación web:
* **Dirección del Puente:** `localhost` (si imprimes desde la misma Mac) o la IP local de la Mac.
* **IP de la Impresora:** Escribe el nombre obtenido en el paso anterior (o simplemente `usb` si la impresora está configurada como predeterminada).
* El puente detectará automáticamente que no es una IP y lo enviará a la cola USB usando el comando:
  ```bash
  lp -d "Nombre_Impresora" -o raw ticket.bin
  ```

---

## 3. Administración y Logs del Servicio

El Launch Agent se encargará de mantener vivo el proceso en segundo plano en el puerto `9101`.

* **Logs de salida en tiempo real:**
  ```bash
  tail -f /tmp/hulahoop-printbridge.out.log
  ```
* **Logs de errores en tiempo real:**
  ```bash
  tail -f /tmp/hulahoop-printbridge.err.log
  ```
* **Detener el servicio manualmente:**
  ```bash
  launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.hulahoop.printbridge.plist
  ```
* **Iniciar el servicio manualmente:**
  ```bash
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hulahoop.printbridge.plist
  ```

---

## 4. Firewall de macOS

Si vas a imprimir desde un iPad o tablet en el mismo Wi-Fi hacia la Mac de caja:
1. Ve a **Ajustes del Sistema > Red > Firewall** en la Mac.
2. Asegúrate de permitir las conexiones entrantes para el binario `bun` (o añade una excepción para el puerto `9101`).
