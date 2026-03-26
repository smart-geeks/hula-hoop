export type PackageColor =
  | 'lima'
  | 'rosa-pastel'
  | 'azul-cielo'
  | 'morado'
  | 'rojo-brillante'
  | 'naranja'
  | 'marron'
  | 'amarillo-merengue';

export const PACKAGE_COLORS: { label: string; value: PackageColor; hex: string }[] = [
  { label: 'Lima', value: 'lima', hex: '#8CE9AF' },
  { label: 'Rosa Pastel', value: 'rosa-pastel', hex: '#EDB2E4' },
  { label: 'Azul Cielo', value: 'azul-cielo', hex: '#85E8E3' },
  { label: 'Morado', value: 'morado', hex: '#686ABB' },
  { label: 'Rojo Brillante', value: 'rojo-brillante', hex: '#E30D1C' },
  { label: 'Naranja', value: 'naranja', hex: '#FC7632' },
  { label: 'Marrón', value: 'marron', hex: '#B28B7E' },
  { label: 'Amarillo Merengue', value: 'amarillo-merengue', hex: '#F6F090' },
];

export interface PartyPackage {
  id: string;
  name: string;
  description: string | null;
  min_guests: number;
  max_guests: number;
  price_cents: number;
  inclusions: string[];
  is_active: boolean;
  sort_order: number;
  color: PackageColor | null;
  created_at: string;
  updated_at: string;
}
