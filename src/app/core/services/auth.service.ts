import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { AuthResponse, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import type { UserProfile } from '../interfaces/user-profile';

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

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initAuthListener();
    }
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase client not available');

    const response = await client.auth.signInWithPassword({ email, password });
    if (response.data.user) {
      this.currentUser.set(response.data.user);
      await this.fetchProfile(response.data.user.id);
    }
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
    if (response.data.user) {
      this.currentUser.set(response.data.user);
      await this.fetchProfile(response.data.user.id);
    }
    return response;
  }

  async logout(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    await client.auth.signOut();
    this.currentUser.set(null);
    this.userProfile.set(null);
  }

  async resetPassword(email: string): Promise<{ error: unknown }> {
    const client = this.supabase.client;
    if (!client) throw new Error('Supabase client not available');

    const { error } = await client.auth.resetPasswordForEmail(email);
    return { error };
  }

  private async initAuthListener(): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    const {
      data: { session },
    } = await client.auth.getSession();
    if (session?.user) {
      this.currentUser.set(session.user);
      await this.fetchProfile(session.user.id);
    }

    client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      this.currentUser.set(user);
      if (user) {
        this.fetchProfile(user.id);
      } else {
        this.userProfile.set(null);
      }
    });
  }

  private async fetchProfile(userId: string): Promise<void> {
    const client = this.supabase.client;
    if (!client) return;

    const { data } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      this.userProfile.set(data as UserProfile);
    }
  }
}
