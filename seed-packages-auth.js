const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://jzdfxbbnhkzdetrpmqdx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZGZ4YmJuaGt6ZGV0cnBtcWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NTEsImV4cCI6MjA4Njg1MDU1MX0.SxBmtB3zrILvvrKrrZMrjEnElJjSOl_Ga_j-X1dptyo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const venueId = '00000000-0000-0000-0000-000000000001';

const hulaHulaInclusions = [
  '3 Horas de Evento',
  'Invitación digital personalizada',
  'Merienda para niños',
  'Bebida Refill (Refrescos, agua natural y agua del día)',
  '1 host/coordinadora/staff',
  'Vajilla',
  'Barra Hula',
  'Decoración Petite'
];

const hoopingInclusions = [
  '3 Horas de Evento',
  'Invitación digital personalizada',
  'Merienda para niños',
  'Bebida Refill (Refrescos, agua natural y agua del día)',
  '1 host/coordinadora/staff',
  'Vajilla',
  'Barra Hula',
  'Decoración Grand',
  'Palomitas para mesas adultos',
  'Plancha de cupcakes personalizada',
  '1 actividad a elegir (Opciones A)',
  'Chispero para pastel/cupcakes'
];

const newPackages = [
  // Hula Hula
  { name: 'Hula Hula - 50 personas', guests: 50, price: 2080000, inclusions: hulaHulaInclusions, color: 'lima', order: 10 },
  { name: 'Hula Hula - 60 personas', guests: 60, price: 2280000, inclusions: hulaHulaInclusions, color: 'lima', order: 11 },
  { name: 'Hula Hula - 70 personas', guests: 70, price: 2480000, inclusions: hulaHulaInclusions, color: 'lima', order: 12 },
  { name: 'Hula Hula - 80 personas', guests: 80, price: 2680000, inclusions: hulaHulaInclusions, color: 'lima', order: 13 },
  { name: 'Hula Hula - 90 personas', guests: 90, price: 2880000, inclusions: hulaHulaInclusions, color: 'lima', order: 14 },
  { name: 'Hula Hula - 100 personas', guests: 100, price: 3080000, inclusions: hulaHulaInclusions, color: 'lima', order: 15 },
  { name: 'Hula Hula - 120 personas', guests: 120, price: 3280000, inclusions: hulaHulaInclusions, color: 'lima', order: 16 },

  // Hooping
  { name: 'Hooping - 50 personas', guests: 50, price: 2590000, inclusions: hoopingInclusions, color: 'rosa-pastel', order: 20 },
  { name: 'Hooping - 60 personas', guests: 60, price: 2790000, inclusions: hoopingInclusions, color: 'rosa-pastel', order: 21 },
  { name: 'Hooping - 70 personas', guests: 70, price: 2990000, inclusions: hoopingInclusions, color: 'rosa-pastel', order: 22 },
  { name: 'Hooping - 80 personas', guests: 80, price: 3190000, inclusions: hoopingInclusions, color: 'rosa-pastel', order: 23 },
  { name: 'Hooping - 90 personas', guests: 90, price: 3390000, inclusions: hoopingInclusions, color: 'rosa-pastel', order: 24 },
  { name: 'Hooping - 100 personas', guests: 100, price: 3590000, inclusions: hoopingInclusions, color: 'rosa-pastel', order: 25 },
  { name: 'Hooping - 120 personas', guests: 120, price: 3790000, inclusions: hoopingInclusions, color: 'rosa-pastel', order: 26 }
];

async function seed() {
  console.log('Logging in as manager...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'manager@gmail.com',
    password: '123456'
  });

  if (authErr) {
    console.error('Failed to sign in:', authErr.message);
    return;
  }
  console.log('Logged in successfully!');

  console.log('1. Deactivating all existing packages...');
  const { error: err1 } = await supabase.from('packages').update({ is_active: false }).eq('venue_id', venueId);
  if (err1) {
    console.error('Error deactivating packages:', err1.message);
    return;
  }
  console.log('Successfully deactivated existing packages.');

  console.log('2. Inserting new packages...');
  const insertPayloads = newPackages.map(pkg => ({
    venue_id: venueId,
    name: pkg.name,
    description: pkg.name.startsWith('Hooping') ? 'Paquete Premium Hooping con decoración Grand y Actividad' : 'Paquete clásico Hula Hoop',
    min_guests: pkg.guests,
    max_guests: pkg.guests,
    price_cents: pkg.price,
    inclusions: pkg.inclusions,
    is_active: true,
    sort_order: pkg.order,
    color: pkg.color,
    deposit_type: 'fixed',
    deposit_value: 500000, // $5,000.00 MXN in cents
    days_to_liquidate: 7
  }));

  const { error: err2 } = await supabase.from('packages').insert(insertPayloads);
  if (err2) {
    console.error('Error inserting packages:', err2.message);
    return;
  }
  console.log('Successfully inserted new packages.');

  console.log('3. Seeding AM snack options...');
  // First delete existing AM snacks if they exist to avoid duplication
  const snackNames = ['Chilaquiles verdes con pollo', 'Molletes', 'Croissant de jamón y queso'];
  const { error: errDel } = await supabase.from('snack_options').delete().in('name', snackNames);
  if (errDel) {
    console.error('Error deleting old snacks:', errDel.message);
  }

  const amSnacks = [
    { name: 'Chilaquiles verdes con pollo', description: 'Snack especial horario A.M.', is_active: true, sort_order: 10 },
    { name: 'Molletes', description: 'Snack especial horario A.M.', is_active: true, sort_order: 11 },
    { name: 'Croissant de jamón y queso', description: 'Snack especial horario A.M.', is_active: true, sort_order: 12 }
  ];

  const { error: err3 } = await supabase.from('snack_options').insert(amSnacks);
  if (err3) {
    console.error('Error seeding snack options:', err3.message);
    return;
  }
  console.log('Successfully seeded AM snack options.');
  console.log('Seed completed successfully!');
}

seed().catch(console.error);
