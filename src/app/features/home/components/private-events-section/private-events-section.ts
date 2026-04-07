import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import { PackageService } from '../../../../core/services/package.service';
import { PACKAGE_COLORS } from '../../../../core/interfaces/package';
import type { PartyPackage } from '../../../../core/interfaces/package';

@Component({
  selector: 'app-private-events-section',
  imports: [RouterLink, CurrencyMxnPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './private-events-section.html',
})
export class PrivateEventsSection implements OnInit {
  private readonly packageService = inject(PackageService);

  readonly packages = signal<PartyPackage[]>([]);

  readonly inclusions = [
    'Merienda', 'Bebida Refill', 'Host',
    'Actividades', 'Vajilla', 'Asistentes Playground',
    'Piñata', 'Evento de 3 Horas',
  ];

  ngOnInit(): void {
    this.loadPackages();
  }

  async loadPackages(): Promise<void> {
    const data = await this.packageService.getActivePackages();
    this.packages.set(data);
  }

  getColorHex(pkg: PartyPackage): string {
    const found = PACKAGE_COLORS.find(c => c.value === pkg.color);
    return found?.hex ?? '#FC7632';
  }
}
