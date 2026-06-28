-- 1. Alter packages table to add category column
ALTER TABLE public.packages ADD COLUMN category text CHECK (category IN ('hula_hula', 'hooping'));

-- 2. Update existing packages to set category based on name
UPDATE public.packages SET category = 'hula_hula' WHERE name ILIKE '%hula hula%' OR name ILIKE '%hula%';
UPDATE public.packages SET category = 'hooping' WHERE name ILIKE '%hooping%';

-- Fallback for any package that didn't match the names (default to hula_hula)
UPDATE public.packages SET category = 'hula_hula' WHERE category IS NULL;

-- 3. Set the column to NOT NULL
ALTER TABLE public.packages ALTER COLUMN category SET NOT NULL;

-- 4. Create package_category_configs table
CREATE TABLE public.package_category_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('hula_hula', 'hooping')),
  description text,
  inclusions jsonb DEFAULT '[]'::jsonb,
  decorations jsonb DEFAULT '[]'::jsonb,
  activities jsonb DEFAULT '[]'::jsonb,
  glam_girls_price_cents integer DEFAULT 30000,
  glam_girls_min_count integer DEFAULT 5,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(venue_id, category)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.package_category_configs ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow anyone to view configurations
CREATE POLICY "Permitir lectura pública de configuraciones de categorías" 
  ON public.package_category_configs FOR SELECT 
  USING (true);

-- All operations policy for venue administrators/owners
CREATE POLICY "Permitir modificación de configuraciones de categorías a administradores" 
  ON public.package_category_configs FOR ALL 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_users 
      WHERE venue_users.user_id = auth.uid() 
      AND venue_users.role IN ('owner', 'admin')
    )
  );

