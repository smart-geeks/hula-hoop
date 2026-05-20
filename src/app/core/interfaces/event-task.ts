export type TaskStatus = 'pendiente' | 'en_progreso' | 'completado' | 'cancelado';

export interface EventTask {
  id: string;
  contract_id: string;
  titulo: string;
  descripcion: string | null;
  asignado_a: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  estado: TaskStatus;
  created_at: string;
  // Relations
  assignee?: { full_name: string; email: string };
  contract?: { folio: string; fecha_evento: string };
}

export interface CreateEventTaskData {
  contract_id: string;
  titulo: string;
  descripcion?: string;
  asignado_a?: string;
  hora_inicio?: string;
  hora_fin?: string;
  estado?: TaskStatus;
}

export type UpdateEventTaskData = Partial<Omit<CreateEventTaskData, 'contract_id'>>;
