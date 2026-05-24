/**
 * Hula Hoop - Local Ticket Printer Bridge (WebSocket to TCP Gateway)
 * ------------------------------------------------------------------
 * This script runs locally on the cashier's machine. It acts as a gateway
 * that receives ESC/POS binary payloads over WebSocket (from the Angular POS browser app)
 * and writes them directly to the thermal printer's IP address and TCP port (usually 9100).
 * 
 * Runtimes supported:
 * 1. Bun (Zero dependencies, recommended) - Runs out of the box.
 *    Command: bun run tools/printer-bridge.js
 * 
 * 2. Node.js (Requires 'ws' library).
 *    Command: npm install ws && node tools/printer-bridge.js
 */

const PORT = 9101;

console.log("==================================================================");
console.log("        HULA HOOP - PUENTE LOCAL DE IMPRESORA TÉRMICA");
console.log("==================================================================");

if (typeof Bun !== 'undefined') {
  // ── BUN RUNTIME IMPLEMENTATION ───────────────────────────────────────────────
  console.log("[Entorno] Ejecutándose en Bun (Nativo y ultra veloz)");
  
  Bun.serve({
    port: PORT,
    fetch(req, server) {
      if (server.upgrade(req)) {
        return; // WebSocket handshake successful
      }
      return new Response(
        "Hula Hoop Printer Bridge is running. Connect via WebSocket at ws://localhost:" + PORT, 
        { status: 200 }
      );
    },
    websocket: {
      open(ws) {
        console.log(`[Bridge] ${new Date().toLocaleTimeString()} - App Angular conectada.`);
      },
      async message(ws, message) {
        try {
          const data = JSON.parse(message);
          if (data.type === 'print') {
            const { ip, port, payload } = data;
            const tcpPort = port || 9100;
            console.log(`[Bridge] Solicitud de impresión recibida -> IP Impresora: ${ip}:${tcpPort}`);

            if (!ip) {
              console.error("[Bridge] Error: No se proporcionó la dirección IP de la impresora.");
              ws.send(JSON.stringify({ status: 'error', message: 'No IP address provided' }));
              return;
            }

            // Decode base64 to buffer bytes
            const bytes = Buffer.from(payload, 'base64');
            console.log(`[Bridge] Conectando a impresora física en ${ip}:${tcpPort}...`);

            try {
              let socketEnded = false;
              const socket = await Bun.connect({
                hostname: ip,
                port: tcpPort,
                socket: {
                  data(socket, data) {},
                  open(socket) {
                    console.log(`[Bridge] ¡Conexión establecida! Enviando ${bytes.length} bytes ESC/POS...`);
                    socket.write(bytes);
                    socket.end();
                    socketEnded = true;
                    console.log(`[Bridge] Datos enviados exitosamente.`);
                    ws.send(JSON.stringify({ status: 'success' }));
                  },
                  error(socket, err) {
                    console.error("[Bridge] Error en socket TCP:", err);
                    ws.send(JSON.stringify({ status: 'error', message: err.message || 'Error en comunicación TCP' }));
                  },
                  close(socket) {
                    console.log("[Bridge] Conexión TCP con impresora cerrada.");
                    if (!socketEnded) {
                      ws.send(JSON.stringify({ status: 'error', message: 'Printer connection closed prematurely' }));
                    }
                  }
                }
              });
            } catch (connErr) {
              console.error("[Bridge] No se pudo establecer conexión con la impresora:", connErr.message);
              ws.send(JSON.stringify({ 
                status: 'error', 
                message: `No se pudo conectar a la impresora en ${ip}:${tcpPort}. ¿Está encendida y en la misma red local?` 
              }));
            }
          }
        } catch (err) {
          console.error("[Bridge] Error al procesar mensaje JSON:", err.message);
          ws.send(JSON.stringify({ status: 'error', message: err.message }));
        }
      },
      close(ws, code, reason) {
        console.log(`[Bridge] ${new Date().toLocaleTimeString()} - App Angular desconectada.`);
      }
    }
  });

  console.log(`[Bridge] Servidor WebSocket activo en ws://localhost:${PORT}`);
  console.log("[Bridge] Listo para recibir trabajos de impresión sin diálogos.");
  console.log("==================================================================");

} else {
  // ── NODE.JS IMPLEMENTATION ──────────────────────────────────────────────────
  console.log("[Entorno] Ejecutándose en Node.js");
  
  try {
    const WebSocket = require('ws');
    const net = require('net');

    const wss = new WebSocket.Server({ port: PORT });

    wss.on('connection', (ws) => {
      console.log(`[Bridge] ${new Date().toLocaleTimeString()} - App Angular conectada.`);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'print') {
            const { ip, port, payload } = data;
            const tcpPort = port || 9100;
            console.log(`[Bridge] Solicitud de impresión recibida -> IP Impresora: ${ip}:${tcpPort}`);

            if (!ip) {
              console.error("[Bridge] Error: No se proporcionó la dirección IP de la impresora.");
              ws.send(JSON.stringify({ status: 'error', message: 'No IP address provided' }));
              return;
            }

            const bytes = Buffer.from(payload, 'base64');
            console.log(`[Bridge] Conectando a impresora física en ${ip}:${tcpPort}...`);

            const client = new net.Socket();
            
            client.connect(tcpPort, ip, () => {
              console.log(`[Bridge] ¡Conexión establecida! Enviando ${bytes.length} bytes ESC/POS...`);
              client.write(bytes, () => {
                console.log(`[Bridge] Datos enviados exitosamente.`);
                ws.send(JSON.stringify({ status: 'success' }));
                client.end();
              });
            });

            client.on('error', (err) => {
              console.error("[Bridge] Error en socket TCP:", err.message);
              ws.send(JSON.stringify({ 
                status: 'error', 
                message: `No se pudo conectar a la impresora en ${ip}:${tcpPort}. ${err.message}` 
              }));
              client.destroy();
            });

            client.on('close', () => {
              console.log("[Bridge] Conexión TCP con impresora cerrada.");
            });
          }
        } catch (err) {
          console.error("[Bridge] Error al procesar mensaje JSON:", err.message);
          ws.send(JSON.stringify({ status: 'error', message: err.message }));
        }
      });

      ws.on('close', () => {
        console.log(`[Bridge] ${new Date().toLocaleTimeString()} - App Angular desconectada.`);
      });
    });

    console.log(`[Bridge] Servidor WebSocket activo en ws://localhost:${PORT}`);
    console.log("[Bridge] Listo para recibir trabajos de impresión sin diálogos.");
    console.log("==================================================================");

  } catch (err) {
    console.error("\n[Bridge] ERROR CRÍTICO:");
    console.error("Para correr este script en Node.js necesitas instalar la librería 'ws'.");
    console.error("Por favor ejecuta:");
    console.error("  npm install ws");
    console.error("O utiliza 'bun run tools/printer-bridge.js' que no requiere instalación alguna.");
    console.log("==================================================================");
    process.exit(1);
  }
}
