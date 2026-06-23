import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const dataIdFromQuery = url.searchParams.get('data.id') || url.searchParams.get('id')
    const typeFromQuery = url.searchParams.get('type') || url.searchParams.get('topic')

    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // Body may be empty for IPN notifications
    }

    const mpWebhookSecret = Deno.env.get('MP_WEBHOOK_SECRET')

    if (mpWebhookSecret) {
      const xSignature = req.headers.get('x-signature')
      const xRequestId = req.headers.get('x-request-id')

      if (xSignature && xRequestId && dataIdFromQuery) {
        const parts = Object.fromEntries(
          xSignature.split(',').map((p: string) => {
            const [k, ...rest] = p.split('=')
            return [k.trim(), rest.join('=').trim()]
          })
        )
        const ts = parts['ts']
        const v1 = parts['v1']

        if (ts && v1) {
          const manifest = `id:${dataIdFromQuery};request-id:${xRequestId};ts:${ts};`
          const hmac = createHmac('sha256', mpWebhookSecret)
          hmac.update(manifest)
          const computed = hmac.digest('hex')

          if (computed !== v1) {
            console.error('Invalid MP webhook signature')
            return new Response(JSON.stringify({ error: 'Invalid signature' }), {
              status: 401,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        }
      }
    }

    const notificationType = body.type || typeFromQuery
    const paymentId = body.data?.id || dataIdFromQuery

    if (notificationType !== 'payment' && body.action !== 'payment.created' && body.action !== 'payment.updated') {
      return new Response(JSON.stringify({ received: true, skipped: notificationType }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'No payment ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: 'MP_ACCESS_TOKEN not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { 'Authorization': `Bearer ${mpAccessToken}` } }
    )

    if (!mpResponse.ok) {
      console.error('Failed to fetch MP payment:', await mpResponse.text())
      return new Response(JSON.stringify({ error: 'Failed to fetch payment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payment = await mpResponse.json()
    const externalRef = payment.external_reference

    if (!externalRef || !externalRef.includes(':')) {
      console.error('Invalid external_reference:', externalRef)
      return new Response(JSON.stringify({ error: 'Invalid external reference' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const [reservationType, reservationId] = externalRef.split(':')

    // ─── RAMA NUEVA: tipo 'quote' ─────────────────────────────────────────────
    if (reservationType === 'quote') {
      const supabaseAdminQ = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { data: quote } = await supabaseAdminQ
        .from('quotes')
        .select('*')
        .eq('id', reservationId)
        .single()

      if (!quote) {
        console.error('Quote not found:', reservationId)
        return new Response(JSON.stringify({ error: 'Quote not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (payment.status === 'approved') {
        // Idempotencia: no crear contrato si ya existe para esta quote
        const { count: existingCount } = await supabaseAdminQ
          .from('contracts')
          .select('*', { count: 'exact', head: true })
          .eq('quote_id', reservationId)

        if ((existingCount ?? 0) > 0) {
          console.log(`Contract already exists for quote ${reservationId}, skipping`)
          return new Response(JSON.stringify({ success: true, skipped: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Verificar conflicto de slot
        const { data: conflict } = await supabaseAdminQ.rpc('fn_check_slot_conflict', {
          p_venue_id:    quote.venue_id,
          p_fecha:       quote.fecha_evento,
          p_hora_inicio: quote.hora_inicio,
          p_hora_fin:    quote.hora_fin ?? null,
        })

        if (conflict) {
          await supabaseAdminQ
            .from('quotes')
            .update({
              estado: 'vencida',
              notas: `[CONFLICTO DE SLOT] Slot tomado al momento del pago online. MP Payment ID: ${paymentId}. Revisar con admin.`,
            })
            .eq('id', reservationId)
          console.error(`Slot conflict for quote ${reservationId} at payment time`)
          return new Response(JSON.stringify({ success: false, reason: 'slot_conflict' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Generar folio de contrato
        const year = new Date().getFullYear()
        const { count: contractCount } = await supabaseAdminQ
          .from('contracts')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', `${year}-01-01`)
        const folio = `CT-${year}-${String((contractCount ?? 0) + 1).padStart(3, '0')}`

        const depositPaidPesos = payment.transaction_amount // already in pesos for MXN

        // Crear contrato
        const { data: contract, error: contractErr } = await supabaseAdminQ
          .from('contracts')
          .insert({
            folio,
            venue_id:        quote.venue_id,
            client_id:       quote.client_id,
            quote_id:        quote.id,
            fecha_evento:    quote.fecha_evento,
            hora_inicio:     quote.hora_inicio,
            hora_fin:        quote.hora_fin,
            salon_renta:     quote.subtotal,
            total_contrato:  quote.total,
            deposito_pagado: depositPaidPesos,
            estado:          'borrador',
            notas:           quote.notas ?? null,
          })
          .select()
          .single()

        if (contractErr || !contract) {
          console.error('Error creating contract from quote:', contractErr)
          return new Response(JSON.stringify({ error: 'Failed to create contract' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        // Registrar pago de anticipo
        const { error: paymentInsertErr } = await supabaseAdminQ.from('contract_payments').insert({
          contract_id: contract.id,
          monto:       depositPaidPesos,
          fecha:       new Date().toISOString().split('T')[0],
          metodo:      'tarjeta',
          tipo:        'anticipo',
          notas:       `Pago online MercadoPago #${paymentId}`,
        })
        if (paymentInsertErr) {
          console.error(`Failed to insert contract_payment for contract ${contract.id}:`, paymentInsertErr)
        }

        // Marcar quote como aprobada
        await supabaseAdminQ
          .from('quotes')
          .update({ estado: 'aprobada' })
          .eq('id', reservationId)

        console.log(`Contract ${contract.id} (${folio}) created from quote ${reservationId}`)
      } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
        // No cambiar estado — el cliente puede reintentar
        console.log(`Payment ${payment.status} for quote ${reservationId}, no state change`)
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    // ─── FIN RAMA QUOTE ───────────────────────────────────────────────────────

    const table = reservationType === 'private'
      ? 'private_reservations'
      : 'playdate_reservations'

    let newStatus: string
    switch (payment.status) {
      case 'approved':
        newStatus = 'confirmed'
        break
      case 'rejected':
      case 'cancelled':
        newStatus = 'cancelled'
        break
      case 'in_process':
      case 'pending':
        newStatus = 'pending_payment'
        break
      default:
        newStatus = 'pending_payment'
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const selectFields = reservationType === 'private'
      ? 'id, total_cents, deposit_cents, status'
      : 'id, total_cents, status'

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from(table)
      .select(selectFields)
      .eq('id', reservationId)
      .single()

    if (fetchErr || !existing) {
      console.error('Reservation not found:', reservationId)
      return new Response(JSON.stringify({ error: 'Reservation not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const paidCents = Math.round(payment.transaction_amount * 100)
    const expectedCents = reservationType === 'private'
      ? (existing.deposit_cents || existing.total_cents)
      : existing.total_cents

    if (paidCents !== expectedCents) {
      console.error(
        `Amount mismatch: paid ${paidCents} vs expected ${expectedCents}`
      )
    }

    const statusOrder = ['pending_payment', 'confirmed', 'completed']
    const currentIdx = statusOrder.indexOf(existing.status)
    const newIdx = statusOrder.indexOf(newStatus)
    if (newIdx >= 0 && newIdx < currentIdx) {
      console.log(`Skipping status downgrade: ${existing.status} → ${newStatus}`)
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // AÑADIDO: Registro de abono dinámico
    const buildUpdateData = () => {
      const data: any = {
        status: newStatus,
        mp_payment_id: String(paymentId),
      }

      if (newStatus === 'confirmed') {
        data.paid_deposit_cents = expectedCents // << Registra lo que se pagó fijamente.
      }
      return data;
    }

    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update(buildUpdateData())
      .eq('id', reservationId)

    if (updateError) {
      console.error('Error updating reservation:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to update' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(
      `Reservation ${reservationId} updated: ${existing.status} → ${newStatus} (payment: ${paymentId})`
    )

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
