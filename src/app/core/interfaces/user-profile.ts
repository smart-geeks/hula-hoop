export type UserRole = 'owner' | 'admin' | 'staff' | 'readonly' | 'user';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}
