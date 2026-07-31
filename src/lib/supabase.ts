import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ixqprtabkyurqlqskjxi.supabase.co';

const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoiaXhxcnB0YWJreXVycWxxc2tqeGkiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NTA3MDc2MCwiZXhwIjoyMTAwNjQ2NzYwfQ.s4bYw5OGWdjZHLFDl-8_LoNngUbk7VRoxf4tH8j1Saw';

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
