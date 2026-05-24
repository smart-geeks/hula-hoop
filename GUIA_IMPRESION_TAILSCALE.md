# Guía Rápida: Impresión en Red con Tailscale 🖨️✨

Esta guía contiene los pasos sencillos para imprimir desde cualquier tablet o celular de la sucursal de forma segura utilizando la red privada encriptada.

---

## 💻 IPs de tu Red Privada (Tailscale)
* **Computadora de Caja (Local):** `100.95.106.98`
* **Servidor VPS (Nube):** `100.65.137.50`

---

## 🛠️ Pasos para Configurar en Producción

### Paso 1: Levantar el puente en la computadora de la Caja (Local)
En la computadora local de la sucursal (conectada a la impresora), abre la terminal y ejecuta:
```bash
bun run tools/printer-bridge.js
```
*(Tip: Configura este script para que se abra automáticamente al encender la computadora).*

---

### Paso 2: Configurar tu Tablet o Celular
1. Conecta tu tablet o celular al Wi-Fi de la sucursal.
2. Entra a la aplicación de **Hula Hoop** en el navegador.
3. Ve a **Configuración -> Impresora**.
4. En el apartado de **Red / IP**, configura lo siguiente:
   * **Dirección IP de la Impresora:** `192.168.1.100` *(o la IP local de tu impresora en la red local)*.
   * **Puerto:** `9100`.
   * **Dirección del Puente de Impresión (IP o Host):** Escribe la IP de la Computadora de Caja: **`100.95.106.98`**
5. Guarda la configuración.

---

### Paso 3: ¡Listo para Imprimir!
Cuando cobres una venta o imprimas un contrato desde tu tablet o celular:
1. El navegador enviará de forma segura el ticket al puente en la computadora local (`100.95.106.98`).
2. El puente entregará la orden a la impresora térmica local.
3. Tu ticket se imprimirá en milisegundos sin diálogos de confirmación y con corte automático.
