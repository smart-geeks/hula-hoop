export type MovementType = 'entrada' | 'salida' | 'ajuste';

export interface InventoryItem {
  id: string;
  venue_id: string;
  nombre: string;
  sku: string | null;
  categoria: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  precio_costo: number;
  precio_venta: number;
  activo: boolean;
  created_at: string;
}

export interface InventoryMovement {
  id: string;
  item_id: string;
  tipo: MovementType;
  cantidad: number;
  motivo: string | null;
  contract_id: string | null;
  purchase_id: string | null;
  created_by: string | null;
  created_at: string;
  // Relations
  item?: Pick<InventoryItem, 'nombre' | 'sku' | 'unidad'>;
}

export interface CreateInventoryItemData {
  venue_id?: string;
  nombre: string;
  sku?: string;
  categoria?: string;
  unidad?: string;
  stock_actual?: number;
  stock_minimo?: number;
  precio_costo?: number;
  precio_venta?: number;
  activo?: boolean;
}

export interface CreateMovementData {
  item_id: string;
  tipo: MovementType;
  cantidad: number;
  motivo?: string;
  contract_id?: string;
  purchase_id?: string;
}

export type UpdateInventoryItemData = Partial<CreateInventoryItemData>;

export const INVENTORY_CATEGORIES = [
  'Bebidas',
  'Alimentos',
  'Decoración',
  'Papelería',
  'Limpieza',
  'Utilería',
  'Electrónicos',
  'recepcion',
  'Otro',
] as const;
