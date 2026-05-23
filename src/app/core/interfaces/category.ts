export interface Category {
  id: string;
  tipo: 'producto' | 'gasto' | 'proveedor';
  nombre: string;
  color: string;
  icono: string | null;
  orden: number;
  activo: boolean;
  created_at: string;
}

export type CategoryTipo = Category['tipo'];
