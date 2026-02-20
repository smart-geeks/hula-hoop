import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private _client: SupabaseClient | null = null;

  get client(): SupabaseClient | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }
    if (!this._client) {
      this._client = createClient(
        environment.supabaseUrl,
        environment.supabaseAnonKey,
      );
    }
    return this._client;
  }
}
