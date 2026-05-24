/**
 * Utility class to build ESC/POS binary commands for thermal printers.
 * Supports standard operations like formatting, alignment, code page selection (CP850),
 * paper cutting, cash drawer opening, and custom grid layouts for 58mm/80mm paper sizes.
 */
export class EscPosBuilder {
  private chunks: Uint8Array[] = [];
  private cols: number;

  constructor(paperSize: '58mm' | '80mm' = '80mm') {
    this.cols = paperSize === '80mm' ? 48 : 32;
    this.init();
  }

  /** Gets the active column count */
  get columnsCount(): number {
    return this.cols;
  }

  /** Initializes the printer and selects the CP850 code page for Spanish accents */
  init(): this {
    this.chunks.push(new Uint8Array([0x1B, 0x40])); // ESC @ (Initialize)
    this.chunks.push(new Uint8Array([0x1B, 0x74, 0x02])); // ESC t 2 (Select Code Page CP850 - Multilingual)
    return this;
  }

  /** Sets center alignment */
  alignCenter(): this {
    this.chunks.push(new Uint8Array([0x1B, 0x61, 0x01])); // ESC a 1
    return this;
  }

  /** Sets left alignment */
  alignLeft(): this {
    this.chunks.push(new Uint8Array([0x1B, 0x61, 0x00])); // ESC a 0
    return this;
  }

  /** Sets right alignment */
  alignRight(): this {
    this.chunks.push(new Uint8Array([0x1B, 0x61, 0x02])); // ESC a 2
    return this;
  }

  /** Enables or disables bold text */
  bold(enable: boolean): this {
    this.chunks.push(new Uint8Array([0x1B, 0x45, enable ? 1 : 0])); // ESC E n
    return this;
  }

  /** Enables or disables double height and double width text */
  doubleSize(enable: boolean): this {
    // GS ! n (Select character size: 0x11 for double height + double width, 0x00 for normal)
    this.chunks.push(new Uint8Array([0x1D, 0x21, enable ? 0x11 : 0x00])); 
    return this;
  }

  /** Appends text encoded in CP850 */
  text(str: string): this {
    this.chunks.push(this.encodeCP850(str));
    return this;
  }

  /** Appends text with a newline */
  textLine(str: string = ''): this {
    this.text(str + '\n');
    return this;
  }

  /** Feeds the specified number of blank lines */
  feed(lines: number = 1): this {
    this.chunks.push(new Uint8Array([0x1B, 0x64, lines])); // ESC d n
    return this;
  }

  /** Performs a partial paper cut */
  cut(): this {
    this.chunks.push(new Uint8Array([0x1D, 0x56, 0x42, 0x00])); // GS V B 0 (Partial cut)
    return this;
  }

