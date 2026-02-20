import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  viewChild,
} from '@angular/core';
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

@Component({
  selector: 'app-hero-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hero-section.html',
})
export class HeroSection {
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  private readonly subtitle = viewChild.required<ElementRef<HTMLParagraphElement>>('subtitle');

  constructor() {
    afterNextRender(() => {
      this.animateHero();
    });
  }

  private animateHero(): void {
    const headingEl = this.heading().nativeElement;
    const subtitleEl = this.subtitle().nativeElement;

    const split = SplitText.create(headingEl, { type: 'chars,words' });

    // Make the container visible now that chars are wrapped
    gsap.set(headingEl, { visibility: 'visible' });

    // Entrance: each char comes from a RANDOM direction and rotation
    gsap.fromTo(
      split.chars,
      {
        opacity: 0,
        y: () => gsap.utils.random(-120, 120),
        x: () => gsap.utils.random(-40, 40),
        rotation: () => gsap.utils.random(-90, 90),
        scale: () => gsap.utils.random(0.2, 0.6),
      },
      {
        opacity: 1,
        y: 0,
        x: 0,
        rotation: 0,
        scale: 1,
        duration: 0.8,
        stagger: { amount: 0.6, from: 'random' },
        ease: 'back.out(1.4)',
        onComplete: () => this.spinSingleChar(split.chars),
      },
    );

    // Subtitle fade in after heading
    gsap.to(subtitleEl, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power2.out',
      delay: 1.2,
    });
  }

  private spinSingleChar(chars: Element[]): void {
    // Find the "i" in "Life!" — parent word contains "Life"
    const iChar = chars.find((c) => {
      const parent = c.parentElement;
      return c.textContent === 'i' && parent?.textContent?.includes('Life');
    });

    if (!iChar) return;

    // Set transform origin to center and make it inline-block for rotation
    gsap.set(iChar, { display: 'inline-block', transformOrigin: '50% 50%' });

    // Periodic 360° spin every ~4 seconds
    gsap.to(iChar, {
      rotation: 360,
      duration: 0.8,
      ease: 'power2.inOut',
      repeat: -1,
      repeatDelay: 4,
    });
  }
}
