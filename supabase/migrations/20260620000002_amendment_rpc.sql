-- Fix monetary columns: INTEGER → NUMERIC(12,2) to match schema conventions
ALTER TABLE quote_amendments
  ALTER COLUMN proposed_subtotal TYPE NUMERIC(12,2),
  ALTER COLUMN proposed_descuento TYPE NUMERIC(12,2),
  ALTER COLUMN proposed_total TYPE NUMERIC(12,2),
  ALTER COLUMN delta_monto TYPE NUMERIC(12,2);

-- RPC: approve_amendment
-- Called by the public (anon) portal. Validates the approval_token server-side
-- and performs all approval steps atomically. SECURITY DEFINER bypasses RLS.
CREATE OR REPLACE FUNCTION approve_amendment(p_amendment_id UUID, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amendment quote_amendments%ROWTYPE;
  v_item JSONB;
BEGIN
  -- Load and validate amendment
  SELECT * INTO v_amendment FROM quote_amendments WHERE id = p_amendment_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_amendment.approval_token != p_token THEN RETURN FALSE; END IF;
  IF v_amendment.status != 'pending_approval' THEN RETURN FALSE; END IF;

  -- Delete existing quote items
  DELETE FROM quote_items WHERE quote_id = v_amendment.quote_id;

  -- Insert proposed items (subtotal is GENERATED ALWAYS, omit it)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_amendment.proposed_items)
  LOOP
    INSERT INTO quote_items (quote_id, descripcion, cantidad, precio_unitario)
    VALUES (
      v_amendment.quote_id,
      v_item->>'descripcion',
      (v_item->>'cantidad')::INTEGER,
      (v_item->>'precio_unitario')::NUMERIC
    );
  END LOOP;

  -- Update quote totals
  UPDATE quotes SET
    subtotal  = v_amendment.proposed_subtotal,
    descuento = v_amendment.proposed_descuento,
    total     = v_amendment.proposed_total
  WHERE id = v_amendment.quote_id;

  -- Update contract total (saldo_pendiente is GENERATED ALWAYS, do NOT write it)
  UPDATE contracts SET
    total_contrato = v_amendment.proposed_total
  WHERE id = v_amendment.contract_id;

  -- Mark amendment approved
  UPDATE quote_amendments SET
    status = 'approved',
    approved_at = now()
  WHERE id = p_amendment_id;

  RETURN TRUE;
END;
$$;

-- RPC: reject_amendment
-- Called by the public (anon) portal. Validates the approval_token and marks rejected.
CREATE OR REPLACE FUNCTION reject_amendment(p_amendment_id UUID, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amendment quote_amendments%ROWTYPE;
BEGIN
  SELECT * INTO v_amendment FROM quote_amendments WHERE id = p_amendment_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_amendment.approval_token != p_token THEN RETURN FALSE; END IF;
  IF v_amendment.status != 'pending_approval' THEN RETURN FALSE; END IF;

  UPDATE quote_amendments SET
    status = 'rejected',
    rejected_at = now()
  WHERE id = p_amendment_id;

  RETURN TRUE;
END;
$$;

-- Grant execute to anon so the public portal can call these without auth
GRANT EXECUTE ON FUNCTION approve_amendment(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION reject_amendment(UUID, TEXT) TO anon;
