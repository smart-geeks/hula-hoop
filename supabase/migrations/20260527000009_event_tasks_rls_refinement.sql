-- Refinamiento de políticas de RLS en la tabla event_tasks
-- Para permitir al personal operativo ver y marcar como completadas las actividades de hoy.

DROP POLICY IF EXISTS "event_tasks_managers" ON event_tasks;
DROP POLICY IF EXISTS "event_tasks_staff_select" ON event_tasks;
DROP POLICY IF EXISTS "event_tasks_staff_update" ON event_tasks;

-- 1. Los administradores y propietarios tienen permisos totales de gestión (CRUD)
CREATE POLICY "event_tasks_managers" ON event_tasks
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (true);

-- 2. Todo el personal autenticado (staff, cajeros, etc.) puede ver las tareas
CREATE POLICY "event_tasks_staff_select" ON event_tasks
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Todo el personal autenticado puede actualizar el estado de las tareas (para poder marcarlas como completadas/pendientes)
CREATE POLICY "event_tasks_staff_update" ON event_tasks
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
