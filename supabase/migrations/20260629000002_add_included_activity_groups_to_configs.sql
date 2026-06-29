-- Add included_activity_groups to package_category_configs table
ALTER TABLE public.package_category_configs
ADD COLUMN included_activity_groups jsonb DEFAULT '[]'::jsonb;

-- Backfill existing data
UPDATE public.package_category_configs
SET included_activity_groups = '["A"]'::jsonb
WHERE category = 'hooping';

UPDATE public.package_category_configs
SET included_activity_groups = '[]'::jsonb
WHERE category = 'hula_hula';
