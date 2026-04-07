import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  viewChild,
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { HeroSection } from '../../components/hero-section/hero-section';
import { PolaroidSection } from '../../components/polaroid-section/polaroid-section';
import { PrivateEventsSection } from '../../components/private-events-section/private-events-section';
import { ScheduleSection } from '../../components/schedule-section/schedule-section';
import { PlayDaySection } from '../../components/play-day-section/play-day-section';
import { ContactSection } from '../../components/contact-section/contact-section';
import { GallerySection } from '../../components/gallery-section/gallery-section';
import { HomeFooter } from '../../components/home-footer/home-footer';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

@Component({
  selector: 'app-home-page',
  imports: [HeroSection, PolaroidSection, PrivateEventsSection, ScheduleSection, PlayDaySection, GallerySection, ContactSection, HomeFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen flex-col grid-bg' },
  templateUrl: './home-page.html',
})
export class HomePage {
  private readonly fugaz = viewChild.required<ElementRef<HTMLImageElement>>('fugaz');
  private readonly scrollZone = viewChild.required<ElementRef<HTMLDivElement>>('scrollZone');
  private readonly eventsSection = viewChild.required<ElementRef<HTMLDivElement>>('eventsSection');
  private readonly playDaySection = viewChild.required<ElementRef<HTMLDivElement>>('playDaySection');

  constructor() {
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
