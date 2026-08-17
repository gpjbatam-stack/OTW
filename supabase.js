import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://vumyxlbybhlaicubtgun.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_I_RUzlQZGzVChVl7gbku6Q_Nmq1FBD2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
