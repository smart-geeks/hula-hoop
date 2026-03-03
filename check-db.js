import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jzdfxbbnhkzdetrpmqdx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZGZ4YmJuaGt6ZGV0cnBtcWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NTEsImV4cCI6MjA4Njg1MDU1MX0.SxBmtB3zrILvvrKrrZMrjEnElJjSOl_Ga_j-X1dptyo';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkDatabase() {
  console.log('=== DATABASE SCHEMA CHECK ===\n');

  try {
    // List all tables
    console.log('1. FETCHING ALL TABLES...\n');
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_tables', {}, { count: 'estimated' });
    
    if (tablesError) {
      console.log('RPC method not available, trying information_schema query...');
      const { data: schemaData, error: schemaError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
      
      if (schemaError) {
        console.log('Could not query information_schema');
      } else {
        console.log('Tables found:');
        schemaData?.forEach(t => console.log(`  - ${t.table_name}`));
      }
    } else {
      console.log('Tables via RPC:', tables);
    }

    // Check profiles table structure
    console.log('\n2. CHECKING PROFILES TABLE STRUCTURE...\n');
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .limit(0);
    
    if (profileError) {
      console.log('ERROR fetching profiles table:', profileError);
    } else {
      console.log('Profiles table exists and is accessible');
    }

    // Check for other tables
    const tablesToCheck = [
      'time_slots',
      'packages',
      'extras',
      'venue_config',
      'private_reservations',
      'private_reservation_extras',
      'playdate_reservations'
    ];

    console.log('\n3. CHECKING FOR EXISTING TABLES...\n');
    for (const tableName of tablesToCheck) {
      const { error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (error && error.code === 'PGRST116') {
        console.log(`  - ${tableName}: NOT EXISTS`);
      } else if (error) {
        console.log(`  - ${tableName}: ERROR - ${error.message}`);
      } else {
        console.log(`  - ${tableName}: EXISTS`);
      }
    }

  } catch (err) {
    console.error('Error checking database:', err);
  }
}

checkDatabase().catch(console.error);
