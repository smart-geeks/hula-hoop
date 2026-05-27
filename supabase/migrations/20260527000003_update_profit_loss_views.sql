-- ==============================================================================
-- Migration: 20260527000003_update_profit_loss_views.sql
--
-- 1. Actualiza event_profit_loss a transaction-level scoping:
--    Sustituye el JOIN pos_sessions → pos_sales por pos_sales.contract_id directo.
-- 2. Crea nueva vista playdate_profit_loss para P&L por turno de Play Day.
--
-- Notas de schema:
--   · contracts: usa salon_renta, total_contrato, deposito_pagado, saldo_pendiente
--     (saldo_pendiente es columna generada: total_contrato - deposito_pagado)
--   · contract_payments: columna de monto = "monto"
--   · pos_sales.contract_id fue agregado en 20260527000001_pos_cost_center_integration
--   · time_slots: NO tiene columna "label"; usa start_time / end_time (HH:MM)
--   · playdate_reservations: tiene reservation_date, time_slot_id, total_cents, status
-- ==============================================================================

-- ── 1. RECREAR event_profit_loss (transaction-level via pos_sales.contract_id) ─

DROP VIEW IF EXISTS event_profit_loss;

CREATE VIEW event_profit_loss AS
SELECT
  c.id                                                                      AS contract_id,
  c.folio,
  c.client_id,
  cl.nombre                                                                 AS cliente,
  c.fecha_evento,
  c.salon_renta,
  c.total_contrato,
  c.deposito_pagado,
  c.saldo_pendiente,
  c.estado,

  -- Extras cotizados (quote_items vinculados a la cotización del contrato)
  COALESCE((
    SELECT SUM(qi.subtotal)
    FROM quote_items qi
    WHERE qi.quote_id = c.quote_id
  ), 0)                                                                     AS extras_cotizados,

  -- Ingresos POS — NUEVA LÓGICA: transaction-level via pos_sales.contract_id
  COALESCE((
    SELECT SUM(ps.total)
    FROM pos_sales ps
    WHERE ps.contract_id = c.id
  ), 0)                                                                     AS ventas_pos,

  -- Total ingresos = renta salón + extras cotizados + ventas POS
  c.salon_renta
    + COALESCE((SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id), 0)
    + COALESCE((SELECT SUM(ps.total) FROM pos_sales ps WHERE ps.contract_id = c.id), 0)
                                                                            AS total_ingresos,

  -- Compras asociadas al evento
  COALESCE((
    SELECT SUM(p.total)
    FROM purchases p
    WHERE p.contract_id = c.id
  ), 0)                                                                     AS compras_evento,

  -- Consumo de inventario (salidas imputadas al contrato)
  COALESCE((
    SELECT SUM(ABS(im.cantidad) * ii.precio_costo)
    FROM inventory_movements im
    JOIN inventory_items ii ON ii.id = im.item_id
    WHERE im.contract_id = c.id AND im.tipo = 'salida'
  ), 0)                                                                     AS consumo_inventario,

  -- Gastos directos administrativos
  COALESCE((
    SELECT SUM(ae.monto)
    FROM admin_expenses ae
    WHERE ae.contract_id = c.id
  ), 0)                                                                     AS gastos_directos,

  -- Utilidad neta = total_ingresos - compras - consumo_inventario - gastos_directos
  (
    c.salon_renta
    + COALESCE((SELECT SUM(qi.subtotal) FROM quote_items qi WHERE qi.quote_id = c.quote_id), 0)
    + COALESCE((SELECT SUM(ps.total) FROM pos_sales ps WHERE ps.contract_id = c.id), 0)
  ) - (
    COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.contract_id = c.id), 0)
    + COALESCE((
        SELECT SUM(ABS(im.cantidad) * ii.precio_costo)
        FROM inventory_movements im
        JOIN inventory_items ii ON ii.id = im.item_id
        WHERE im.contract_id = c.id AND im.tipo = 'salida'
      ), 0)
    + COALESCE((SELECT SUM(ae.monto) FROM admin_expenses ae WHERE ae.contract_id = c.id), 0)
  )                                                                         AS utilidad_neta

FROM contracts c
LEFT JOIN clients cl ON cl.id = c.client_id;

-- ── 2. NUEVA VISTA: playdate_profit_loss (P&L por turno de Play Day) ─────────

DROP VIEW IF EXISTS playdate_profit_loss;

CREATE VIEW playdate_profit_loss AS
SELECT
  pr.reservation_date                                                       AS fecha,
  pr.time_slot_id,
  ts.start_time                                                             AS turno_inicio,
  ts.end_time                                                               AS turno_fin,
  ts.day_type                                                               AS turno_tipo,

  -- Boletaje vendido (solo reservas confirmadas)
  COUNT(*) FILTER (WHERE pr.status = 'confirmed')                           AS boletos_vendidos,

  -- Ingresos por boletaje (total_cents está en centavos → dividir por 100)
  COALESCE(
    SUM(pr.total_cents) FILTER (WHERE pr.status = 'confirmed'), 0
  ) / 100.0                                                                 AS ingresos_boletaje,

  -- Ingresos cafetería/POS imputados a este turno de Play Day
  COALESCE((
    SELECT SUM(ps.total)
    FROM pos_sales ps
    WHERE ps.playdate_date = pr.reservation_date
      AND ps.playdate_time_slot_id = pr.time_slot_id
  ), 0)                                                                     AS ingresos_cafeteria,

  -- Ingreso total del turno = boletaje + cafetería
  COALESCE(
    SUM(pr.total_cents) FILTER (WHERE pr.status = 'confirmed'), 0
  ) / 100.0
  + COALESCE((
      SELECT SUM(ps.total)
      FROM pos_sales ps
      WHERE ps.playdate_date = pr.reservation_date
        AND ps.playdate_time_slot_id = pr.time_slot_id
    ), 0)                                                                   AS ingreso_total_turno

FROM playdate_reservations pr
JOIN time_slots ts ON ts.id = pr.time_slot_id
GROUP BY pr.reservation_date, pr.time_slot_id, ts.start_time, ts.end_time, ts.day_type
ORDER BY pr.reservation_date DESC, ts.start_time;
