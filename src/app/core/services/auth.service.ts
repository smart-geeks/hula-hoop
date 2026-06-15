import { computed, inject, Injectable, NgZone, PLATFORM_ID, signal } from '@angular/core';
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
  private readonly ngZone = inject(NgZone);

  readonly currentUser = signal<User | null>(null);
  readonly userProfile = signal<UserProfile | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly isOwner = computed(() => this.userProfile()?.role === 'owner');
  readonly isAdmin = computed(() => {
    const role = this.userProfile()?.role;
    return role === 'admin' || role === 'owner';
  });
  readonly isStaff = computed(() => this.userProfile()?.role === 'staff');
  readonly canManage = computed(() => {
    const role = this.userProfile()?.role;
    return role === 'owner' || role === 'admin';
  });
  readonly isPasswordRecovery = signal(false);
  readonly isInitialized = signal(!isPlatformBrowser(this.platformId));

  /** Tracks the user ID for which we already have a profile loaded */
  private loadedProfileUserId: string | null = null;
  private profileFetchInProgress = false;
  private readonly initResolvers: (() => void)[] = [];

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initAuthListener();
    }
  }

  async awaitReady(): Promise<void> {
    if (this.isInitialized()) return;
    return new Promise<void>((resolve) => {
      this.initResolvers.push(resolve);
    });
  }

  private resolveInit(): void {
    this.isInitialized.set(true);
    this.initResolvers.forEach((r) => r());
    this.initResolvers.length = 0;
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

  private async initAuthListener(): Promise<void> {
    const client = this.supabase.client;
    if (!client) {
      this.resolveInit();
      return;
    }

    try {
      const { data: { session } } = await client.auth.getSession();
      const user = session?.user ?? null;
      if (user) {
        this.currentUser.set(user);
        await this.fetchProfile(user.id);
      }
    } catch (err) {
      console.error('Error during initial session retrieval:', err);
    } finally {
      this.resolveInit();
    }

    client.auth.onAuthStateChange((event, session) => {
      this.ngZone.run(() => {
        const user = session?.user ?? null;

        if (event === 'PASSWORD_RECOVERY') {
          this.isPasswordRecovery.set(true);
        }

        if (event === 'INITIAL_SESSION') {
          return;
        }

        if (!user) {
          this.currentUser.set(null);
          this.userProfile.set(null);
          this.loadedProfileUserId = null;
          return;
        }

        this.currentUser.set(user);

        const needsProfileFetch =
          event === 'SIGNED_IN' ||
          (event === 'TOKEN_REFRESHED' && this.loadedProfileUserId !== user.id);

        if (needsProfileFetch) {
          this.fetchProfile(user.id);
        }
      });
    });
  }

  private async fetchProfile(userId: string): Promise<void> {
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
        this.ngZone.run(() => {
          this.userProfile.set(data as UserProfile);
          this.loadedProfileUserId = userId;
        });
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    } finally {
      this.profileFetchInProgress = false;
    }
  }
}
