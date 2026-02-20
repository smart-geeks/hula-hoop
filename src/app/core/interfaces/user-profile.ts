export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: 'user' | 'admin';
  created_at: string;
  updated_at: string;
}
