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
  template: `
    <section class="relative px-6 pt-10 pb-16 text-center overflow-hidden">
      <!-- Floating pixel character -->
      <div
        class="absolute top-4 right-4 w-16 h-16 bg-azul-cielo rounded-lg flex items-center justify-center pixel-float shadow-md"
        aria-hidden="true"
      >
        <div class="flex gap-2">
          <div class="w-3 h-3 bg-black rounded-full border-2 border-white"></div>
          <div class="w-3 h-3 bg-black rounded-full border-2 border-white"></div>
        </div>
      </div>

      <!-- Decorative blob -->
      <div
        class="absolute bottom-20 -left-5 w-24 h-24 bg-rosa-pastel/30 rounded-full blur-2xl"
        aria-hidden="true"
      ></div>

      <!-- Heading -->
      <h1
        #heading
        class="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-tight mt-10 mb-6 invisible"
      >
        Where Fun <br />
        <span class="text-morado">Bounces</span> to Life!
      </h1>

      <!-- Subtitle -->
      <p #subtitle class="text-gray-500 text-lg md:text-xl mb-8 max-w-sm mx-auto opacity-0">
        Colorful pixel playgrounds for the coolest kids on the block.
      </p>
    </section>
  `,
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
        onComplete: () => this.addContinuousMotion(split.chars),
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

  private addContinuousMotion(chars: Element[]): void {
    // After entrance, each char gets its own subtle infinite floating motion
    chars.forEach((char) => {
      // Each char gets unique random values for its wobble
      const yAmount = gsap.utils.random(2, 6);
      const xAmount = gsap.utils.random(1, 3);
      const rotAmount = gsap.utils.random(1, 4);
      const duration = gsap.utils.random(2, 4);

      gsap.to(char, {
        y: `random(-${yAmount}, ${yAmount})`,
        x: `random(-${xAmount}, ${xAmount})`,
        rotation: `random(-${rotAmount}, ${rotAmount})`,
        duration,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: gsap.utils.random(0, 1.5),
      });
    });
  }
}