-- 5. Seed default configurations for all existing venues
-- Durango
INSERT INTO public.package_category_configs (venue_id, category, description, inclusions, decorations, activities, glam_girls_price_cents, glam_girls_min_count)
VALUES (
  '2c1f7571-59e5-4ea5-bc8e-a99173632f47',
  'hula_hula',
  'Decoración Petite incluida. Estilo clásico.',
  '["3 Horas de Evento", "Invitación digital personalizada", "Merienda para niños", "Bebida Refill (Refrescos, agua natural y agua del día)", "1 host/coordinadora/staff", "Vajilla", "Barra Hula", "Decoración Petite"]'::jsonb,
  '[
    {"id": "petite", "name": "Básica Petite", "price_cents": 0, "is_default": true},
    {"id": "grand", "name": "Premium Grand", "price_cents": 140000, "is_default": false},
    {"id": "plus", "name": "Premium Plus", "price_cents": 270000, "is_default": false}
  ]'::jsonb,
  '[
    {"id": "act_a1", "group": "A", "name": "Decora tu galleta", "price_per_person": 0},
    {"id": "act_a2", "group": "A", "name": "Decora tu cupcake", "price_per_person": 0},
    {"id": "act_a3", "group": "A", "name": "Decora tu rice krispi", "price_per_person": 0},
    {"id": "act_a4", "group": "A", "name": "Friendship bracelets", "price_per_person": 0},
    {"id": "act_a5", "group": "A", "name": "Botella sensorial", "price_per_person": 0},
    {"id": "act_a6", "group": "A", "name": "Capa de superhéroe", "price_per_person": 0},
    {"id": "act_a7", "group": "A", "name": "Decora tu máscara", "price_per_person": 0},
    {"id": "act_b1", "group": "B", "name": "Ice cream slab", "price_per_person": 60},
    {"id": "act_b2", "group": "B", "name": "Decora tu pastel", "price_per_person": 65},
    {"id": "act_b3", "group": "B", "name": "Pinta tu alcancía", "price_per_person": 90},
    {"id": "act_b4", "group": "B", "name": "Pinta tu canvas", "price_per_person": 80},
    {"id": "act_c1", "group": "C", "name": "Decora tu peine", "price_per_person": 65},
    {"id": "act_c2", "group": "C", "name": "Decora tu totebag", "price_per_person": 85},
    {"id": "act_c3", "group": "C", "name": "Decora tu bucket hat", "price_per_person": 90},
    {"id": "act_c4", "group": "C", "name": "Decora tu lapicera", "price_per_person": 65},
    {"id": "act_c5", "group": "C", "name": "Decora tu gorra", "price_per_person": 80}
  ]'::jsonb,
  30000,
  5
),
(
  '2c1f7571-59e5-4ea5-bc8e-a99173632f47',
  'hooping',
  'Decoración Grand + Actividad Premium incluida.',
  '["3 Horas de Evento", "Invitación digital personalizada", "Merienda para niños", "Bebida Refill (Refrescos, agua natural y agua del día)", "1 host/coordinadora/staff", "Vajilla", "Barra Hula", "Decoración Grand", "Palomitas para mesas adultos", "Plancha de cupcakes personalizada", "1 actividad a elegir (Opciones A)", "Chispero para pastel/cupcakes"]'::jsonb,
  '[
    {"id": "grand", "name": "Premium Grand", "price_cents": 0, "is_default": true},
    {"id": "plus", "name": "Premium Plus", "price_cents": 130000, "is_default": false}
  ]'::jsonb,
  '[
    {"id": "act_a1", "group": "A", "name": "Decora tu galleta", "price_per_person": 0},
    {"id": "act_a2", "group": "A", "name": "Decora tu cupcake", "price_per_person": 0},
    {"id": "act_a3", "group": "A", "name": "Decora tu rice krispi", "price_per_person": 0},
    {"id": "act_a4", "group": "A", "name": "Friendship bracelets", "price_per_person": 0},
    {"id": "act_a5", "group": "A", "name": "Botella sensorial", "price_per_person": 0},
    {"id": "act_a6", "group": "A", "name": "Capa de superhéroe", "price_per_person": 0},
    {"id": "act_a7", "group": "A", "name": "Decora tu máscara", "price_per_person": 0},
    {"id": "act_b1", "group": "B", "name": "Ice cream slab", "price_per_person": 60},
    {"id": "act_b2", "group": "B", "name": "Decora tu pastel", "price_per_person": 65},
    {"id": "act_b3", "group": "B", "name": "Pinta tu alcancía", "price_per_person": 90},
    {"id": "act_b4", "group": "B", "name": "Pinta tu canvas", "price_per_person": 80},
    {"id": "act_c1", "group": "C", "name": "Decora tu peine", "price_per_person": 65},
    {"id": "act_c2", "group": "C", "name": "Decora tu totebag", "price_per_person": 85},
    {"id": "act_c3", "group": "C", "name": "Decora tu bucket hat", "price_per_person": 90},
    {"id": "act_c4", "group": "C", "name": "Decora tu lapicera", "price_per_person": 65},
    {"id": "act_c5", "group": "C", "name": "Decora tu gorra", "price_per_person": 80}
  ]'::jsonb,
  30000,
  5
);

