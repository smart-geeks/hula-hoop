import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { PackageCategoryConfigService } from '../../../../core/services/package-category-config.service';
import { DecorationLevelService } from '../../../../core/services/decoration-level.service';
import { VenueService } from '../../../../core/services/venue.service';
import { CurrencyMxnPipe } from '../../../../core/pipes/currency-mxn.pipe';
import type { PackageCategoryConfig, DecorationOption, ActivityOption } from '../../../../core/interfaces/package-category-config';
import type { DecorationLevel } from '../../../../core/interfaces/decoration-level';

type ActiveTab = 'hula_hula' | 'hooping' | 'decoracion';

@Component({
  selector: 'app-admin-experiences',
  templateUrl: './admin-experiences.html',
  imports: [
    FormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    TextareaModule,
    ToggleSwitchModule,
    TableModule,
    TagModule,
    DialogModule,
    TooltipModule,
    ToastModule,
    ConfirmDialogModule,
    CurrencyMxnPipe,
  ],
  providers: [MessageService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminExperiences {
  private readonly categoryConfigService = inject(PackageCategoryConfigService);
  private readonly decorationLevelService = inject(DecorationLevelService);
  private readonly venueService = inject(VenueService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  // ── Tab state ──────────────────────────────────────────────────────────────
  readonly activeTab = signal<ActiveTab>('hula_hula');

  readonly tabOptions: { label: string; value: ActiveTab }[] = [
    { label: '🌸 Hula Hula', value: 'hula_hula' },
    { label: '✨ Hooping',   value: 'hooping'   },
    { label: '🎨 Decoración', value: 'decoracion' },
  ];

  // ── Category configs (Hula Hula / Hooping) ────────────────────────────────
  readonly categoryConfigs = signal<PackageCategoryConfig[]>([]);
  readonly categoryConfigsLoading = signal(false);
  readonly categoryConfigsSaving = signal(false);

  readonly activeCategoryConfig = computed(() =>
    this.categoryConfigs().find(c => c.category === this.activeTab()) ?? null
  );

  readonly newInclusion = signal('');
  readonly newGlamInclusion = signal('');

  // Activities dialog
  readonly showActivityDialog = signal(false);
  readonly editingActivity = signal<ActivityOption | null>(null);
  readonly actName = signal('');
  readonly actGroup = signal<'A' | 'B' | 'C'>('A');
  readonly actPrice = signal(0);

  // Decoration upgrade dialog (per-category)
  readonly showDecorationDialog = signal(false);
  readonly editingDecoration = signal<DecorationOption | null>(null);
  readonly decName = signal('');
  readonly decPrice = signal(0);
  readonly decIsDefault = signal(false);

  // ── Decoration levels (catalog tab) ───────────────────────────────────────
  readonly decorationLevels = signal<DecorationLevel[]>([]);
  readonly decorationLevelsLoading = signal(false);
  readonly showDecorationLevelDialog = signal(false);
  readonly editingDecorationLevel = signal<DecorationLevel | null>(null);

  readonly decLevelName = signal('');
  readonly decLevelPrice = signal(0);
  readonly decLevelInclusions = signal<string[]>([]);
  readonly decLevelNewInclusion = signal('');
  readonly decLevelNotes = signal('');
  readonly decLevelSortOrder = signal(0);
  readonly decLevelIsActive = signal(true);
  readonly decLevelFile = signal<File | null>(null);
  readonly decLevelPreviewUrl = signal<string | null>(null);
  readonly decLevelSaving = signal(false);

  constructor() {
    effect(() => {
      const venueId = this.venueService.currentVenueId();
      if (venueId) {
        this.loadCategoryConfigs();
        this.loadDecorationLevels();
      }
    });
  }

  // ── Category config methods (unchanged from original) ─────────────────────

  private async loadCategoryConfigs(): Promise<void> {
    const venueId = this.venueService.currentVenueId();
    if (!venueId) return;
    this.categoryConfigsLoading.set(true);
    const data = await this.categoryConfigService.getConfigsByVenue(venueId);
    this.categoryConfigs.set(data);
    this.categoryConfigsLoading.set(false);
  }

  async saveCategoryConfig(config: PackageCategoryConfig): Promise<void> {
    this.categoryConfigsSaving.set(true);
    const result = await this.categoryConfigService.updateConfig(config.id, {
      inclusions: config.inclusions,
      decorations: config.decorations,
      activities: config.activities,
      glam_girls_price_cents: config.glam_girls_price_cents,
      glam_girls_min_count: config.glam_girls_min_count,
      glam_girls_description: config.glam_girls_description,
      glam_girls_inclusions: config.glam_girls_inclusions || [],
      included_activity_groups: config.included_activity_groups || [],
    });
    this.categoryConfigsSaving.set(false);
    if (result) {
      this.categoryConfigs.update(list => list.map(c => c.id === result.id ? result : c));
      this.messageService.add({ severity: 'success', summary: 'Configuración de experiencia guardada' });
    } else {
      this.messageService.add({ severity: 'error', summary: 'Error al guardar configuración de experiencia' });
    }
  }

  addCategoryInclusion(config: PackageCategoryConfig): void {
    const text = this.newInclusion().trim();
    if (!text) return;
    if (!config.inclusions.includes(text)) {
      const updated = { ...config, inclusions: [...config.inclusions, text] };
      this.categoryConfigs.update(list => list.map(c => c.id === config.id ? updated : c));
    }
    this.newInclusion.set('');
  }

  removeCategoryInclusion(config: PackageCategoryConfig, index: number): void {
    const inclusions = [...config.inclusions];
    inclusions.splice(index, 1);
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, inclusions } : c));
  }

  openAddActivity(): void {
    this.editingActivity.set(null);
    this.actName.set(''); this.actGroup.set('A'); this.actPrice.set(0);
    this.showActivityDialog.set(true);
  }

  openEditActivity(act: ActivityOption): void {
    this.editingActivity.set(act);
    this.actName.set(act.name); this.actGroup.set(act.group); this.actPrice.set(act.price_per_person);
    this.showActivityDialog.set(true);
  }

  saveActivity(config: PackageCategoryConfig): void {
    const name = this.actName().trim();
    if (!name) return;
    const editing = this.editingActivity();
    let activities = [...config.activities];
    if (editing) {
      activities = activities.map(a => a.id === editing.id
        ? { ...a, name, group: this.actGroup(), price_per_person: this.actPrice() } : a);
    } else {
      activities.push({ id: `act_${Date.now()}`, group: this.actGroup(), name, price_per_person: this.actPrice() });
    }
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, activities } : c));
    this.showActivityDialog.set(false);
  }

  removeActivity(config: PackageCategoryConfig, actId: string): void {
    const activities = config.activities.filter(a => a.id !== actId);
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, activities } : c));
  }

  openAddDecoration(): void {
    this.editingDecoration.set(null);
    this.decName.set(''); this.decPrice.set(0); this.decIsDefault.set(false);
    this.showDecorationDialog.set(true);
  }

  openEditDecoration(dec: DecorationOption): void {
    this.editingDecoration.set(dec);
    this.decName.set(dec.name);
    this.decPrice.set(dec.price_cents / 100);
    this.decIsDefault.set(dec.is_default);
    this.showDecorationDialog.set(true);
  }

  saveDecoration(config: PackageCategoryConfig): void {
    const name = this.decName().trim();
    if (!name) return;
    const editing = this.editingDecoration();
    let decorations = [...config.decorations];
    const isDefault = this.decIsDefault();
    if (isDefault) decorations = decorations.map(d => ({ ...d, is_default: false }));
    if (editing) {
      decorations = decorations.map(d => d.id === editing.id
        ? { ...d, name, price_cents: Math.round(this.decPrice() * 100), is_default: isDefault } : d);
    } else {
      decorations.push({ id: `dec_${Date.now()}`, name, price_cents: Math.round(this.decPrice() * 100), is_default: isDefault });
    }
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, decorations } : c));
    this.showDecorationDialog.set(false);
  }

  removeDecoration(config: PackageCategoryConfig, decId: string): void {
    const decorations = config.decorations.filter(d => d.id !== decId);
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, decorations } : c));
  }

  updateGlamGirlsPrice(config: PackageCategoryConfig, pricePesos: number): void {
    this.categoryConfigs.update(list =>
      list.map(c => c.id === config.id ? { ...config, glam_girls_price_cents: Math.round(pricePesos * 100) } : c));
  }

  updateGlamGirlsMinCount(config: PackageCategoryConfig, minCount: number): void {
    this.categoryConfigs.update(list =>
      list.map(c => c.id === config.id ? { ...config, glam_girls_min_count: minCount } : c));
  }

  addGlamInclusion(config: PackageCategoryConfig): void {
    const text = this.newGlamInclusion().trim();
    if (!text) return;
    const currentInclusions = config.glam_girls_inclusions || [];
    if (!currentInclusions.includes(text)) {
      const updated = { ...config, glam_girls_inclusions: [...currentInclusions, text] };
      this.categoryConfigs.update(list => list.map(c => c.id === config.id ? updated : c));
    }
    this.newGlamInclusion.set('');
  }

  removeGlamInclusion(config: PackageCategoryConfig, index: number): void {
    const currentInclusions = [...(config.glam_girls_inclusions || [])];
    currentInclusions.splice(index, 1);
    this.categoryConfigs.update(list => list.map(c => c.id === config.id ? { ...config, glam_girls_inclusions: currentInclusions } : c));
  }

  updateGlamGirlsDescription(config: PackageCategoryConfig, desc: string): void {
    this.categoryConfigs.update(list =>
      list.map(c => c.id === config.id ? { ...config, glam_girls_description: desc } : c));
  }

  toggleGroupInclusion(config: PackageCategoryConfig, group: string): void {
    const current = config.included_activity_groups || [];
    const updatedGroups = current.includes(group)
      ? current.filter(g => g !== group)
      : [...current, group];
    this.categoryConfigs.update(list =>
      list.map(c => c.id === config.id ? { ...config, included_activity_groups: updatedGroups } : c));
  }

  // ── Decoration levels methods ──────────────────────────────────────────────

  private async loadDecorationLevels(): Promise<void> {
    const venueId = this.venueService.currentVenueId();
    if (!venueId) return;
    this.decorationLevelsLoading.set(true);
    const data = await this.decorationLevelService.getAllByVenue(venueId);
    this.decorationLevels.set(data);
    this.decorationLevelsLoading.set(false);
  }

  openNewDecorationLevel(): void {
    this.editingDecorationLevel.set(null);
    this.decLevelName.set('');
    this.decLevelPrice.set(0);
    this.decLevelInclusions.set([]);
    this.decLevelNewInclusion.set('');
    this.decLevelNotes.set('');
    this.decLevelSortOrder.set(0);
    this.decLevelIsActive.set(true);
    this.decLevelFile.set(null);
    this.decLevelPreviewUrl.set(null);
    this.showDecorationLevelDialog.set(true);
  }

  openEditDecorationLevel(level: DecorationLevel): void {
    this.editingDecorationLevel.set(level);
    this.decLevelName.set(level.name);
    this.decLevelPrice.set(level.base_price_cents / 100);
    this.decLevelInclusions.set([...level.inclusions]);
    this.decLevelNewInclusion.set('');
    this.decLevelNotes.set(level.notes ?? '');
    this.decLevelSortOrder.set(level.sort_order);
    this.decLevelIsActive.set(level.is_active);
    this.decLevelFile.set(null);
    this.decLevelPreviewUrl.set(level.image_url);
    this.showDecorationLevelDialog.set(true);
  }

  onDecorationLevelFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.decLevelFile.set(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => this.decLevelPreviewUrl.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  }

  addDecorationLevelInclusion(): void {
    const text = this.decLevelNewInclusion().trim();
    if (!text) return;
    this.decLevelInclusions.update(list => list.includes(text) ? list : [...list, text]);
    this.decLevelNewInclusion.set('');
  }

  removeDecorationLevelInclusion(index: number): void {
    this.decLevelInclusions.update(list => list.filter((_, i) => i !== index));
  }

  async saveDecorationLevel(): Promise<void> {
    const venueId = this.venueService.currentVenueId();
    if (!venueId) return;
    const name = this.decLevelName().trim();
    if (!name) return;

    this.decLevelSaving.set(true);

    const payload = {
      venue_id: venueId,
      name,
      image_url: null as string | null,
      base_price_cents: Math.round(this.decLevelPrice() * 100),
      inclusions: this.decLevelInclusions(),
      notes: this.decLevelNotes().trim() || null,
      sort_order: this.decLevelSortOrder(),
      is_active: this.decLevelIsActive(),
    };

    const editing = this.editingDecorationLevel();

    if (editing) {
      let imageUrl = editing.image_url;
      const file = this.decLevelFile();
      if (file) {
        imageUrl = await this.decorationLevelService.uploadImage(file, venueId, editing.id);
      }
      const result = await this.decorationLevelService.update(editing.id, { ...payload, image_url: imageUrl });
      if (result) {
        this.decorationLevels.update(list => list.map(l => l.id === result.id ? result : l));
        this.messageService.add({ severity: 'success', summary: 'Nivel de decoración actualizado' });
        this.showDecorationLevelDialog.set(false);
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al actualizar nivel' });
      }
    } else {
      // Insert first to get the id, then upload image using that id as filename
      const created = await this.decorationLevelService.create({ ...payload, image_url: null });
      if (created) {
        const file = this.decLevelFile();
        let finalLevel = created;
        if (file) {
          const imageUrl = await this.decorationLevelService.uploadImage(file, venueId, created.id);
          if (imageUrl) {
            const updated = await this.decorationLevelService.update(created.id, { image_url: imageUrl });
            finalLevel = updated ?? { ...created, image_url: imageUrl };
          }
        }
        this.decorationLevels.update(list => [...list, finalLevel]);
        this.messageService.add({ severity: 'success', summary: 'Nivel de decoración creado' });
        this.showDecorationLevelDialog.set(false);
      } else {
        this.messageService.add({ severity: 'error', summary: 'Error al crear nivel' });
      }
    }

    this.decLevelSaving.set(false);
  }

  confirmDeleteDecorationLevel(level: DecorationLevel): void {
    this.confirmationService.confirm({
      message: `¿Eliminar el nivel "${level.name}"? Esta acción no se puede deshacer.`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        const ok = await this.decorationLevelService.remove(level.id);
        if (ok) {
          this.decorationLevels.update(list => list.filter(l => l.id !== level.id));
          this.messageService.add({ severity: 'success', summary: 'Nivel eliminado' });
        } else {
          this.messageService.add({ severity: 'error', summary: 'Error al eliminar nivel' });
        }
      },
    });
  }
}
