# Ticket Printer Integration Guide

> **Para Claude Code en otro proyecto (epic motion):** Este documento describe completamente cómo funciona la integración de impresora de tickets térmica en el proyecto Hula Hoop. Tu tarea es adaptar esta arquitectura al proyecto donde estás trabajando. Primero lee este documento completo, luego sigue la sección **"Guía para Claude Code: Integrar en nuevo proyecto"** al final.

---

## Arquitectura General

```
[Angular POS Browser App]
        |
        | WebSocket (ws:// o wss://)
        |
[printer-bridge.js]  ← corre en la PC de la caja (Node.js o Bun)
        |
        | TCP socket port 9100
        |
[Impresora Térmica con IP en red local]
```

La app Angular **nunca habla directamente** con la impresora. El bridge es un servidor WebSocket liviano que:
1. Recibe el payload ESC/POS en base64 desde el browser
2. Abre un socket TCP a la IP/puerto de la impresora
3. Escribe los bytes y cierra la conexión

Para tablets/celulares remotos se usa **Tailscale** (VPN mesh): el bridge escucha en la IP de Tailscale de la PC de caja, y la tablet envía al bridge por la IP privada de Tailscale.

### Conexión alternativa: Bluetooth (Web Bluetooth API)
La configuración también soporta `connectionType: 'bluetooth'` que usa la Web Bluetooth API directamente desde el browser (solo Chrome, requiere flag en algunos SO). En ese modo, **no se usa el bridge**: el servicio intenta el ESC/POS directo, y si falla, cae a impresión HTML en ventana del browser.

---

## Archivos del Proyecto

### 1. `src/app/core/interfaces/printer-config.ts`
Define los tipos de configuración de la impresora.

```typescript
export type PrinterConnectionType = 'bluetooth' | 'ip';
export type PaperSize = '58mm' | '80mm';

export interface PrinterConfig {
  connectionType: PrinterConnectionType;

  // Solo para bluetooth
  bluetoothDevice: string;     // nombre visible del dispositivo BT
  bluetoothDeviceId: string;   // ID interno del dispositivo BT

  // Solo para IP (red local o Tailscale)
  ipAddress: string;           // IP de la impresora, ej: "192.168.1.100"
  ipPort: number;              // puerto TCP de la impresora, default 9100
  bridgeAddress: string;       // IP/hostname del bridge, default 'localhost'
                               // En Tailscale: "100.95.106.98"

  // Generales
  paperSize: PaperSize;        // '58mm' (32 cols) o '80mm' (48 cols)
  copiesPerSale: number;       // cuántas copias al cobrar (1 o 2)
  headerLine1: string;         // nombre del negocio en el ticket
  headerLine2: string;         // subtítulo/dirección en el ticket
  footerLine: string;          // mensaje de despedida al final del ticket
}
```

---

### 2. `src/app/core/services/printer-config.service.ts`
Guarda/carga la configuración en `localStorage`. La configuración es **por dispositivo** (no se sincroniza al servidor).

```typescript
import { Injectable } from '@angular/core';
import { PrinterConfig } from '../interfaces/printer-config';

const STORAGE_KEY = 'hh_printer_config';

const DEFAULT_CONFIG: PrinterConfig = {
  connectionType: 'ip',
  bluetoothDevice: '',
  bluetoothDeviceId: '',
  ipAddress: '',
  ipPort: 9100,
  bridgeAddress: 'localhost',
  paperSize: '80mm',
  copiesPerSale: 1,
  headerLine1: 'NOMBRE DEL NEGOCIO',
  headerLine2: '',
  footerLine: '¡Gracias por tu visita!',
};

@Injectable({ providedIn: 'root' })
export class PrinterConfigService {
  load(): PrinterConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  save(config: PrinterConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }
}
```

---

### 3. `src/app/core/utils/esc-pos-builder.ts`
Construye el payload binario ESC/POS. Esta clase **no hace I/O** — solo acumula bytes en un array.

