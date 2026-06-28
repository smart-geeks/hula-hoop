-- Decoration levels: venue-level catalog of decoration tiers (Petite, Grand, Plus)
-- Independent from package_category_configs.decorations (which holds upgrade pricing per category)
CREATE TABLE public.decoration_levels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id         UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  image_url        TEXT,
  base_price_cents INTEGER NOT NULL DEFAULT 0,
  inclusions       TEXT[] NOT NULL DEFAULT '{}',
  notes            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.decoration_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de niveles de decoración"
  ON public.decoration_levels FOR SELECT USING (true);

CREATE POLICY "Modificación de niveles de decoración por administradores"
  ON public.decoration_levels FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_users
      WHERE venue_users.user_id = auth.uid()
        AND venue_users.role IN ('owner', 'admin')
    )
  );
