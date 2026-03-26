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
import { PrivateEventsSection } from '../../components/private-events-section/private-events-section';
import { ScheduleSection } from '../../components/schedule-section/schedule-section';
import { PlayDaySection } from '../../components/play-day-section/play-day-section';
import { HomeFooter } from '../../components/home-footer/home-footer';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

@Component({
  selector: 'app-home-page',
  imports: [HeroSection, PrivateEventsSection, ScheduleSection, PlayDaySection, HomeFooter],
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
    const scrollZoneEl = this.scrollZone().nativeElement;
    const eventsEl = this.eventsSection().nativeElement;
    const playDayEl = this.playDaySection().nativeElement;

    const zoneW = scrollZoneEl.offsetWidth;
    const zoneH = scrollZoneEl.offsetHeight;

    // Start: left side, near top of events section
    // End: right-center, near play day section
    gsap.set(fugazEl, { x: -60, y: 40, opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: eventsEl,
        start: 'top 80%',
        endTrigger: playDayEl,
        end: 'center center',
        scrub: 1.5,
      },
    });

    // Fade in
    tl.to(fugazEl, { opacity: 1, duration: 0.1 });

    // Curved path across both sections
    tl.to(fugazEl, {
      motionPath: {
        path: [
          { x: zoneW * 0.15, y: zoneH * 0.15 },
          { x: zoneW * 0.6, y: zoneH * 0.3 },
          { x: zoneW * 0.4, y: zoneH * 0.55 },
          { x: zoneW * 0.7, y: zoneH * 0.75 },
        ],
        curviness: 1.5,
        autoRotate: true,
      },
      duration: 1,
    });

    // Fade out at the end
    tl.to(fugazEl, { opacity: 0, duration: 0.1 }, '-=0.1');
  }
}
