import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { AuthResponse, AuthError, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import type { UserProfile } from '../interfaces/user-profile';
import { environment } from '../../../environments/environment';

export interface RegisterData {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly currentUser = signal<User | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.userProfile()?.role === 'admin');
  readonly isPasswordRecovery = signal(false);

  /** Tracks the user ID for which we already have a profile loaded */
  private loadedProfileUserId: string | null = null;
  private profileFetchInProgress = false;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initAuthListener();
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase client not available');

    const response = await client.auth.signInWithPassword({ email, password });
    // Don't manually set user/profile here — onAuthStateChange handles it
    return response;
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase client not available');

    const response = await client.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          phone: data.phone,
        },
      },
    });
    // Don't manually set user/profile here — onAuthStateChange handles it
    return response;
  }

  async logout(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    await client.auth.signOut();
    this.currentUser.set(null);
    this.userProfile.set(null);
    this.loadedProfileUserId = null;
  }

  async resetPassword(email: string): Promise<{ error: unknown }> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase client not available');

    const siteUrl = environment.production
      ? window.location.origin
      : 'http://localhost:4200';

    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/update-password`,
    });
    return { error };
  }

  async updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase client not available');

    const { error } = await client.auth.updateUser({ password: newPassword });
    if (!error) {
      this.isPasswordRecovery.set(false);
    }
    return { error };
  }

  private initAuthListener(): void {
    const client = this.supabase.client;
    if (!client) return;

    // onAuthStateChange fires INITIAL_SESSION on setup — no need for a separate getSession() call.
    // This avoids a duplicate token refresh that can trigger 429 rate-limits.
    client.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;

      if (event === 'PASSWORD_RECOVERY') {
        this.isPasswordRecovery.set(true);
      }

      if (!user) {
        // Signed out or session expired
        this.currentUser.set(null);
        this.userProfile.set(null);
        this.loadedProfileUserId = null;
        return;
      }

      this.currentUser.set(user);

      // Only fetch profile on events that establish or change the session.
      // Skip TOKEN_REFRESHED if we already have the profile for this user.
      const needsProfileFetch =
        event === 'SIGNED_IN' ||
        event === 'INITIAL_SESSION' ||
        (event === 'TOKEN_REFRESHED' && this.loadedProfileUserId !== user.id);

      if (needsProfileFetch) {
        this.fetchProfile(user.id);
      }
    });
  }

  private async fetchProfile(userId: string): Promise<void> {
    // Prevent concurrent fetches for the same user
    if (this.profileFetchInProgress) return;

    const client = this.supabase.client;
    if (!client) return;

    this.profileFetchInProgress = true;

    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Failed to fetch profile:', error.message);
        return;
      }

      if (data) {
        this.userProfile.set(data as UserProfile);
        this.loadedProfileUserId = userId;
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    } finally {
      this.profileFetchInProgress = false;
    }
  }
}
