import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PwaInstallService } from '../../../core/services/pwa-install.service';

@Component({
  selector: 'app-pwa-install-button',
  templateUrl: './pwa-install-button.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaInstallButton {
  readonly pwa = inject(PwaInstallService);
}
