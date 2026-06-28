-- Migration to add variants column to the extras table
ALTER TABLE public.extras ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT NULL;