```typescript
export class EscPosBuilder {
  private bytes: number[] = [];
  private readonly cols: number; // 32 para 58mm, 48 para 80mm

  constructor(paperSize: '58mm' | '80mm') {
    this.cols = paperSize === '58mm' ? 32 : 48;
  }

  // Inicializa la impresora y setea code page CP850 (español)
  init(): this { /* ESC @ + ESC t 2 */ }

  // Alineación
  alignCenter(): this  { /* ESC a 1 */ }
  alignLeft(): this    { /* ESC a 0 */ }
  alignRight(): this   { /* ESC a 2 */ }

  // Estilos
  bold(enable: boolean): this       { /* ESC E 1/0 */ }
  doubleSize(enable: boolean): this { /* GS ! 0x11/0x00 */ }

  // Texto
  text(str: string): this           { /* encodeCP850(str) */ }
  textLine(str: string): this       { /* text + LF */ }
  feed(lines = 1): this             { /* ESC d N */ }
  cut(): this                       { /* GS V 0 */ }
  kickDrawer(): this                { /* ESC p 0 25 250 */ }

  // Imagen rasterizada (logo)
  // imgData: ImageData de un canvas (RGBA). Aplica Floyd-Steinberg dithering.
  rasterImage(imgData: ImageData): this { /* GS v 0 format */ }

  // Helpers de layout
  solidLine(): this    { /* "─".repeat(cols) */ }
  dashedLine(): this   { /* "- ".repeat(cols/2) */ }
  row(left: string, right: string): this           { /* padding manual */ }
  saleItemRow(name: string, qty: number, price: number, total: number): this { }

  // Retorna los bytes listos para enviar
  build(): Uint8Array { return new Uint8Array(this.bytes); }

  // Convierte string UTF-8 con caracteres españoles a bytes CP850
  private encodeCP850(str: string): number[] {
    // Mapeo manual: á→0xA0, é→0x82, í→0xA1, ó→0xA2, ú→0xA3, ñ→0xA4, etc.
  }
}
```

**Puntos importantes para adaptar:**
- `rasterImage()` redimensiona la imagen internamente; no necesitas pasarle la imagen ya escalada.
- El ancho de la imagen para rasterizar debe ser múltiplo de 8 (el builder lo ajusta).
- `encodeCP850()` tiene una tabla hardcodeada de ~50 caracteres españoles — cópiala tal cual.

---

### 4. `src/app/core/services/pos-ticket-print.service.ts`
Servicio principal de impresión. Maneja dos modos:

**Modo IP (con bridge):**
1. Construye los bytes ESC/POS con `EscPosBuilder`
2. Los convierte a base64
3. Abre WebSocket al bridge
4. Envía `{ type: 'print', ip, port, payload: base64 }`
5. Espera respuesta `{ status: 'success' }` o timeout de 3 segundos
6. En timeout/error: cae a impresión HTML en ventana del browser

**Modo Bluetooth:**
1. Construye los bytes ESC/POS
2. Intenta escribir vía Web Bluetooth API
3. En error: cae a impresión HTML

**Lógica de URL del bridge:**
```typescript
private buildBridgeUrl(config: PrinterConfig): string {
  const host = config.bridgeAddress || 'localhost';
  if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('100.')) {
    // Red local o Tailscale → ws:// sin TLS
    return `ws://${host}:9101`;
  } else {
    // Host externo (producción con HTTPS) → wss:// via proxy Nginx
    return `wss://${host}/print-bridge`;
  }
}
```

**Métodos públicos:**
```typescript
// Imprime el resumen de una venta POS
async printSale(
  sale: PosSale,
  cartItems: CartItem[],
  cashierName: string
): Promise<void>

// Imprime un comprobante de pago de contrato
async printPayment(
  contract: Contract,
  payment: ContractPayment,
  quote?: Quote
): Promise<void>
```

**Logo:**
- Se precarga en el constructor con `setTimeout(500)` desde la URL configurada en el venue.
- Se almacena como `ImageData` en caché.
- En el ticket aparece centrado arriba.
- Si falla la carga, el ticket se imprime sin logo (no se bloquea).

**Copias:**
- Para N copias, el builder repite los bytes N veces concatenados antes del base64.
- Así la impresora imprime N tickets con un solo envío.

---

### 5. `src/app/core/services/reservation-print.service.ts`
Servicio **solo HTML** para confirmaciones de reservación (no ESC/POS). Abre una ventana del browser con el resumen y llama `window.print()`.

También genera URL de WhatsApp:
```typescript
getWhatsAppUrl(data: ReservationPrintData): string {
  // Retorna: https://wa.me/52XXXXXXXXXX?text=...
}
```

Este servicio **no necesita bridge ni configuración de impresora**.

---

### 6. `tools/printer-bridge.js`
Servidor WebSocket que corre localmente en la PC de la caja. Funciona en Bun (sin dependencias) o Node.js (requiere `npm install ws`).

```
Puerto WebSocket: 9101
```

**Protocolo de mensajes:**

Desde la app:
```json
{
  "type": "print",
  "ip": "192.168.1.100",
  "port": 9100,
  "payload": "<base64 de bytes ESC/POS>"
}
```

Respuesta del bridge:
```json
{ "status": "success" }
// o
{ "status": "error", "message": "descripción del error" }
```

**Cómo correrlo:**
```bash
# Con Bun (recomendado, sin dependencias):
bun run tools/printer-bridge.js

