import { Injectable } from '@angular/core';
import { DEFAULT_PRINTER_CONFIG } from '../interfaces/printer-config';
import type { PrinterConfig } from '../interfaces/printer-config';

const STORAGE_KEY = 'hh_printer_config';

@Injectable({ providedIn: 'root' })
export class PrinterConfigService {

  load(): PrinterConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PRINTER_CONFIG };
      return { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_PRINTER_CONFIG };
    }
  }

  save(config: PrinterConfig): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}
