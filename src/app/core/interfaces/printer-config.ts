export type PrinterConnectionType = 'bluetooth' | 'ip';
export type PaperSize = '58mm' | '80mm';

export interface PrinterConfig {
  connectionType: PrinterConnectionType;
  /** Nombre del dispositivo Bluetooth (para mostrar en UI) */
  bluetoothDevice: string;
  /** ID interno del dispositivo Bluetooth (asignado por el browser) para reconexión */
  bluetoothDeviceId: string;
  /** IP: dirección IP de la impresora en la red local */
  ipAddress: string;
  /** IP: puerto TCP (default 9100 para ESC/POS) */
  ipPort: number;
  /** IP del puente local (para tablets/celulares conectar con la PC del puente). Default: localhost */
  bridgeAddress: string;
  paperSize: PaperSize;
  copiesPerSale: number;
  headerLine1: string;
  headerLine2: string;
  footerLine: string;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  connectionType: 'bluetooth',
  bluetoothDevice: '',
  bluetoothDeviceId: '',
  ipAddress: '',
  ipPort: 9100,
  bridgeAddress: 'localhost',
  paperSize: '80mm',
  copiesPerSale: 1,
  headerLine1: '',
  headerLine2: '',
  footerLine: '¡Gracias por tu compra!',
};
