import { DOCUMENT } from '@angular/common';
import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class JsonLdService {
  private readonly doc = inject(DOCUMENT);
  private readonly renderer: Renderer2;

  constructor() {
    this.renderer = inject(RendererFactory2).createRenderer(null, null);
  }

  /**
   * Injects or updates a JSON-LD <script> block in <head>.
   * Safe for SSR – runs in the Angular injection context (constructor).
   */
  set(schema: object, id = 'app-json-ld'): void {
    const existing = this.doc.getElementById(id);
    if (existing) {
      existing.textContent = JSON.stringify(schema);
      return;
    }
    const script = this.renderer.createElement('script') as HTMLScriptElement;
    this.renderer.setAttribute(script, 'id', id);
    this.renderer.setAttribute(script, 'type', 'application/ld+json');
    script.textContent = JSON.stringify(schema);
    this.renderer.appendChild(this.doc.head, script);
  }
}
