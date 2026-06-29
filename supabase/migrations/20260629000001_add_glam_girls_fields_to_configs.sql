-- Migration to add glam_girls_description and glam_girls_inclusions to package_category_configs
ALTER TABLE public.package_category_configs
ADD COLUMN glam_girls_description text,
ADD COLUMN glam_girls_inclusions jsonb DEFAULT '[]'::jsonb;
