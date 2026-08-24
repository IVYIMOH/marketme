import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

// Create a single instance of the supabase client
export const supabase - createClient(supabaseUrl, supabaseAnonKey)