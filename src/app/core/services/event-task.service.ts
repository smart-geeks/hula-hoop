import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  EventTask,
  CreateEventTaskData,
  UpdateEventTaskData,
  TaskStatus,
} from '../interfaces/event-task';

@Injectable({ providedIn: 'root' })
export class EventTaskService {
  private readonly supabase = inject(SupabaseService);

  async getByContract(contractId: string): Promise<EventTask[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('event_tasks')
      .select('*, assignee:profiles(full_name, email)')
      .eq('contract_id', contractId)
      .order('hora_inicio', { ascending: true });

    if (error) {
      console.error('Error fetching event tasks:', error.message);
      return [];
    }

    if (!data || data.length === 0) {
      return this.generateDefaultTasks(contractId);
    }

    return data ?? [];
  }

  private async generateDefaultTasks(contractId: string): Promise<EventTask[]> {
    const client = this.supabase.client;
    if (!client) return [];

    // Fetch the contract details to get its event times
    const { data: contract } = await client
      .from('contracts')
      .select('fecha_evento, hora_inicio, hora_fin')
      .eq('id', contractId)
      .single();

    if (!contract) return [];

    const dateStr = contract.fecha_evento; // e.g. "2026-05-29"
    const startStr = contract.hora_inicio || '16:00:00';
    const endStr = contract.hora_fin || '19:00:00';

    // Construct base date/time
    const startEvent = new Date(`${dateStr}T${startStr}`);
    const endEvent   = new Date(`${dateStr}T${endStr}`);

    const helper = (baseDate: Date, hoursOffset: number): string => {
      const d = new Date(baseDate.getTime() + hoursOffset * 60 * 60 * 1000);
      return d.toISOString();
    };

    const defaultTasks = [
      {
        contract_id: contractId,
        titulo:      'Comprar pastel',
        descripcion: 'Retirar el pastel solicitado para el evento',
        hora_inicio: helper(startEvent, -3),
        hora_fin:    helper(startEvent, -2),
        estado:      'pendiente',
      },
      {
        contract_id: contractId,
        titulo:      'Pedir a proveedor (la merienda)',
        descripcion: 'Confirmar recepción de merienda de los niños',
        hora_inicio: helper(startEvent, -2.5),
        hora_fin:    helper(startEvent, -1.5),
        estado:      'pendiente',
      },
      {
        contract_id: contractId,
        titulo:      'Pedir a proveedor (los extras)',
        descripcion: 'Asegurar inflables, piñatas u otros servicios contratados',
        hora_inicio: helper(startEvent, -2),
        hora_fin:    helper(startEvent, -1),
        estado:      'pendiente',
      },
      {
        contract_id: contractId,
        titulo:      'Acomodar sillas y mesas',
        descripcion: 'Distribución y montaje del mobiliario en el salón',
        hora_inicio: helper(startEvent, -1),
        hora_fin:    helper(startEvent, -0.5),
        estado:      'pendiente',
      },
      {
        contract_id: contractId,
        titulo:      'Limpiar baños',
        descripcion: 'Verificar higiene, toallas, jabón y papel en tocadores',
        hora_inicio: helper(startEvent, -1),
        hora_fin:    helper(startEvent, -0.5),
        estado:      'pendiente',
      },
      {
        contract_id: contractId,
        titulo:      'Recepción y bienvenida',
        descripcion: 'Recibir al festejado y sus invitados en la entrada',
        hora_inicio: helper(startEvent, 0),
        hora_fin:    helper(startEvent, 0.5),
        estado:      'pendiente',
      },
      {
        contract_id: contractId,
        titulo:      'Limpieza final del salón',
        descripcion: 'Retirar basura, acomodar mobiliario y entregar el salón limpio',
        hora_inicio: helper(endEvent, 0),
        hora_fin:    helper(endEvent, 1),
        estado:      'pendiente',
      },
    ];

    const { data: inserted, error } = await client
      .from('event_tasks')
      .insert(defaultTasks)
      .select('*, assignee:profiles(full_name, email)');

    if (error) {
      console.error('Error inserting default tasks:', error.message);
      return [];
    }

    return inserted ?? [];
  }

  async getMyTasks(userId: string): Promise<EventTask[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await client
      .from('event_tasks')
      .select('*, contract:contracts(folio, fecha_evento)')
      .eq('asignado_a', userId)
      .neq('estado', 'completado')
      .gte('hora_inicio', `${today}T00:00:00`)
      .lte('hora_inicio', `${today}T23:59:59`)
      .order('hora_inicio', { ascending: true });

    if (error) {
      console.error('Error fetching my tasks:', error.message);
      return [];
    }
    return data ?? [];
  }

  async create(data: CreateEventTaskData): Promise<EventTask | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: created, error } = await client
      .from('event_tasks')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Error creating task:', error.message);
      return null;
    }
    return created;
  }

  async update(id: string, data: UpdateEventTaskData): Promise<EventTask | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('event_tasks')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating task:', error.message);
      return null;
    }
    return updated;
  }

  async updateStatus(id: string, estado: TaskStatus): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('event_tasks').update({ estado }).eq('id', id);
    if (error) {
      console.error('Error updating task status:', error.message);
      return false;
    }
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client.from('event_tasks').delete().eq('id', id);
    if (error) {
      console.error('Error deleting task:', error.message);
      return false;
    }
    return true;
  }
}
