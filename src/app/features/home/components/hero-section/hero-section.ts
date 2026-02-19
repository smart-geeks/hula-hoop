import { ChangeDetectionStrategy, Component } from '@angular/core';

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
      <h1 class="font-display text-5xl font-bold leading-tight mt-10 mb-6">
        Where Fun <br />
        <span class="text-morado">Bounces</span> to Life!
      </h1>

      <!-- Subtitle -->
      <p class="text-gray-500 text-lg mb-8 max-w-xs mx-auto">
        Colorful pixel playgrounds for the coolest kids on the block.
      </p>

      <!-- Image card -->
      <div
        class="relative mx-auto max-w-sm rounded-[2.5rem] overflow-hidden border-8 border-white shadow-2xl"
      >
        <img
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlyewIFrVwZVoPgqzhc7BDGcSQLnV8ox8z1-ziyLE3_mjZfr2Eudg8A3EuN58y7rGJBFOEXn38RKPq43p4UDlJiU-m8QSeYRgUpxZ_ToIw9S78QMHPczxia38QSDyq8S2L_SSuZjWvQ_QO3EmI3goYeeEVnns8CwACEMW3pNAtFqnUJPcKO5isT7d_5g29dz8gokzbOtWiJ0i5x__BQzMtVVBAbZ8t3mzKLXVoT1RFwLvYEdKjgykbXVzAOlVBOQA1GbViySktxp8"
          alt="Colorful playground interior with vibrant play structures"
          class="w-full h-80 object-cover"
        />
        <div
          class="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur px-4 py-3 rounded-2xl flex justify-between items-center"
        >
          <div>
            <p class="text-sm font-bold">Today's Open Play</p>
            <p class="text-xs text-morado font-bold">9:00 AM - 6:00 PM</p>
          </div>
          <span class="pi pi-arrow-right text-rojo-brillante" aria-hidden="true"></span>
        </div>
      </div>
    </section>
  `,
})
export class HeroSection {}
