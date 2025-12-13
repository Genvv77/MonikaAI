import { createClient } from '@supabase/supabase-js'

// Replace these with the values you copied from Supabase Settings -> API
const supabaseUrl = 'https://aconfqrhkuspcpbpfvav.supabase.co'
const supabaseKey = 'sb_publishable_Pwd0N6rexQuZR6GCzmIbNw_WUXOfS8o'

export const supabase = createClient(supabaseUrl, supabaseKey)