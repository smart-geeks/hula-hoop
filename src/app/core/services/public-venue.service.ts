import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';
import type { Venue } from '../interfaces/venue';

const COOKIE_KEY  = 'hh_preferred_venue';
const COOKIE_DAYS = 30;

@Injectable({ providedIn: 'root' })
export class PublicVenueService {
  private readonly supabase   = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly venues      = signal<Venue[]>([]);
  readonly activeVenue = signal<Venue | null>(null);

  async loadPublicVenues(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    const { data, error } = await client
      .from('venues')
      .select('id, nombre, slug, direccion, telefono, email, logo_url, activo, created_at')
      .eq('activo', true)
      .order('nombre');

    if (error) {
      console.error('Error loading public venues:', error.message);
      return;
    }
    this.venues.set((data ?? []) as Venue[]);
  }

  async findBySlug(slug: string): Promise<Venue | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('venues')
      .select('id, nombre, slug, direccion, telefono, email, logo_url, activo, created_at')
      .eq('slug', slug)
      .eq('activo', true)
      .single();

    if (error) return null;
    return data as Venue;
  }

  setActiveVenue(venue: Venue): void {
    this.activeVenue.set(venue);
    this.writeCookie(COOKIE_KEY, venue.slug, COOKIE_DAYS);
  }

  clearPreferredVenue(): void {
    this.activeVenue.set(null);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      document.cookie = `${COOKIE_KEY}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
    } catch {}
  }

  private writeCookie(key: string, value: string, days: number): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = `${key}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
    } catch {
      // ignorar errores de cookie en contextos restringidos
    }
  }
}
