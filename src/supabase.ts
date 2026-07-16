import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client, initialised from Vite env vars. Kept in its own module so
 * the rest of the app imports a ready-to-use client (or null when unconfigured).
 *
 * Set these in a `.env` file at the project root (see `.env.example`):
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, anonKey as string, {
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null

// Row shapes as stored in Postgres (snake_case).
export interface UserRow {
  id: string
  name: string
  color: string
  created_at: string
}

export interface CardRow {
  id: string
  title: string
  description: string
  status: string
  requester_id: string | null
  pic_id: string | null
  notes: string
  requested_at: string | null
  created_at: string
}