# Con Node.js:
npm install ws
node tools/printer-bridge.js
```

**Para que inicie automáticamente** con Windows puedes crear una tarea programada. En macOS un Launch Agent. En Linux un servicio systemd.

---

### 7. UI de Configuración (Admin)

En `src/app/features/admin/pages/admin-config/`:

La pantalla de configuración de impresora tiene dos pestañas:

**Pestaña "Red / IP" (`connectionType === 'ip'`):**
- Dirección IP de la impresora (ej: `192.168.1.100`)
- Puerto (default `9100`)
- Dirección del Puente (IP/hostname de la PC que corre el bridge, default `localhost`)
- Tamaño de papel: `58mm` / `80mm`
- Copias por venta: `1` / `2`
- Encabezado línea 1 y 2
- Pie de página

**Pestaña "Bluetooth":**
- Botón "Vincular dispositivo" que abre el selector de Web Bluetooth
- Muestra el nombre del dispositivo vinculado

Formulario con botón "Guardar" que llama a `PrinterConfigService.save()`.

---

## Configuración para Red Local (mismo Wi-Fi)

```
PC de caja (corriendo bridge) →  192.168.1.50:9101
Impresora térmica             →  192.168.1.100:9100
Tablet/celular de cajero      →  192.168.1.x (mismo Wi-Fi)
```

Configuración en la app (tablet):
- IP Impresora: `192.168.1.100`
- Puerto: `9100`
- Dirección del Puente: `192.168.1.50`

---

## Configuración con Tailscale (sucursales remotas o tablets en otra red)

Tailscale crea una VPN mesh encriptada entre dispositivos. Cada dispositivo recibe una IP fija en el rango `100.x.x.x`.

```
PC de caja (Tailscale IP: 100.95.106.98) → bridge escucha en ws://100.95.106.98:9101
Impresora                                → 192.168.1.100:9100 (red local de la caja)
Tablet (Tailscale instalado)             → se conecta a 100.95.106.98:9101
```

Configuración en la app (tablet):
- IP Impresora: `192.168.1.100`
- Puerto: `9100`
- Dirección del Puente: `100.95.106.98` (IP Tailscale de la PC de caja)

El bridge **no necesita cambios** — Tailscale hace transparente la conexión.

**Requisitos Tailscale:**
- Instalar Tailscale en la PC de caja y en cada tablet/celular que necesite imprimir remotamente.
- Iniciar sesión con la misma cuenta en todos los dispositivos.
- El bridge escucha en `0.0.0.0:9101` automáticamente, accesible por Tailscale.

---

## Configuración con HTTPS + Nginx (producción web)

Si la app está desplegada en HTTPS, el browser bloquea conexiones `ws://` (mixed content). Solución: proxy Nginx que expone el bridge como `wss://`.

```nginx
location /print-bridge {
    proxy_pass http://127.0.0.1:9101;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
}
```

El servicio Angular detecta automáticamente: si `bridgeAddress` no es `localhost`, `127.x.x.x`, `192.168.x.x` ni `100.x.x.x`, usa `wss://{host}/print-bridge`.

---

## Flujo Completo de una Impresión

