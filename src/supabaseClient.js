import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  // Unset in the Docker production build: the app server proxies /rest/v1 on whatever
  // address the page was opened from (kids.lan or the Funnel URL).
  import.meta.env.VITE_SUPABASE_URL || window.location.origin,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    accessToken: async () => localStorage.getItem('token') || null,
  }
)