  /** Kicks the connected RJ11 cash drawer (Sends 24V pulse to Pin 2) */
  kickDrawer(): this {
    this.chunks.push(new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA])); // ESC p 0 25 250
    return this;
  }

  /**
   * Prints a pre-saved NV (Non-Volatile) bit image from the printer's flash memory.
   * @param index The image index, usually 1.
   * @param mode Print mode: 0 = Normal, 1 = Double-width, 2 = Double-height, 3 = Quadruple.
   */
  printNvImage(index: number = 1, mode: number = 0): this {
    this.chunks.push(new Uint8Array([0x1C, 0x70, index, mode])); // FS p n m
    return this;
  }

  /**
   * Translates an HTML5 ImageData structure into monochrome ESC/POS raster format.
   * Uses the Floyd-Steinberg error-diffusion dithering algorithm to preserve all colors,
   * shades, and details (e.g. orange, green, purple, brown) as high-fidelity halftones.
   */
  rasterImage(imgData: ImageData): this {
    const width = imgData.width;
    const height = imgData.height;
    const widthBytes = Math.ceil(width / 8);

    // 1. Create a grayscale buffer with alpha transparency blending on a white background
    const gray = new Float32Array(width * height);
    const pixels = imgData.data;

    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      // If pixel is fully transparent, make it white (255)
      if (a < 10) {
        gray[i] = 255;
      } else {
        const alpha = a / 255;
        // Grayscale conversion based on standard luminance weights
        const rawGray = 0.299 * r + 0.587 * g + 0.114 * b;
        // Blend with white background according to alpha opacity
        gray[i] = rawGray * alpha + 255 * (1 - alpha);
      }
    }

    // 2. Perform Floyd-Steinberg error-diffusion dithering
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const oldVal = gray[i];
        const newVal = oldVal < 128 ? 0 : 255; // Quantize to black (0) or white (255)
        gray[i] = newVal;

        const err = oldVal - newVal;

        // Distribute error to neighboring pixels
        if (x + 1 < width) {
          gray[y * width + (x + 1)] += err * 7 / 16;
        }
        if (y + 1 < height) {
          if (x - 1 >= 0) {
            gray[(y + 1) * width + (x - 1)] += err * 3 / 16;
          }
          gray[(y + 1) * width + x] += err * 5 / 16;
          if (x + 1 < width) {
            gray[(y + 1) * width + (x + 1)] += err * 1 / 16;
          }
        }
      }
    }

    // 3. Compile the monochrome dithered grid into ESC/POS GS v 0 binary packet
    const header = new Uint8Array([
      0x1D, 0x76, 0x30, 0x00,
      widthBytes & 0xFF, (widthBytes >> 8) & 0xFF,
      height & 0xFF, (height >> 8) & 0xFF
    ]);

    const data = new Uint8Array(widthBytes * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isBlack = gray[y * width + x] < 128;
        if (isBlack) {
          const byteIdx = y * widthBytes + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          data[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    this.chunks.push(header);
    this.chunks.push(data);
    return this;
  }

  /** Compiles all chunks into a single Uint8Array */
  build(): Uint8Array {
    const totalLen = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  // ── Layout Helpers ─────────────────────────────────────────────────────────

  /** Appends a solid line separator (e.g. "----------------------") */
  solidLine(): this {
    return this.textLine('-'.repeat(this.cols));
  }

  /** Appends a dashed line separator (e.g. "- - - - - - - - - - -") */
  dashedLine(): this {
    // Elegant dashed line
    const dash = this.cols === 48 ? '- '.repeat(24) : '- '.repeat(16);
    return this.textLine(dash.trim());
  }

  /**
   * Formats a row with left and right text aligned perfectly to the margins.
   * If the row is too long, the left text is truncated to fit.
   */
  row(left: string, right: string): this {
    const rightLen = right.length;
    const spacesNeeded = this.cols - left.length - rightLen;

    if (spacesNeeded <= 0) {
      const available = this.cols - rightLen - 1;
      return this.textLine(left.substring(0, available) + ' ' + right);
    }

    return this.textLine(left + ' '.repeat(spacesNeeded) + right);
  }

  /**
   * Formats a product sale item row.
   * - 80mm: single line layout "Item Name            xQTY     $P.U.      $TOTAL"
   * - 58mm: dual line layout:
   *   Line 1: "Item Name"
   *   Line 2: "  xQTY x $P.U.             $TOTAL"
   */
  saleItemRow(name: string, qty: string, price: string, total: string): this {
    if (this.cols === 48) {
      // 80mm Layout: Name (22), Qty (6), Price (9), Total (11) = 48
      const nameCol = name.substring(0, 21).padEnd(22);
      const qtyCol = qty.padStart(6);
      const priceCol = price.padStart(9);
      const totalCol = total.padStart(11);
      return this.textLine(`${nameCol}${qtyCol}${priceCol}${totalCol}`);
    } else {
      // 58mm Layout:
      // Line 1: "Product Name"
      // Line 2: "  QTY x Price           Total"
      this.textLine(name.substring(0, 32));
      const leftPart = `  ${qty} x ${price}`;
      const rightPart = total;
      const spaces = 32 - leftPart.length - rightPart.length;
      if (spaces > 0) {
        return this.textLine(leftPart + ' '.repeat(spaces) + rightPart);
      } else {
        return this.textLine(`${leftPart} ${rightPart}`);
      }
    }
  }

  // ── CP850 Character Encoder ───────────────────────────────────────────────

  /**
   * Translates a UTF-8 string to a CP850 byte buffer for printing Spanish characters correctly.
   * Falls back to standard characters if not supportable.
   */
  private encodeCP850(str: string): Uint8Array {
    const buf = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code < 128) {
        buf[i] = code;
      } else {
        switch (str[i]) {
          case 'á': buf[i] = 0xA0; break;
          case 'é': buf[i] = 0x82; break;
          case 'í': buf[i] = 0xA1; break;
          case 'ó': buf[i] = 0xA2; break;
          case 'ú': buf[i] = 0xA3; break;
          case 'ñ': buf[i] = 0xA4; break;
          case 'Ñ': buf[i] = 0xA5; break;
          case '¡': buf[i] = 0xAD; break;
          case '¿': buf[i] = 0xA8; break;
          case 'ü': buf[i] = 0x81; break;
          case 'Ü': buf[i] = 0x9A; break;
          case 'Á': buf[i] = 0xB5; break;
          case 'É': buf[i] = 0x90; break;
          case 'Í': buf[i] = 0xD6; break;
          case 'Ó': buf[i] = 0xE0; break;
          case 'Ú': buf[i] = 0xE9; break;
          default: buf[i] = 0x3F; // '?'
        }
      }
    }
    return buf;
  }
}
