export interface GalleryImage {
  id: string;
  storage_path: string;
  title: string | null;
  alt_text: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}
