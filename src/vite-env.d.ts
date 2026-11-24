/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_FAKE_AUTH?: string
  readonly VITE_STRAVA_CLIENT_ID?: string
  readonly VITE_GOOGLE_LOGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
