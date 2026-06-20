import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { AmendmentItem, QuoteAmendment } from '../interfaces/quote-amendment';

@Injectable({ providedIn: 'root' })
export class QuoteAmendmentService {
  private readonly supabase = inject(SupabaseService);

  async getActiveByContract(contractId: string): Promise<QuoteAmendment | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data, error } = await client
      .from('quote_amendments')
      .select('*')
      .eq('contract_id', contractId)
      .in('status', ['draft', 'pending_approval'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) { console.error('Error fetching active amendment:', error.message); return null; }
    return data;
  }

  async createDraft(data: {
    quote_id: string;
    contract_id: string;
    proposed_items: AmendmentItem[];
    proposed_subtotal: number;
    proposed_descuento: number;
    proposed_total: number;
    delta_monto: number;
    notas?: string;
    created_by?: string;
  }): Promise<QuoteAmendment | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: created, error } = await client
      .from('quote_amendments')
      .insert({ ...data, status: 'draft' })
      .select()
      .single();

    if (error) { console.error('Error creating amendment draft:', error.message); return null; }
    return created;
  }

  async updateDraft(
    id: string,
    data: Partial<Pick<QuoteAmendment,
      'proposed_items' | 'proposed_subtotal' | 'proposed_descuento' | 'proposed_total' | 'delta_monto' | 'notas'
    >>,
  ): Promise<QuoteAmendment | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('quote_amendments')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) { console.error('Error updating amendment draft:', error.message); return null; }
    return updated;
  }

  async linkPaymentAndSubmit(id: string, paymentId: string): Promise<QuoteAmendment | null> {
    const client = this.supabase.client;
    if (!client) return null;

    const { data: updated, error } = await client
      .from('quote_amendments')
      .update({ payment_id: paymentId, status: 'pending_approval' })
      .eq('id', id)
      .select()
      .single();

    if (error) { console.error('Error linking payment to amendment:', error.message); return null; }
    return updated;
  }

  async getApprovedByContract(contractId: string): Promise<QuoteAmendment[]> {
    const client = this.supabase.client;
    if (!client) return [];

    const { data, error } = await client
      .from('quote_amendments')
      .select('*')
      .eq('contract_id', contractId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: true });

    if (error) { console.error('Error fetching approved amendments:', error.message); return []; }
    return data ?? [];
  }

  async approve(amendmentId: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { data: amendment, error: fetchError } = await client
      .from('quote_amendments')
      .select('*')
      .eq('id', amendmentId)
      .single();

    if (fetchError || !amendment) {
      console.error('Error fetching amendment for approval:', fetchError?.message);
      return false;
    }

    if (amendment.status !== 'pending_approval') {
      console.error('Amendment is not in pending_approval status:', amendment.status);
      return false;
    }

    const { error: deleteItemsError } = await client
      .from('quote_items')
      .delete()
      .eq('quote_id', amendment.quote_id);

    if (deleteItemsError) {
      console.error('Error deleting existing quote items:', deleteItemsError.message);
      return false;
    }

    const newItems = (amendment.proposed_items as AmendmentItem[]).map((item) => ({
      quote_id:        amendment.quote_id,
      descripcion:     item.descripcion,
      cantidad:        item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal:        item.subtotal,
    }));

    const { error: insertItemsError } = await client
      .from('quote_items')
      .insert(newItems);

    if (insertItemsError) {
      console.error('Error inserting new quote items:', insertItemsError.message);
      return false;
    }

    const { error: updateQuoteError } = await client
      .from('quotes')
      .update({
        subtotal:  amendment.proposed_subtotal,
        descuento: amendment.proposed_descuento,
        total:     amendment.proposed_total,
      })
      .eq('id', amendment.quote_id);

    if (updateQuoteError) {
      console.error('Error updating quote totals:', updateQuoteError.message);
      return false;
    }

    // Only update total_contrato — saldo_pendiente is GENERATED ALWAYS and recalculates automatically
    const { error: updateContractError } = await client
      .from('contracts')
      .update({ total_contrato: amendment.proposed_total })
      .eq('id', amendment.contract_id);

    if (updateContractError) {
      console.error('Error updating contract totals:', updateContractError.message);
      return false;
    }

    const { error: approveError } = await client
      .from('quote_amendments')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', amendmentId);

    if (approveError) { console.error('Error marking amendment as approved:', approveError.message); return false; }
    return true;
  }

  async reject(amendmentId: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { error } = await client
      .from('quote_amendments')
      .update({ status: 'rejected', rejected_at: new Date().toISOString() })
      .eq('id', amendmentId);

    if (error) { console.error('Error rejecting amendment:', error.message); return false; }
    return true;
  }

  /** Called by the public portal (anon). Token is validated server-side by the RPC. */
  async approveViaToken(amendmentId: string, token: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { data, error } = await client.rpc('approve_amendment', {
      p_amendment_id: amendmentId,
      p_token: token,
    });

    if (error) { console.error('Error approving amendment via token:', error.message); return false; }
    return data === true;
  }

  /** Called by the public portal (anon). Token is validated server-side by the RPC. */
  async rejectViaToken(amendmentId: string, token: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client) return false;

    const { data, error } = await client.rpc('reject_amendment', {
      p_amendment_id: amendmentId,
      p_token: token,
    });

    if (error) { console.error('Error rejecting amendment via token:', error.message); return false; }
    return data === true;
  }
}
