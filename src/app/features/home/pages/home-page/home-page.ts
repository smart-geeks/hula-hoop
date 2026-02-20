import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HeroSection } from '../../components/hero-section/hero-section';

@Component({
  selector: 'app-home-page',
  imports: [HeroSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-screen grid-bg' },
  templateUrl: './home-page.html',
})
export class HomePage {}