-- Monterrey
INSERT INTO public.package_category_configs (venue_id, category, description, inclusions, decorations, activities, glam_girls_price_cents, glam_girls_min_count)
VALUES (
  '7c6f595a-fb53-4e61-971a-deed63b28ec5',
  'hula_hula',
  'Decoración Petite incluida. Estilo clásico.',
  '["3 Horas de Evento", "Invitación digital personalizada", "Merienda para niños", "Bebida Refill (Refrescos, agua natural y agua del día)", "1 host/coordinadora/staff", "Vajilla", "Barra Hula", "Decoración Petite"]'::jsonb,
  '[
    {"id": "petite", "name": "Básica Petite", "price_cents": 0, "is_default": true},
    {"id": "grand", "name": "Premium Grand", "price_cents": 140000, "is_default": false},
    {"id": "plus", "name": "Premium Plus", "price_cents": 270000, "is_default": false}
  ]'::jsonb,
  '[
    {"id": "act_a1", "group": "A", "name": "Decora tu galleta", "price_per_person": 0},
    {"id": "act_a2", "group": "A", "name": "Decora tu cupcake", "price_per_person": 0},
    {"id": "act_a3", "group": "A", "name": "Decora tu rice krispi", "price_per_person": 0},
    {"id": "act_a4", "group": "A", "name": "Friendship bracelets", "price_per_person": 0},
    {"id": "act_a5", "group": "A", "name": "Botella sensorial", "price_per_person": 0},
    {"id": "act_a6", "group": "A", "name": "Capa de superhéroe", "price_per_person": 0},
    {"id": "act_a7", "group": "A", "name": "Decora tu máscara", "price_per_person": 0},
    {"id": "act_b1", "group": "B", "name": "Ice cream slab", "price_per_person": 60},
    {"id": "act_b2", "group": "B", "name": "Decora tu pastel", "price_per_person": 65},
    {"id": "act_b3", "group": "B", "name": "Pinta tu alcancía", "price_per_person": 90},
    {"id": "act_b4", "group": "B", "name": "Pinta tu canvas", "price_per_person": 80},
    {"id": "act_c1", "group": "C", "name": "Decora tu peine", "price_per_person": 65},
    {"id": "act_c2", "group": "C", "name": "Decora tu totebag", "price_per_person": 85},
    {"id": "act_c3", "group": "C", "name": "Decora tu bucket hat", "price_per_person": 90},
    {"id": "act_c4", "group": "C", "name": "Decora tu lapicera", "price_per_person": 65},
    {"id": "act_c5", "group": "C", "name": "Decora tu gorra", "price_per_person": 80}
  ]'::jsonb,
  30000,
  5
),
(
  '7c6f595a-fb53-4e61-971a-deed63b28ec5',
  'hooping',
  'Decoración Grand + Actividad Premium incluida.',
  '["3 Horas de Evento", "Invitación digital personalizada", "Merienda para niños", "Bebida Refill (Refrescos, agua natural y agua del día)", "1 host/coordinadora/staff", "Vajilla", "Barra Hula", "Decoración Grand", "Palomitas para mesas adultos", "Plancha de cupcakes personalizada", "1 actividad a elegir (Opciones A)", "Chispero para pastel/cupcakes"]'::jsonb,
  '[
    {"id": "grand", "name": "Premium Grand", "price_cents": 0, "is_default": true},
    {"id": "plus", "name": "Premium Plus", "price_cents": 130000, "is_default": false}
  ]'::jsonb,
  '[
    {"id": "act_a1", "group": "A", "name": "Decora tu galleta", "price_per_person": 0},
    {"id": "act_a2", "group": "A", "name": "Decora tu cupcake", "price_per_person": 0},
    {"id": "act_a3", "group": "A", "name": "Decora tu rice krispi", "price_per_person": 0},
    {"id": "act_a4", "group": "A", "name": "Friendship bracelets", "price_per_person": 0},
    {"id": "act_a5", "group": "A", "name": "Botella sensorial", "price_per_person": 0},
    {"id": "act_a6", "group": "A", "name": "Capa de superhéroe", "price_per_person": 0},
    {"id": "act_a7", "group": "A", "name": "Decora tu máscara", "price_per_person": 0},
    {"id": "act_b1", "group": "B", "name": "Ice cream slab", "price_per_person": 60},
    {"id": "act_b2", "group": "B", "name": "Decora tu pastel", "price_per_person": 65},
    {"id": "act_b3", "group": "B", "name": "Pinta tu alcancía", "price_per_person": 90},
    {"id": "act_b4", "group": "B", "name": "Pinta tu canvas", "price_per_person": 80},
    {"id": "act_c1", "group": "C", "name": "Decora tu peine", "price_per_person": 65},
    {"id": "act_c2", "group": "C", "name": "Decora tu totebag", "price_per_person": 85},
    {"id": "act_c3", "group": "C", "name": "Decora tu bucket hat", "price_per_person": 90},
    {"id": "act_c4", "group": "C", "name": "Decora tu lapicera", "price_per_person": 65},
    {"id": "act_c5", "group": "C", "name": "Decora tu gorra", "price_per_person": 80}
  ]'::jsonb,
  30000,
  5
);

