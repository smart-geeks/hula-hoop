import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HeroSection } from '../../components/hero-section/hero-section';
import { PrivateEventsSection } from '../../components/private-events-section/private-events-section';
import { ScheduleSection } from '../../components/schedule-section/schedule-section';
import { PlayDaySection } from '../../components/play-day-section/play-day-section';
import { HomeFooter } from '../../components/home-footer/home-footer';

@Component({
  selector: 'app-home-page',
  imports: [HeroSection, PrivateEventsSection, ScheduleSection, PlayDaySection, HomeFooter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen flex-col grid-bg' },
  templateUrl: './home-page.html',
})
export class HomePage {}
