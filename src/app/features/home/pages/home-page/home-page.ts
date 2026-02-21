import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HeroSection } from '../../components/hero-section/hero-section';
import { HomeFooter } from '../../components/home-footer/home-footer';

@Component({
  selector: 'app-home-page',
  imports: [HeroSection, HomeFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen flex-col grid-bg' },
  templateUrl: './home-page.html',
})
export class HomePage {}