-- Torreón
INSERT INTO public.package_category_configs (venue_id, category, description, inclusions, decorations, activities, glam_girls_price_cents, glam_girls_min_count)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'hula_hula',
  'Decoración Petite incluida. Estilo clásico.',
  '["3 Horas de Evento", "Invitación digital personalizada", "Merienda para niños", "Bebida Refill (Refrescos, agua natural y agua del día)", "1 host/coordinadora/staff", "Vajilla", "Barra Hula", "Decoración Petite"]'::jsonb,
  '[
    {"id": "petite", "name": "Básica Petite", "price_cents": 0, "is_default": true},
    {"id": "grand", "name": "Premium Grand", "price_cents": 140000, "is_default": false},
    {"id": "plus", "name": "Premium Plus", "price_cents": 270000, "is_default": false}
  ]'::jsonb,
  '[
    {"id": "act_a1", "group": "A", "name": "Decora tu galleta", "price_per_person": 0},
    {"id": "act_a2", "group": "A", "name": "Decora tu cupcake", "price_per_person": 0},
    {"id": "act_a3", "group": "A", "name": "Decora tu rice krispi", "price_per_person": 0},
    {"id": "act_a4", "group": "A", "name": "Friendship bracelets", "price_per_person": 0},
    {"id": "act_a5", "group": "A", "name": "Botella sensorial", "price_per_person": 0},
    {"id": "act_a6", "group": "A", "name": "Capa de superhéroe", "price_per_person": 0},
    {"id": "act_a7", "group": "A", "name": "Decora tu máscara", "price_per_person": 0},
    {"id": "act_b1", "group": "B", "name": "Ice cream slab", "price_per_person": 60},
    {"id": "act_b2", "group": "B", "name": "Decora tu pastel", "price_per_person": 65},
    {"id": "act_b3", "group": "B", "name": "Pinta tu alcancía", "price_per_person": 90},
    {"id": "act_b4", "group": "B", "name": "Pinta tu canvas", "price_per_person": 80},
    {"id": "act_c1", "group": "C", "name": "Decora tu peine", "price_per_person": 65},
    {"id": "act_c2", "group": "C", "name": "Decora tu totebag", "price_per_person": 85},
    {"id": "act_c3", "group": "C", "name": "Decora tu bucket hat", "price_per_person": 90},
    {"id": "act_c4", "group": "C", "name": "Decora tu lapicera", "price_per_person": 65},
    {"id": "act_c5", "group": "C", "name": "Decora tu gorra", "price_per_person": 80}
  ]'::jsonb,
  30000,
  5
),
(
  '00000000-0000-0000-0000-000000000001',
  'hooping',
  'Decoración Grand + Actividad Premium incluida.',
  '["3 Horas de Evento", "Invitación digital personalizada", "Merienda para niños", "Bebida Refill (Refrescos, agua natural y agua del día)", "1 host/coordinadora/staff", "Vajilla", "Barra Hula", "Decoración Grand", "Palomitas para mesas adultos", "Plancha de cupcakes personalizada", "1 actividad a elegir (Opciones A)", "Chispero para pastel/cupcakes"]'::jsonb,
  '[
    {"id": "grand", "name": "Premium Grand", "price_cents": 0, "is_default": true},
    {"id": "plus", "name": "Premium Plus", "price_cents": 130000, "is_default": false}
  ]'::jsonb,
  '[
    {"id": "act_a1", "group": "A", "name": "Decora tu galleta", "price_per_person": 0},
    {"id": "act_a2", "group": "A", "name": "Decora tu cupcake", "price_per_person": 0},
    {"id": "act_a3", "group": "A", "name": "Decora tu rice krispi", "price_per_person": 0},
    {"id": "act_a4", "group": "A", "name": "Friendship bracelets", "price_per_person": 0},
    {"id": "act_a5", "group": "A", "name": "Botella sensorial", "price_per_person": 0},
    {"id": "act_a6", "group": "A", "name": "Capa de superhéroe", "price_per_person": 0},
    {"id": "act_a7", "group": "A", "name": "Decora tu máscara", "price_per_person": 0},
    {"id": "act_b1", "group": "B", "name": "Ice cream slab", "price_per_person": 60},
    {"id": "act_b2", "group": "B", "name": "Decora tu pastel", "price_per_person": 65},
    {"id": "act_b3", "group": "B", "name": "Pinta tu alcancía", "price_per_person": 90},
    {"id": "act_b4", "group": "B", "name": "Pinta tu canvas", "price_per_person": 80},
    {"id": "act_c1", "group": "C", "name": "Decora tu peine", "price_per_person": 65},
    {"id": "act_c2", "group": "C", "name": "Decora tu totebag", "price_per_person": 85},
    {"id": "act_c3", "group": "C", "name": "Decora tu bucket hat", "price_per_person": 90},
    {"id": "act_c4", "group": "C", "name": "Decora tu lapicera", "price_per_person": 65},
    {"id": "act_c5", "group": "C", "name": "Decora tu gorra", "price_per_person": 80}
  ]'::jsonb,
  30000,
  5
);
