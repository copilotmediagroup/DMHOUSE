import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ixqprtabkyurqlqskjxi.supabase.co';

const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4cXBydGFia3l1cnFscXNranhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzA3NjAsImV4cCI6MjEwMDY0Njc2MH0.s4bYw5OGWdjZHLFDl-8_LoNngUbk7VRoxf4tH8j1Saw';

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
