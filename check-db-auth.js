import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jzdfxbbnhkzdetrpmqdx.supabase.co';
// Try with a service key if available, otherwise use anon key
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZGZ4YmJuaGt6ZGV0cnBtcWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NTEsImV4cCI6MjA4Njg1MDU1MX0.SxBmtB3zrILvvrKrrZMrjEnElJjSOl_Ga_j-X1dptyo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  console.log('=== DATABASE SCHEMA CHECK ===\n');

  try {
    // Check profiles table with better error handling
    console.log('1. CHECKING PROFILES TABLE STRUCTURE...\n');
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .limit(1);
    
    if (profilesError) {
      console.log('Profiles table ERROR:', profilesError.code, '-', profilesError.message);
    } else {
      console.log('Profiles table: EXISTS');
      console.log('Sample data columns:', Object.keys(profilesData?.[0] || {}));
    }

    // Try to get column info for profiles
    const { data: columnData, error: columnError } = await supabase
      .rpc('information_schema_columns', { p_table_name: 'profiles' });
    
    if (!columnError && columnData) {
      console.log('\nProfiles table columns:', columnData);
    }

    // Check for other tables  
    console.log('\n2. CHECKING FOR EXISTING TABLES...\n');
    const tablesToCheck = [
      'time_slots',
      'packages',
      'extras',
      'venue_config',
      'private_reservations',
      'private_reservation_extras',
      'playdate_reservations'
    ];

    for (const tableName of tablesToCheck) {
      const { error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact' })
        .limit(1);
      
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('not found')) {
          console.log(`  ✗ ${tableName}: DOES NOT EXIST`);
        } else {
          console.log(`  ? ${tableName}: ERROR - ${error.code || error.message}`);
        }
      } else {
        console.log(`  ✓ ${tableName}: EXISTS`);
      }
    }

    console.log('\n3. ATTEMPTING RLS POLICY CHECK...\n');
    // This might not work with anon key due to RLS
    const { data: policies, error: policiesError } = await supabase
      .rpc('get_policies');
    
    if (policiesError) {
      console.log('Could not fetch RLS policies (expected with anon key)');
    } else {
      console.log('RLS Policies:', policies);
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkDatabase().catch(console.error);
