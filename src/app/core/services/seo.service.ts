import { DOCUMENT } from '@angular/common';
import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface PageSeoConfig {
  title: string;
  description: string;
  url?: string;
  image?: string;
}

const SITE_NAME = 'Hula Hoop Playground Infantil';
export const SITE_URL = 'https://hulahoop.mx';
const DEFAULT_OG_IMAGE =
  'https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/general/logo.png';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly renderer: Renderer2;

  constructor() {
    this.renderer = inject(RendererFactory2).createRenderer(null, null);
  }

  setPage(config: PageSeoConfig): void {
    const fullTitle = `${config.title} | ${SITE_NAME}`;
    const url = config.url ?? SITE_URL;
    const image = config.image ?? DEFAULT_OG_IMAGE;
    const description = config.description;

    this.titleService.setTitle(fullTitle);

    // Standard
    this.metaService.updateTag({ name: 'description', content: description });

    // Open Graph
    this.metaService.updateTag({ property: 'og:title', content: fullTitle });
    this.metaService.updateTag({ property: 'og:description', content: description });
    this.metaService.updateTag({ property: 'og:url', content: url });
    this.metaService.updateTag({ property: 'og:image', content: image });
    this.metaService.updateTag({ property: 'og:image:width', content: '1200' });
    this.metaService.updateTag({ property: 'og:image:height', content: '630' });
    this.metaService.updateTag({ property: 'og:image:alt', content: `${config.title} – ${SITE_NAME}` });
    this.metaService.updateTag({ property: 'og:type', content: 'website' });
    this.metaService.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.metaService.updateTag({ property: 'og:locale', content: 'es_MX' });

    // Twitter Card
    this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.metaService.updateTag({ name: 'twitter:title', content: fullTitle });
    this.metaService.updateTag({ name: 'twitter:description', content: description });
    this.metaService.updateTag({ name: 'twitter:image', content: image });
    this.metaService.updateTag({ name: 'twitter:image:alt', content: `${config.title} – ${SITE_NAME}` });

    this.setCanonical(url);
  }

  private setCanonical(url: string): void {
    const existing = this.doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (existing) {
      this.renderer.setAttribute(existing, 'href', url);
      return;
    }
    const link = this.renderer.createElement('link') as HTMLLinkElement;
    this.renderer.setAttribute(link, 'rel', 'canonical');
    this.renderer.setAttribute(link, 'href', url);
    this.renderer.appendChild(this.doc.head, link);
  }
}
