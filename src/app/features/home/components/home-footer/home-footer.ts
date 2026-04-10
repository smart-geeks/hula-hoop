import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './home-footer.html',
})
export class HomeFooter {
  readonly currentYear = new Date().getFullYear();
}
