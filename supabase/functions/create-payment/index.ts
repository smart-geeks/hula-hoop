// supabase/functions/create-payment/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reservation_id, reservation_type } = await req.json()

    if (!reservation_id || !reservation_type) {
      return new Response(
        JSON.stringify({ error: 'reservation_id y reservation_type son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:4200'

    // Leer credenciales desde DB (con fallback a env vars para compatibilidad)
    // Single-venue setup: exactly one row in payment_settings.
    // TODO: filter by venue_id when multi-venue support is needed.
    const { data: ps } = await supabaseAdmin
      .from('payment_settings')
      .select('mp_mode, mp_sandbox_access_token, mp_prod_access_token')
      .limit(1)
      .maybeSingle()

    const isProduction = ps?.mp_mode === 'production'
    const mpAccessToken: string | undefined =
      (isProduction ? ps?.mp_prod_access_token : ps?.mp_sandbox_access_token)
      ?? Deno.env.get('MP_ACCESS_TOKEN')

    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: 'MP_ACCESS_TOKEN no configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── RAMA NUEVA: tipo 'quote' ─────────────────────────────────────────────
    if (reservation_type === 'quote') {
      const { data: quote, error: quoteErr } = await supabaseAdmin
        .from('quotes')
        .select('*, client:clients(nombre, email)')
        .eq('id', reservation_id)
        .single()

      if (quoteErr || !quote) {
        return new Response(
          JSON.stringify({ error: 'Cotización no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (quote.estado === 'aprobada') {
        return new Response(
          JSON.stringify({ error: 'Esta cotización ya fue pagada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const chargeCents = Math.round((quote.deposit_amount ?? quote.total) * 100)
      const clientName  = (quote.client as any)?.nombre ?? 'Cliente'
      const clientEmail = (quote.client as any)?.email  ?? ''

      const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mpAccessToken}`,
        },
        body: JSON.stringify({
          items: [{
            title: 'Anticipo – Fiesta Privada',
            quantity: 1,
            unit_price: chargeCents / 100,
            currency_id: 'MXN',
          }],
          payer: { name: clientName, email: clientEmail },
          back_urls: {
            success: `${appUrl}/cotizacion/${quote.public_token}?status=approved`,
            failure: `${appUrl}/cotizacion/${quote.public_token}?status=failure`,
            pending: `${appUrl}/cotizacion/${quote.public_token}?status=pending`,
          },
          auto_return: 'approved',
          external_reference: `quote:${reservation_id}`,
          notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
          statement_descriptor: 'HULA HOOP',
        }),
      })

      if (!mpResp.ok) {
        const mpError = await mpResp.text()
        console.error('MP error (quote):', mpError)
        return new Response(
          JSON.stringify({ error: 'Error al crear preferencia de pago' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const mpData = await mpResp.json()

      await supabaseAdmin
        .from('quotes')
        .update({ mp_preference_id: mpData.id })
        .eq('id', reservation_id)

      return new Response(
        JSON.stringify({
          init_point:         mpData.init_point,
          sandbox_init_point: mpData.sandbox_init_point,
          preference_id:      mpData.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // ─── FIN RAMA QUOTE ───────────────────────────────────────────────────────

    const table = reservation_type === 'private'
      ? 'private_reservations'
      : 'playdate_reservations'

    const { data: reservation, error: fetchError } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('id', reservation_id)
      .single()

    if (fetchError || !reservation) {
      return new Response(
        JSON.stringify({ error: 'Reserva no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (reservation.status !== 'pending_payment') {
      return new Response(
        JSON.stringify({ error: 'La reserva no está pendiente de pago' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const items = []

    if (reservation_type === 'private') {
      // Get package info
      const { data: pkg } = await supabaseAdmin
        .from('packages')
        .select('name')
        .eq('id', reservation.package_id)
        .single()

      // Use deposit_cents — the amount to charge now
      const chargeCents = reservation.deposit_cents || reservation.total_cents
      const isPartial = chargeCents < reservation.total_cents

      items.push({
        title: isPartial
          ? `Anticipo - Fiesta Privada - ${pkg?.name ?? 'Paquete'}`
          : `Fiesta Privada - ${pkg?.name ?? 'Paquete'}`,
        quantity: 1,
        unit_price: chargeCents / 100,
        currency_id: 'MXN',
      })
    } else {
      items.push({
        title: 'Play Day - Hula Hoop',
        quantity: 1,
        unit_price: reservation.total_cents / 100,
        currency_id: 'MXN',
      })
    }

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify({
        items,
        payer: {
          name: reservation.guest_name,
          email: reservation.guest_email,
        },
        back_urls: {
          success: `${appUrl}/reserva/${reservation.access_token}?status=approved`,
          failure: `${appUrl}/reserva/${reservation.access_token}?status=failure`,
          pending: `${appUrl}/reserva/${reservation.access_token}?status=pending`,
        },
        auto_return: 'approved',
        external_reference: `${reservation_type}:${reservation_id}`,
        notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/mp-webhook`,
        statement_descriptor: 'HULA HOOP',
      }),
    })

    if (!mpResponse.ok) {
      const mpError = await mpResponse.text()
      console.error('MP error:', mpError)
      return new Response(
        JSON.stringify({ error: 'Error al crear preferencia de pago' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mpData = await mpResponse.json()

    await supabaseAdmin
      .from(table)
      .update({ mp_preference_id: mpData.id })
      .eq('id', reservation_id)

    return new Response(
      JSON.stringify({
        init_point: mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        preference_id: mpData.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Error:', err)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
