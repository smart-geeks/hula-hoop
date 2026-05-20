// DEV BRANCH — apunta a hula-hoop-dev (Supabase branch aislado de producción)
// Producción usa environment.ts — este archivo NUNCA se despliega al cliente
export const environment = {
  production: false,
  supabaseUrl: 'https://mcpioumrslljmmlqbart.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jcGlvdW1yc2xsam1tbHFiYXJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMzI1ODEsImV4cCI6MjA5NDgwODU4MX0.wnQmhSNTnPJl4b9fvBf_dMmW7FSuhm-rI2rLtA-VdlY',
  mpPublicKey: 'APP_USR-1fcc0893-b1de-477e-81d6-e99c3d67f69d',
};
