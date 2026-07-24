# Request Board

A minimal request-tracking board where **each user's color is their identity**. Cards live in four status columns (**To-do → In Progress → Review → Done**); anyone can submit a request on a card, tagging a requester and a PIC (person-in-charge) as color-coded badges. Persisted in **Supabase** with live realtime sync across everyone's browsers.

## Setup

### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com) (free tier is enough) and create a project.

### 2. Create the tables

In the Supabase dashboard: **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and **Run**. This creates the `users`, `cards`, and `attachments` tables, the `card-attachments` storage bucket, permissive RLS policies, realtime, and a few seed cards. The whole file is safe to re-run any time you pull a newer version — every statement is idempotent.

### 3. Add your credentials

In Supabase: **Project Settings → API**, copy the **Project URL** and the **anon public** key. Then create a `.env` file in the project root (copy from `.env.example`):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run it

```bash
npm install
npm run dev
```

Opens at http://localhost:5180. (Restart the dev server after creating/editing `.env`.)

> **Note on the anon key:** it's a public, client-side key and is meant to ship in the browser — access is governed by the RLS policies in `schema.sql`, not by hiding the key. This board's policies intentionally allow anyone with the app to read/write, matching the "visible to all" design. Never put your Supabase **service_role** key in this app.

## Concepts

- **Color = identity.** On first load you claim a unique color and attach your name. No two active users share a color (taken colors are locked in the picker). Your swatch — not your name — is the primary signal everywhere on the board.
- **Requests.** Open a card → *Submit a request* → pick a PIC and add notes. Once submitted, the card shows **requester → PIC** as color badges. Before submission a card shows no requester/PIC.
- **Popovers.** Hover or click any color swatch to see that person's name and their open requests (as requester or PIC). Clicking pins it open; click outside to dismiss.
- **Filter & sort.** Filter the board by status, requester, or PIC from the toolbar — or hit **Mine** to show only cards where *you* are the requester or PIC.
- **Switch / add teammates.** The *Switch* button (top-right) reopens the identity picker so you can add another teammate or continue as an existing one.
- **Attachments.** Every card has an *Attachments* section — **+ Add file** uploads a document or image (10 MB max, stored in the `card-attachments` bucket); **+ Add link** attaches an external URL with an optional label. Images show a thumbnail; everything else shows a file/link icon. Each attachment shows who added it (their color) and can be removed by anyone. Deleting a card also deletes its file attachments from storage.

## Persistence

Backed by **Supabase** (Postgres + realtime), behind a single data module ([`src/store.ts`](src/store.ts)). The UI reads synchronously from an in-memory cache that's hydrated from Supabase on load and kept in sync via Postgres realtime — any change on any device refetches and updates every open board. "Who am I" (your current identity) is stored per-browser in `localStorage`; everything shared lives in the database.

Colour uniqueness is enforced by a `UNIQUE` constraint on `users.color`, so two people can never claim the same identity even in a race.

## Structure

```
src/
  types.ts               data model + statuses
  colors.ts              identity palette + contrast helper
  supabase.ts            Supabase client + row types
  store.ts               persistence + realtime + selectors (the backend boundary)
  App.tsx                board, columns, toolbar, filters, loading/setup states
  components/
    Onboarding.tsx       first-use color/name picker
    UserBadge.tsx        color swatch + hover/click popover
    CardModal.tsx        view/edit card, submit/withdraw request
supabase/
  schema.sql             tables, RLS, realtime, seed data
```

## Stack

Vite + React 18 + TypeScript, `@supabase/supabase-js`. No UI framework — plain CSS in `src/styles.css`.
