import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly at startup instead of firing requests at "undefined"
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, then restart the Vite dev server (Vite only reads .env at boot).'
  )
}

// Create a single instance of the supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
