export interface RolePermissions {
  c: boolean; // Create / Crear
  r: boolean; // Read / Leer
  u: boolean; // Update / Editar
  d: boolean; // Delete / Eliminar
}

export interface DynamicPermissions {
  [menu: string]: RolePermissions;
}

export interface Role {
  id: string;
  nombre: string;
  slug: string;
  descripcion: string | null;
  es_preset: boolean;
  permisos: DynamicPermissions;
  created_at: string;
}
