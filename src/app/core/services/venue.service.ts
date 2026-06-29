import { computed, effect, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { CreateVenueData, UpdateVenueData, Venue, VenueUser } from '../interfaces/venue';

const STORAGE_KEY = 'hh_venue_id';

@Injectable({ providedIn: 'root' })
export class VenueService {
  private readonly supabase   = inject(SupabaseService);
  private readonly auth       = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly venues         = signal<Venue[]>([]);
  readonly currentVenueId = signal<string | null>(this.readStoredId());
  readonly loading        = signal(true);
  readonly currentVenue   = computed(() =>
    this.venues().find(v => v.id === this.currentVenueId()) ?? null
  );

  private readonly initResolvers: (() => void)[] = [];

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user) {
        this.loadVenues();
      } else {
        this.venues.set([]);
        this.currentVenueId.set(null);
        this.loading.set(false);
        this.resolveInit();
      }
    });
  }

  private resolveInit(): void {
    this.initResolvers.forEach((r) => r());
    this.initResolvers.length = 0;
  }

  async awaitReady(): Promise<void> {
    if (!this.loading()) return;
    return new Promise<void>((resolve) => {
      this.initResolvers.push(resolve);
    });
  }

  switchVenue(venueId: string): void {
    this.currentVenueId.set(venueId);
    this.storeId(venueId);
    // Sync public landing cookie so admin → landing navigation respects the active venue
    const venue = this.venues().find(v => v.id === venueId);
    if (venue) this.writeSlugCookie(venue.slug);
  }

  async createVenue(data: CreateVenueData): Promise<{ data: Venue | null; error: string | null }> {
    const client = this.supabase.client;
    if (!client) return { data: null, error: 'Sin conexión a Supabase' };

    const { data: venueId, error } = await client.rpc('create_venue', {
      p_nombre:           data.nombre,
      p_slug:             data.slug,
      p_direccion:        data.direccion ?? null,
      p_telefono:         data.telefono  ?? null,
      p_email:            data.email     ?? null,
      p_logo_url:         data.logo_url  ?? null,
      p_whatsapp:         data.whatsapp  ?? null,
      p_horarios:         data.horarios  ?? null,
      p_google_maps_link: data.google_maps_link ?? null,
    });

    if (error || !venueId) {
      console.error('Error creating venue:', error?.message);
      return { data: null, error: error?.message ?? 'RPC create_venue falló sin mensaje' };
    }

    const { data: created, error: fetchErr } = await client
      .from('venues')
      .select('*')
      .eq('id', venueId)
      .single();

    if (fetchErr || !created) {
      console.error('Error fetching new venue:', fetchErr?.message);
      return { data: null, error: fetchErr?.message ?? 'No se pudo leer el venue creado' };
    }

    this.venues.update(vs => [...vs, created as Venue]);
    return { data: created as Venue, error: null };
  }

  async updateVenue(id: string, data: UpdateVenueData): Promise<{ data: Venue | null; error: string | null }> {
    const client = this.supabase.client;
    if (!client) return { data: null, error: 'Cliente no disponible' };

    const { data: updated, error } = await client
      .from('venues')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating venue:', error.message);
      return { data: null, error: error.message };
    }
    this.venues.update(vs => vs.map(v => v.id === id ? (updated as Venue) : v));
    return { data: updated as Venue, error: null };
  }

  async getVenueById(id: string): Promise<{ id: string; slug: string; nombre: string } | null> {
    const client = this.supabase.client;
    if (!client) return null;
    const { data } = await client
      .from('venues')
      .select('id, slug, nombre')
      .eq('id', id)
      .single();
    return data ?? null;
  }

  async getVenueUsers(venueId: string): Promise<VenueUser[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('venue_users')
      .select('*')
      .eq('venue_id', venueId)
      .order('created_at');

    if (error) {
      console.error('Error fetching venue users:', error.message);
      return [];
    }
    return (data ?? []) as VenueUser[];
  }

  async assignUser(venueId: string, userId: string, role: VenueUser['role']): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('venue_users')
      .upsert({ venue_id: venueId, user_id: userId, role }, { onConflict: 'venue_id,user_id' });

    if (error) {
      console.error('Error assigning user:', error.message);
      return false;
    }
    return true;
  }

  async removeUser(venueId: string, userId: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('venue_users')
      .delete()
      .eq('venue_id', venueId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing user from venue:', error.message);
      return false;
    }
    return true;
  }

  private async loadVenues(): Promise<void> {
    const client = this.supabase.client;
    if (!client) {
      this.loading.set(false);
      this.resolveInit();
      return;
    }

    this.loading.set(true);

    const { data, error } = await client
      .from('venues')
      .select('*')
      .eq('activo', true)
      .order('created_at');

    if (error) {
      console.error('Error loading venues:', error.message);
      this.loading.set(false);
      this.resolveInit();
      return;
    }

    const list = (data ?? []) as Venue[];
    this.venues.set(list);

    const storedId    = this.currentVenueId();
    const validStored = list.find(v => v.id === storedId);
    const resolved    = validStored?.id ?? list[0]?.id ?? null;
    this.currentVenueId.set(resolved);
    if (resolved) this.storeId(resolved);

    this.loading.set(false);
    this.resolveInit();
  }

  private readStoredId(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  private storeId(id: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }

  private writeSlugCookie(slug: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const expires = new Date(Date.now() + 30 * 864e5).toUTCString();
      document.cookie =
        `hh_preferred_venue=${encodeURIComponent(slug)};expires=${expires};path=/;SameSite=Lax`;
    } catch {}
  }
}
