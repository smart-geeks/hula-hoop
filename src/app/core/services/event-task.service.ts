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
    return data ?? [];
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