```
1. Cajero hace click en "Cobrar" en el POS
2. POS llama a PosTicketPrintService.printSale(sale, items, cashierName)
3. El servicio carga PrinterConfig desde localStorage
4. Construye EscPosBuilder con el paperSize configurado
5. builder.init() → sets CP850 code page
6. Si hay logo cacheado: builder.rasterImage(logoImageData)
7. builder.alignCenter().bold(true).textLine(headerLine1)...
8. Líneas de los artículos vendidos con saleItemRow()
9. Totales, método de pago, etc.
10. builder.feed(3).cut()
11. Para N copias: bytes = Uint8Array([...bytes, ...bytes, ...]) repetido N veces
12. payload = btoa(String.fromCharCode(...bytes))  // base64
13. ws = new WebSocket('ws://bridgeAddress:9101')
14. ws.onopen → ws.send(JSON.stringify({ type:'print', ip, port, payload }))
15. ws.onmessage → si status==='success': cerrar ws, done
16. setTimeout(3000) → si no hay respuesta: abrir ventana browser con HTML del ticket
17. Bridge recibe → decodifica base64 → Buffer.from(payload, 'base64')
18. Bridge abre TCP socket a ip:9100 → socket.write(bytes) → socket.end()
19. Impresora recibe bytes ESC/POS → imprime → corta papel
```

---

## Guía para Claude Code: Integrar en Nuevo Proyecto (Epic Motion)

### Paso 1: Preguntas que debes hacerte antes de planear

Antes de escribir una sola línea de código, necesitas respuestas a estas preguntas. Si no las tienes, **pregúntale al usuario**:

1. **¿Qué quiere imprimir?**
   - ¿Tickets de venta POS? ¿Confirmaciones de reservación? ¿Comprobantes de pago? ¿Otro tipo?
   - Define el contenido exacto de cada tipo de ticket.

2. **¿Cómo es la red en las sucursales?**
   - ¿La impresora está en red local (IP fija en el router)?
   - ¿Los dispositivos de caja están en el mismo Wi-Fi que la impresora?
   - ¿Necesitan imprimir desde tablets/celulares en redes distintas? (→ Tailscale)
   - ¿La app está en HTTPS? (→ necesita proxy Nginx para el bridge)

3. **¿Qué tipo de impresora tienen?**
   - ¿Impresora térmica de red (Ethernet/WiFi)? → usa bridge IP
   - ¿Impresora Bluetooth? → usa Web Bluetooth (solo Chrome)
   - ¿Cuál es el modelo exacto? (para confirmar que soporta ESC/POS estándar)
   - ¿Tamaño del papel? ¿58mm o 80mm?

4. **¿Tienen logo para el ticket?**
   - Si sí: ¿está disponible como URL pública? El servicio lo carga vía `<img>` + Canvas.
   - El logo se convierte a blanco/negro con dithering. Funciona mejor con logos de alto contraste.

5. **¿Cuántas copias por ticket?**
   - ¿Una copia para el cliente y otra para la empresa?

6. **¿Dónde vive la configuración de la impresora?**
   - En Hula Hoop: en `localStorage` por dispositivo (sin sincronización al servidor).
   - ¿En epic motion necesitas configuración centralizada (Supabase) o también es por dispositivo?

7. **¿Cuál es el stack del proyecto epic motion?**
   - ¿Angular? ¿React? ¿Vue? (los archivos están escritos para Angular, necesitarás adaptar)
   - ¿Usa Supabase? ¿Otro backend?
   - ¿Está en modo Zoneless? (crítico para Angular)

### Paso 2: Archivos a copiar/adaptar (en orden)

Una vez que tengas las respuestas, sigue este orden:

**1. Copiar `tools/printer-bridge.js` tal cual**
No necesita cambios. Es agnóstico al negocio. Funciona en Bun o Node.js.
```bash
# En el proyecto destino:
mkdir -p tools
cp <ruta-hula-hoop>/tools/printer-bridge.js tools/printer-bridge.js
```

**2. Copiar y adaptar `src/app/core/interfaces/printer-config.ts`**
La interfaz `PrinterConfig` puede usarse igual. Ajusta los defaults según el negocio.

**3. Copiar y adaptar `src/app/core/services/printer-config.service.ts`**
Cambia el `STORAGE_KEY` y los valores de `DEFAULT_CONFIG` (nombre del negocio, etc.).

**4. Copiar `src/app/core/utils/esc-pos-builder.ts`**
Esta clase es **completamente reutilizable sin cambios**. Solo cópiala.

**5. Crear el servicio de impresión para el negocio**
No copies `pos-ticket-print.service.ts` directamente — crea uno nuevo que:
- Inyecte `PrinterConfigService` y `EscPosBuilder`
- Defina los métodos específicos de epic motion (ej: `printTicketEntrada()`, `printComprobanteMembresia()`)
- Use la misma lógica de WebSocket + fallback HTML
- Reutiliza el mismo patrón de `printDirect(bytes, fallbackHtml, config)`

