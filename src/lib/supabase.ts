import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

function isConfiguredValue(value: string | undefined, placeholder: string): boolean {
  return Boolean(value && value.length > 0 && !value.includes(placeholder));
}

export const isSupabaseConfigured =
  isConfiguredValue(supabaseUrl, 'SEU-PROJETO') &&
  isConfiguredValue(supabaseAnonKey, 'SUA_SUPABASE_ANON_KEY');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;
