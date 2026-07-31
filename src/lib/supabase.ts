import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ixqprtabkyurqlqskjxi.supabase.co';

const supabaseAnonKey =
  'sb_publishable_d88iu_TjwufU-ZJxrQ5FFw_bPwEpiYC';

export const isSupabaseConfigured = true;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
