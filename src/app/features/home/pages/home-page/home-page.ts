import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { HeroSection } from '../../components/hero-section/hero-section';
import { PolaroidSection } from '../../components/polaroid-section/polaroid-section';
import { PrivateEventsSection } from '../../components/private-events-section/private-events-section';
import { PlayDaySection } from '../../components/play-day-section/play-day-section';
import { ContactSection } from '../../components/contact-section/contact-section';
import { GallerySection } from '../../components/gallery-section/gallery-section';
import { HomeFooter } from '../../components/home-footer/home-footer';
import { SeoService, SITE_URL } from '../../../../core/services/seo.service';
import { JsonLdService } from '../../../../core/services/json-ld.service';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

@Component({
  selector: 'app-home-page',
  imports: [HeroSection, PolaroidSection, PrivateEventsSection, PlayDaySection, GallerySection, ContactSection, HomeFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen flex-col grid-bg overflow-x-clip' },
  templateUrl: './home-page.html',
})
export class HomePage {
  private readonly fugaz = viewChild.required<ElementRef<HTMLImageElement>>('fugaz');
  private readonly scrollZone = viewChild.required<ElementRef<HTMLDivElement>>('scrollZone');
  private readonly eventsSection = viewChild.required<ElementRef<HTMLDivElement>>('eventsSection');
  private readonly playDaySection = viewChild.required<ElementRef<HTMLDivElement>>('playDaySection');

  constructor() {
    inject(SeoService).setPage({
      title: 'Fiestas Infantiles y Play Day en Torreón',
      description:
        'Hula Hoop es el playground infantil de Torreón, Coahuila. Celebra la fiesta privada de tus peques o vive un Play Day lleno de juegos y aventuras. ¡Reserva ya!',
      url: SITE_URL,
    });

    inject(JsonLdService).set(HOME_JSON_LD);

    afterNextRender(() => {
      this.animateFugaz();
    });
  }

  private animateFugaz(): void {
    const fugazEl = this.fugaz().nativeElement;
    const eventsEl = this.eventsSection().nativeElement;
    const playDayEl = this.playDaySection().nativeElement;

    const isMobile = window.innerWidth < 768;

    // On mobile: smaller scale, tighter path that stays within viewport
    const eventsH = eventsEl.offsetHeight;
    const playDayH = playDayEl.offsetHeight;
    const totalH = eventsH + playDayH;
    const vw = window.innerWidth;

    gsap.set(fugazEl, { x: -60, y: 20, opacity: 0, scale: isMobile ? 0.7 : 1 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: eventsEl,
        start: 'top 80%',
        endTrigger: playDayEl,
        end: 'center center',
        scrub: 1.5,
      },
    });

    tl.to(fugazEl, { opacity: 1, duration: 0.1 });

    const path = isMobile
      ? [
          { x: vw * 0.1, y: totalH * 0.1 },
          { x: vw * 0.5, y: totalH * 0.3 },
          { x: vw * 0.15, y: totalH * 0.55 },
          { x: vw * 0.45, y: totalH * 0.8 },
        ]
      : [
          { x: vw * 0.15, y: totalH * 0.15 },
          { x: vw * 0.55, y: totalH * 0.3 },
          { x: vw * 0.35, y: totalH * 0.55 },
          { x: vw * 0.65, y: totalH * 0.75 },
        ];

    tl.to(fugazEl, {
      motionPath: {
        path,
        curviness: 1.5,
        autoRotate: true,
      },
      duration: 1,
    });

    tl.to(fugazEl, { opacity: 0, duration: 0.1 }, '-=0.1');
  }
}

const HOME_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'AmusementPark',
  name: 'Hula Hoop Playground Infantil',
  alternateName: 'Hula Hoop',
  description:
    'El playground infantil más divertido de Torreón, Coahuila. Celebra fiestas privadas para niños o disfruta de un Play Day lleno de juegos y aventuras.',
  url: 'https://hulahoop.mx',
  telephone: '+52-871-123-4567',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Edificio Feliciano Chabot #1645',
    addressLocality: 'Torreón',
    addressRegion: 'Coahuila',
    addressCountry: 'MX',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 25.5428,
    longitude: -103.4068,
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '16:00',
      closes: '19:00',
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Saturday', 'Sunday'],
      opens: '09:30',
      closes: '18:30',
    },
  ],
  sameAs: [
    'https://www.facebook.com/hulahoop',
    'https://www.instagram.com/hulahoop',
    'https://www.tiktok.com/@hulahoop',
  ],
  image: 'https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/general/logo.png',
  logo: {
    '@type': 'ImageObject',
    url: 'https://jzdfxbbnhkzdetrpmqdx.supabase.co/storage/v1/object/public/Personajes/logo.png',
  },
  hasMap: 'https://maps.google.com/?q=Edificio+Feliciano+Chabot+1645,Torreon,Coahuila',
  priceRange: '$$',
  currenciesAccepted: 'MXN',
  paymentAccepted: 'Cash, Credit Card',
  areaServed: [
    { '@type': 'City', name: 'Torreón' },
    { '@type': 'City', name: 'Gómez Palacio' },
    { '@type': 'City', name: 'Lerdo' },
  ],
} as const;
