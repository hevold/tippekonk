// Supabase client + shared config
const SUPABASE_URL = 'https://qtelocowlnhvmminaxkk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0ZWxvY293bG5odm1taW5heGtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NjQxNjYsImV4cCI6MjA5MjM0MDE2Nn0.rg5SK7L55x-030gGxCew-HhwOZUhbLLFB-xCpfsC4cE';

// Get your free API key at https://www.football-data.org/client/register
export const FOOTBALL_API_KEY = '';

export const COMPETITION = 'WC'; // WC = World Cup, EC = Euro

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
