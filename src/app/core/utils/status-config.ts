export interface StatusConfig {
  label: string;
  classes: string;  // badge Tailwind classes
  borderL: string;  // border-left color for list items / calendar chips
}

export const CONTRACT_STATUS: Record<string, StatusConfig> = {
  borrador:  { label: 'Borrador',   classes: 'bg-slate-100 text-slate-600',       borderL: 'border-l-slate-400' },
  firmado:   { label: 'Contratado', classes: 'bg-blue-100 text-blue-700',         borderL: 'border-l-blue-500' },
  liquidado: { label: 'Liquidado',  classes: 'bg-emerald-100 text-emerald-700',   borderL: 'border-l-emerald-500' },
  cancelado: { label: 'Cancelado',  classes: 'bg-red-100 text-red-700',           borderL: 'border-l-red-400' },
};

export const QUOTE_STATUS: Record<string, StatusConfig> = {
  borrador:  { label: 'Borrador',   classes: 'bg-slate-100 text-slate-600',       borderL: '' },
  enviada:   { label: 'Enviada',    classes: 'bg-blue-100 text-blue-700',         borderL: '' },
  aprobada:  { label: 'Aprobada',   classes: 'bg-emerald-100 text-emerald-700',   borderL: '' },
  rechazada: { label: 'Rechazada',  classes: 'bg-red-100 text-red-700',           borderL: '' },
  vencida:   { label: 'Vencida',    classes: 'bg-amber-100 text-amber-700',       borderL: '' },
};

export const RESERVATION_STATUS: Record<string, StatusConfig> = {
  pending_payment: { label: 'Pend. pago',  classes: 'bg-amber-100 text-amber-700',       borderL: 'border-l-amber-400' },
  confirmed:       { label: 'Confirmada',  classes: 'bg-blue-100 text-blue-700',         borderL: 'border-l-blue-500' },
  completed:       { label: 'Completada',  classes: 'bg-emerald-100 text-emerald-700',   borderL: 'border-l-emerald-500' },
  cancelled:       { label: 'Cancelada',   classes: 'bg-red-100 text-red-700',           borderL: 'border-l-red-400' },
  expired:         { label: 'Expirada',    classes: 'bg-slate-100 text-slate-500',       borderL: 'border-l-slate-300' },
};

export const PURCHASE_STATUS: Record<string, StatusConfig> = {
  pendiente: { label: 'Pendiente', classes: 'bg-amber-100 text-amber-700',     borderL: '' },
  recibida:  { label: 'Recibida',  classes: 'bg-emerald-100 text-emerald-700', borderL: '' },
  cancelada: { label: 'Cancelada', classes: 'bg-red-100 text-red-700',         borderL: '' },
};

const FALLBACK: StatusConfig = {
  label: '—', classes: 'bg-slate-100 text-slate-600', borderL: 'border-l-slate-300',
};

export function getStatusCfg(
  estado: string,
  type: 'contract' | 'quote' | 'reservation' | 'purchase',
): StatusConfig {
  switch (type) {
    case 'contract':    return CONTRACT_STATUS[estado]    ?? { ...FALLBACK, label: estado };
    case 'quote':       return QUOTE_STATUS[estado]       ?? { ...FALLBACK, label: estado };
    case 'reservation': return RESERVATION_STATUS[estado] ?? { ...FALLBACK, label: estado };
    case 'purchase':    return PURCHASE_STATUS[estado]    ?? { ...FALLBACK, label: estado };
  }
}
