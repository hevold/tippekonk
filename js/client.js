// Supabase-klient. Importerer fra esm.sh slik at vi unngår build-steg.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://qtelocowlnhvmminaxkk.supabase.co";
// Legacy anon JWT — virker både mot PostgREST og edge functions. Publishable-nøkler
// (sb_publishable_*) avvises av edge functions siden de ikke er JWT-formaterte.
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0ZWxvY293bG5odm1taW5heGtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NjQxNjYsImV4cCI6MjA5MjM0MDE2Nn0.rg5SK7L55x-030gGxCew-HhwOZUhbLLFB-xCpfsC4cE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const COMPETITION = "WC"; // VM 2026
