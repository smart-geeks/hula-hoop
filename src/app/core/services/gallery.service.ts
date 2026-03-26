import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { environment } from '../../../environments/environment';
import type { GalleryImage } from '../interfaces/gallery-image';

@Injectable({ providedIn: 'root' })
export class GalleryService {
  private readonly supabase = inject(SupabaseService);
  private readonly bucketUrl = `${environment.supabaseUrl}/storage/v1/object/public/gallery`;

  getPublicUrl(storagePath: string): string {
    return `${this.bucketUrl}/${storagePath}`;
  }

  async getActiveImages(): Promise<GalleryImage[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('gallery_images')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching gallery images:', error);
      return [];
    }
    return data ?? [];
  }

  async getAllImages(): Promise<GalleryImage[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('gallery_images')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching all gallery images:', error);
      return [];
    }
    return data ?? [];
  }

  async uploadImage(file: File): Promise<GalleryImage | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const ext = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from('gallery')
      .upload(fileName, file);

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      return null;
    }

    const { data, error } = await client
      .from('gallery_images')
      .insert({ storage_path: fileName, title: file.name.replace(/\.[^.]+$/, '') })
      .select()
      .single();

    if (error) {
      console.error('Error creating gallery record:', error);
      return null;
    }
    return data;
  }

  async updateImage(id: string, updates: Partial<Pick<GalleryImage, 'title' | 'alt_text' | 'is_active' | 'sort_order'>>): Promise<GalleryImage | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('gallery_images')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating gallery image:', error);
      return null;
    }
    return data;
  }

  async deleteImage(image: GalleryImage): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error: storageError } = await client.storage
      .from('gallery')
      .remove([image.storage_path]);

    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
      return false;
    }

    const { error } = await client
      .from('gallery_images')
      .delete()
      .eq('id', image.id);

    if (error) {
      console.error('Error deleting gallery record:', error);
      return false;
    }
    return true;
  }
}