**6. Crear la UI de configuración**
Adapta la pantalla de configuración de impresora. Como mínimo necesita:
- Toggle conexión: IP vs Bluetooth
- Campos para IP, puerto, dirección del bridge
- Selector de tamaño de papel
- Campos de encabezado y pie de página
- Botón Guardar que llame a `PrinterConfigService.save()`

### Paso 3: Plan de trabajo sugerido

```
Task 1: Copiar printer-bridge.js y validar que corre con Bun
  - bun run tools/printer-bridge.js → debe mostrar "Servidor WebSocket activo"
  - Probar con wscat: wscat -c ws://localhost:9101

Task 2: Copiar interfaces y utilidades (printer-config.ts, esc-pos-builder.ts, printer-config.service.ts)
  - Adaptar PrinterConfigService al framework del proyecto

Task 3: Crear PrintTicketService con los tipos de ticket que necesita epic motion
  - Implementar buildBridgeUrl()
  - Implementar printDirect() con WebSocket + timeout 3s + fallback HTML
  - Implementar al menos un método de ticket (el más importante para el negocio)

Task 4: Crear UI de configuración de impresora
  - Formulario con los campos necesarios
  - Guardar/cargar desde localStorage

Task 5: Integrar en el flujo de caja
  - Llamar al PrintTicketService en el punto de cobro
  - Probar con impresora real o con bun run tools/printer-bridge.js + nc

Task 6: Probar escenarios de error
  - Bridge apagado → debe caer a impresión HTML sin crashear
  - IP incorrecta → debe mostrar error y caer a HTML
  - Timeout → debe caer a HTML en <3 segundos
```

### Paso 4: Cómo probar sin impresora física

```bash
# Terminal 1: Correr el bridge
bun run tools/printer-bridge.js

# Terminal 2: Simular la impresora escuchando en TCP 9100
nc -l 9100 | xxd

# En la app: configurar
#   IP Impresora: 127.0.0.1
#   Puerto: 9100
#   Puente: localhost
# Al imprimir, verás los bytes ESC/POS en xxd
```

Los primeros bytes siempre deben ser `1b 40` (ESC @) y `1b 74 02` (CP850).

### Paso 5: Checklist de validación final

- [ ] Bridge corre y no muestra errores al conectar
- [ ] La app detecta correctamente si usar `ws://` o `wss://`
- [ ] El ticket imprime con encabezado correcto del negocio
- [ ] Los caracteres especiales (á, é, ñ, ü) se imprimen correctamente (CP850)
- [ ] El papel corta automáticamente al final (ESC/POS `GS V 0`)
- [ ] Si el bridge está apagado, la app cae a impresión HTML sin congelar
- [ ] N copias funcionan (el paper se corta entre copias)
- [ ] El logo aparece si está configurado y no bloquea si falla la carga
- [ ] En tablet con red diferente (Tailscale): la impresión llega a la impresora local

---

## Notas de Implementación Importantes

### CP850 vs CP437
La mayoría de impresoras térmicas chinas soportan CP437 (inglés) o CP850 (Europa occidental + español). Si los caracteres españoles salen incorrectos:
1. Verifica que el builder envíe `ESC t 2` (CP850), no `ESC t 0` (CP437)
2. Algunos modelos usan `ESC t 16` para Latin-1. Revisa el manual de la impresora.

### Web Bluetooth en producción
- Requiere HTTPS o localhost
- Solo funciona en Chrome/Edge (no Firefox, no Safari)
- En Android requiere permisos de Bluetooth en el OS
- El usuario debe interactuar con la página antes de que funcione (no puede autoconectarse)
- Para producción, **recomienda siempre el modo IP** sobre Bluetooth

### Impresoras compatibles
El protocolo ESC/POS es estándar. Funciona con:
- Epson TM-series (referencia)
- Star Micronics
- Bixolon
- Cualquier genérico chino que diga "ESC/POS compatible" (ATPOS, Xprinter, RONGTA, etc.)

Las genéricas pueden tener variaciones en el comando `GS v 0` para imágenes rasterizadas. Si el logo no sale, prueba omitirlo primero para confirmar que el resto funciona.

### Firewall
El bridge escucha en `0.0.0.0:9101`. En Windows, el Firewall pedirá confirmación la primera vez. Asegúrate de permitir acceso en la red privada.
