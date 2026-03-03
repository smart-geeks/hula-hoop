import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { FloatLabelModule } from 'primeng/floatlabel';
import { DatePickerModule } from 'primeng/datepicker';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { VenueConfigService } from '../../../../core/services/venue-config.service';
import { AuthService } from '../../../../core/services/auth.service';
import type { VenueConfig } from '../../../../core/interfaces/venue-config';

@Component({
  selector: 'app-admin-config',
  templateUrl: './admin-config.html',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    FloatLabelModule,
    DatePickerModule,
    ToastModule,
  ],
  providers: [MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminConfig {
  private readonly configService = inject(VenueConfigService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly messageService = inject(MessageService);

  readonly config = signal<VenueConfig | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    max_capacity_per_slot: [50, [Validators.required, Validators.min(1)]],
    playdate_ticket_price_cents: [19000, [Validators.required, Validators.min(0)]],
    playdate_extra_adult_price_cents: [6000, [Validators.required, Validators.min(0)]],
    min_hours_before_private: [24, [Validators.required, Validators.min(1)]],
    private_booking_horizon_date: [null as Date | null],
  });

  constructor() {
    this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    this.loading.set(true);
    const data = await this.configService.getConfig();
    if (data) {
      this.config.set(data);
      this.form.patchValue({
        max_capacity_per_slot: data.max_capacity_per_slot,
        playdate_ticket_price_cents: data.playdate_ticket_price_cents,
        playdate_extra_adult_price_cents: data.playdate_extra_adult_price_cents,
        min_hours_before_private: data.min_hours_before_private,
        private_booking_horizon_date: data.private_booking_horizon_date
          ? new Date(data.private_booking_horizon_date + 'T00:00:00')
          : null,
      });
    }
    this.loading.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const cfg = this.config();
    const userId = this.authService.currentUser()?.id;
    if (!cfg || !userId) return;

    this.saving.set(true);
    const values = this.form.getRawValue();

    const horizonDate = values.private_booking_horizon_date;
    const horizonDateStr = horizonDate
      ? `${horizonDate.getFullYear()}-${String(horizonDate.getMonth() + 1).padStart(2, '0')}-${String(horizonDate.getDate()).padStart(2, '0')}`
      : null;

    const result = await this.configService.updateConfig(cfg.id, {
      max_capacity_per_slot: values.max_capacity_per_slot,
      playdate_ticket_price_cents: values.playdate_ticket_price_cents,
      playdate_extra_adult_price_cents: values.playdate_extra_adult_price_cents,
      min_hours_before_private: values.min_hours_before_private,
      private_booking_horizon_date: horizonDateStr,
      updated_by: userId,
    });

    if (result) {
      this.config.set(result);
      this.messageService.add({ severity: 'success', summary: 'Configuración guardada' });
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al guardar configuración' });
    }

    this.saving.set(false);
  }
}
