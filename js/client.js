// Supabase-klient. Importerer fra esm.sh slik at vi unngår build-steg.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://qtelocowlnhvmminaxkk.supabase.co";
const SUPABASE_KEY = "sb_publishable_J0X7enEUfJdCXLnzK4KkGg_7_Z9YMDd";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const COMPETITION = "WC"; // VM 2026
