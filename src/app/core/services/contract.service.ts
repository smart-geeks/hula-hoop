import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { VenueService } from './venue.service';
import type {
  Contract,
  ContractPayment,
  CreateContractData,
  UpdateContractData,
} from '../interfaces/contract';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly supabase = inject(SupabaseService);
  private readonly venue    = inject(VenueService);

  async getAll(): Promise<Contract[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const { data, error } = await client
      .from('contracts')
      .select('*, client:clients(nombre, email, telefono)')
      .eq('venue_id', venueId)
      .order('fecha_evento', { ascending: true });

    if (error) { console.error('Error fetching contracts:', error.message); return []; }
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

    if (error) { console.error('Error fetching contract:', error.message); return null; }
    return data;
  }

  async getUpcoming(days = 30): Promise<Contract[]> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client || !venueId) return [];

    const from = new Date().toISOString().split('T')[0];
    const to   = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

    const { data, error } = await client
      .from('contracts')
      .select('*, client:clients(nombre, email, telefono)')
      .eq('venue_id', venueId)
      .gte('fecha_evento', from)
      .lte('fecha_evento', to)
      .neq('estado', 'cancelado')
      .order('fecha_evento', { ascending: true });

    if (error) { console.error('Error fetching upcoming contracts:', error.message); return []; }
    return data ?? [];
  }

  async create(data: CreateContractData): Promise<{ data: Contract | null; error: any }> {
    const client  = this.supabase.client;
    const venueId = this.venue.currentVenueId();
    if (!client) return { data: null, error: new Error('Sin conexión a Supabase') };

    const targetVenueId = data.venue_id || venueId;
    if (!targetVenueId) {
      const err = new Error('Error: El venue_id es requerido');
      console.error(err.message);
      return { data: null, error: err };
    }

    let folio: string;
    try {
      folio = await this.generateFolio(targetVenueId);
    } catch (err: any) {
      console.error('Error generating folio:', err.message);
      return { data: null, error: err };
    }

    const { data: created, error } = await client
      .from('contracts')
      .insert({ ...data, folio, venue_id: targetVenueId })
      .select()
      .single();

    if (error) {
      console.error('Error creating contract:', error.message);
      return { data: null, error };
    }

    if (created && data.deposito_pagado && data.deposito_pagado > 0) {
      const { error: payError } = await client
        .from('contract_payments')
        .insert({
          contract_id: created.id,
          monto:       data.deposito_pagado,
          fecha:       created.created_at ? created.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          metodo:      'efectivo',
          tipo:        'anticipo',
          notas:       'Depósito inicial registrado en la creación del contrato',
        });
      if (payError) {
        console.error('Error creating initial payment record:', payError.message);
      }
    }

    return { data: created, error: null };
  }

  async update(id: string, data: UpdateContractData): Promise<Contract | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { error } = await client.from('contracts').update(data).eq('id', id);
    if (error) { console.error('Error updating contract:', error.message); return null; }
    return this.getById(id);
  }

  async uploadContractPdf(id: string, file: File): Promise<string | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const ext = file.name.split('.').pop() || 'pdf';
    const fileName = `contracts/${id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from('gallery')
      .upload(fileName, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      console.error('Error uploading contract file:', uploadError);
      return null;
    }

    const { data: publicUrlData } = client.storage
      .from('gallery')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData?.publicUrl || null;
    if (publicUrl) {
      await this.update(id, { pdf_url: publicUrl, estado: 'firmado' });
    }
    return publicUrl;
  }

  async uploadDocument(id: string, folder: 'ine' | 'comprobante' | 'firma', file: File): Promise<string | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const ext = file.name.split('.').pop() || 'pdf';
    const fileName = `contracts/${folder}/${id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from('gallery')
      .upload(fileName, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      console.error(`Error uploading contract ${folder}:`, uploadError);
      return null;
    }

    const { data: publicUrlData } = client.storage
      .from('gallery')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData?.publicUrl || null;
    if (publicUrl) {
      let updateData: UpdateContractData = {};
      if (folder === 'ine') {
        updateData = { ine_url: publicUrl };
      } else if (folder === 'comprobante') {
        updateData = { comprobante_url: publicUrl };
      } else if (folder === 'firma') {
        updateData = { firma_url: publicUrl };
      }
      await this.update(id, updateData);
    }
    return publicUrl;
  }

  async uploadDocumentAdmin(
    contractId: string,
    field: 'ine' | 'comprobante' | 'firma' | 'pdf',
    file: File,
    replacedByName: string,
    currentMeta: Record<string, { replaced_by: string; replaced_at: string } | null>,
  ): Promise<Contract | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `contracts/${field}/${contractId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from('gallery')
      .upload(fileName, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      console.error(`Error uploading ${field}:`, uploadError);
      return null;
    }

    const { data: publicUrlData } = client.storage
      .from('gallery')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData?.publicUrl;
    if (!publicUrl) return null;

    const urlField = field === 'pdf' ? 'pdf_url' : `${field}_url`;
    const newMeta = {
      ...currentMeta,
      [field]: { replaced_by: replacedByName, replaced_at: new Date().toISOString() },
    };

    const { error } = await client
      .from('contracts')
      .update({ [urlField]: publicUrl, doc_metadata: newMeta })
      .eq('id', contractId);

    if (error) {
      console.error(`Error updating contract ${field}:`, error);
      return null;
    }

    return this.getById(contractId);
  }

  async uploadFirmaRepresentante(contractId: string, file: File): Promise<string | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const ext = file.name.split('.').pop() || 'png';
    const fileName = `contracts/firma_rep/${contractId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await client.storage
      .from('gallery')
      .upload(fileName, file, { cacheControl: '3600', upsert: true });

    if (uploadError) { console.error('Error uploading firma representante:', uploadError); return null; }

    const { data } = client.storage.from('gallery').getPublicUrl(fileName);
    const publicUrl = data?.publicUrl ?? null;
    if (publicUrl) {
      await this.update(contractId, { firma_representante_url: publicUrl } as UpdateContractData & { firma_representante_url: string });
    }
    return publicUrl;
  }

  async saveContractHtml(contractId: string, htmlFile: File): Promise<string | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const fileName = `contracts/signed/${contractId}-${Date.now()}.html`;
    const { error: uploadError } = await client.storage
      .from('gallery')
      .upload(fileName, htmlFile, { cacheControl: '3600', upsert: true });

    if (uploadError) { console.error('Error saving signed contract:', uploadError); return null; }

    const { data } = client.storage.from('gallery').getPublicUrl(fileName);
    const publicUrl = data?.publicUrl ?? null;
    if (publicUrl) {
      await this.update(contractId, { pdf_url: publicUrl });
    }
    return publicUrl;
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

    if (error) { console.error('Error adding payment:', error.message); return false; }

    await this.update(contractId, { deposito_pagado: contract.deposito_pagado + payment.monto });
    return true;
  }

  /** Returns true if venue+date+slot is already taken by an active contract or confirmed reservation. */
  async checkSlotConflict(
    venueId:     string,
    fecha:       string,
    horaInicio:  string,
    horaFin?:    string,
    excludeId?:  string,
  ): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { data, error } = await client.rpc('fn_check_slot_conflict', {
      p_venue_id:         venueId,
      p_fecha:            fecha,
      p_hora_inicio:      horaInicio,
      p_hora_fin:         horaFin ?? null,
      p_exclude_contract: excludeId ?? null,
    });

    if (error) { console.error('fn_check_slot_conflict error:', error.message); return false; }
    return !!data;
  }

  /** Returns booked {fecha, hora_inicio, hora_fin} entries in range for a venue. */
  async getBookedDates(
    venueId:     string,
    fromDate:    string,
    toDate:      string,
    horaInicio?: string,
  ): Promise<{ fecha: string; hora_inicio: string; hora_fin: string }[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client.rpc('fn_get_booked_dates', {
      p_venue_id:    venueId,
      p_from_date:   fromDate,
      p_to_date:     toDate,
      p_hora_inicio: horaInicio ?? null,
    });

    if (error) { console.error('fn_get_booked_dates error:', error.message); return []; }
    return data ?? [];
  }

  async delete(id: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;
    const { error } = await client.from('contracts').delete().eq('id', id);
    if (error) { console.error('Error deleting contract:', error.message); return false; }
    return true;
  }

  private async generateFolio(venueId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const client = this.supabase.client;
    if (!client) return `CT-${year}-001`;

    const { count } = await client
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`);

    return `CT-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`;
  }
}
