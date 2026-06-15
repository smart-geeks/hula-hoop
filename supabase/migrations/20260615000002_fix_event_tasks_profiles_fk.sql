-- Fix event_tasks foreign key to refer to public.profiles instead of auth.users
-- This allows PostgREST to automatically resolve relation joins for the assignee
ALTER TABLE public.event_tasks DROP CONSTRAINT IF EXISTS event_tasks_asignado_a_fkey;
ALTER TABLE public.event_tasks DROP CONSTRAINT IF EXISTS event_tasks_asignado_a_profiles_fkey;
ALTER TABLE public.event_tasks ADD CONSTRAINT event_tasks_asignado_a_profiles_fkey FOREIGN KEY (asignado_a) REFERENCES public.profiles(id) ON DELETE SET NULL;
