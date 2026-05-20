import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  Contract,
  ContractPayment,
  CreateContractData,
  UpdateContractData,
} from '../interfaces/contract';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly supabase = inject(SupabaseService);

  async getAll(): Promise<Contract[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('contracts')
      .select('*, client:clients(nombre, email, telefono)')
      .order('fecha_evento', { ascending: true });

    if (error) {
      console.error('Error fetching contracts:', error.message);
      return [];
    }
    return data ?? [];
  }

  async getById(id: string): Promise<Contract | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('contracts')
      .select('*, client:clients(nombre, email, telefono), payments:contract_payments(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching contract:', error.message);
      return null;
    }
    return data;
  }

  async getUpcoming(days = 30): Promise<Contract[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const from = new Date().toISOString().split('T')[0];
    const to = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

    const { data, error } = await client
      .from('contracts')
      .select('*, client:clients(nombre, email, telefono)')
      .gte('fecha_evento', from)
      .lte('fecha_evento', to)
      .neq('estado', 'cancelado')
      .order('fecha_evento', { ascending: true });

    if (error) {
      console.error('Error fetching upcoming contracts:', error.message);
      return [];
    }
    return data ?? [];
  }

  async create(data: CreateContractData): Promise<Contract | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const folio = await this.generateFolio();

    const { data: created, error } = await client
      .from('contracts')
      .insert({ ...data, folio })
      .select()
      .single();

    if (error) {
      console.error('Error creating contract:', error.message);
      return null;
    }
    return created;
  }

  async update(id: string, data: UpdateContractData): Promise<Contract | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { error } = await client.from('contracts').update(data).eq('id', id);

    if (error) {
      console.error('Error updating contract:', error.message);
      return null;
    }
    return this.getById(id);
  }

  async addPayment(
    contractId: string,
    payment: Omit<ContractPayment, 'id' | 'contract_id' | 'created_at'>,
  ): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const contract = await this.getById(contractId);
    if (!contract) return false;

    const { error } = await client
      .from('contract_payments')
      .insert({ ...payment, contract_id: contractId });

    if (error) {
      console.error('Error adding payment:', error.message);
      return false;
    }

    const newDeposit = contract.deposito_pagado + payment.monto;
    await this.update(contractId, { deposito_pagado: newDeposit });
    return true;
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;
    const { error } = await client.from('contracts').delete().eq('id', id);
    if (error) {
      console.error('Error deleting contract:', error.message);
      return false;
    }
    return true;
  }

  private async generateFolio(): Promise<string> {
    const year = new Date().getFullYear();
    const client = this.supabase.client;
    if (!client) return `CT-${year}-001`;

    const { count } = await client
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`);

    const num = String((count ?? 0) + 1).padStart(3, '0');
    return `CT-${year}-${num}`;
  }
}
