import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = 'https://jzdfxbbnhkzdetrpmqdx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZGZ4YmJuaGt6ZGV0cnBtcWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNzQ1NTEsImV4cCI6MjA4Njg1MDU1MX0.SxBmtB3zrILvvrKrrZMrjEnElJjSOl_Ga_j-X1dptyo';

async function checkDatabaseDirectly() {
  console.log('=== DATABASE SCHEMA CHECK ===\n');

  try {
    // Use REST API directly to check what exists
    console.log('1. CHECKING PROFILES TABLE...\n');
    
    let response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*&limit=0`, {
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      }
    });
    
    console.log('Profiles response status:', response.status);
    if (response.status === 200) {
      const headers = response.headers.get('content-range');
      console.log('Profiles table: EXISTS (accessible via REST API)');
      console.log('Content-Range:', headers);
    }

    // Check other tables
    console.log('\n2. CHECKING REQUIRED TABLES...\n');
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
      response = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=*&limit=0`, {
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        }
      });
      
      if (response.status === 200) {
        console.log(`  ✓ ${tableName}: EXISTS`);
      } else if (response.status === 404 || response.status === 401) {
        const text = await response.text();
        if (text.includes('does not exist')) {
          console.log(`  ✗ ${tableName}: DOES NOT EXIST`);
        } else if (response.status === 401) {
          console.log(`  ? ${tableName}: Permission denied (RLS policy may block anon key)`);
        } else {
          console.log(`  ? ${tableName}: Unknown error (${response.status})`);
        }
      } else {
        console.log(`  ? ${tableName}: HTTP ${response.status}`);
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkDatabaseDirectly().catch(console.error);
