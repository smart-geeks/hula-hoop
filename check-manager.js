const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'https://jzdfxbbnhkzdetrpmqdx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZGZ4YmJuaGt6ZGV0cnBtcWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NTEsImV4cCI6MjA4Njg1MDU1MX0.SxBmtB3zrILvvrKrrZMrjEnElJjSOl_Ga_j-X1dptyo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'manager@gmail.com',
    password: '123456'
  });

  if (authErr) {
    console.error('Auth Error:', authErr.message);
    return;
  }
  
  const user = authData.user;
  console.log('User ID:', user.id);
  
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profErr) console.error('Profile Error:', profErr.message);
  else console.log('Profile:', profile);

  const { data: venueUsers, error: vuErr } = await supabase
    .from('venue_users')
    .select('*, roles(*)')
    .eq('user_id', user.id);

  if (vuErr) console.error('Venue Users Error:', vuErr.message);
  else console.log('Venue Users:', venueUsers);
}

run().catch(console.error);
