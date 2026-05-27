-- ==============================================================================
-- Migration: 20260527000002_playdate_ticket_products.sql
-- Inserta el producto "Boleto Play Day" en restaurant_items con category='acceso'
-- por cada venue que ya tenga una venue_config con precio de boleto definido.
-- ==============================================================================

INSERT INTO restaurant_items (venue_id, category, name, description, price_cents, is_active, sort_order)
SELECT
  v.id,
  'acceso',
  'Boleto Play Day',
  'Entrada para sesión de Play Day',
  vc.playdate_ticket_price_cents,
  true,
  0
FROM venues v
JOIN venue_config vc ON vc.venue_id = v.id
WHERE NOT EXISTS (
  SELECT 1
  FROM restaurant_items ri
  WHERE ri.venue_id = v.id
    AND ri.category = 'acceso'
    AND ri.name = 'Boleto Play Day'
);
