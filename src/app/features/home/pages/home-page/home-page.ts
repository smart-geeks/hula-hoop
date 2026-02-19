import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HeroSection } from '../../components/hero-section/hero-section';

@Component({
  selector: 'app-home-page',
  imports: [HeroSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-screen grid-bg' },
  template: `
    <main class="pt-24">
      <app-hero-section />
    </main>
  `,
})
export class HomePage {}
