# Request Board

A minimal request-tracking board where **each user's color is their identity**. Cards live in three status columns; anyone can submit a request on a card, tagging a requester and a PIC (person-in-charge) as color-coded badges.

## Run it

```bash
npm install
npm run dev
```

Opens at http://localhost:5180.

## Concepts

- **Color = identity.** On first load you claim a unique color and attach your name. No two active users share a color (taken colors are locked in the picker). Your swatch — not your name — is the primary signal everywhere on the board.
- **Requests.** Open a card → *Submit a request* → pick a PIC and add notes. Once submitted, the card shows **requester → PIC** as color badges. Before submission a card shows no requester/PIC.
- **Popovers.** Hover or click any color swatch to see that person's name and their open requests (as requester or PIC). Clicking pins it open; click outside to dismiss.
- **Filter & sort.** Filter the board by status, requester, or PIC from the toolbar.
- **Switch / add teammates.** The *Switch* button (top-right) reopens the identity picker so you can add another teammate or continue as an existing one — useful for demoing the multi-user color system in one browser.

## Persistence

State is stored in `localStorage`, behind a single data module (`src/store.ts`). It's per-browser — great for a demo, but not shared across machines. To make the board truly multi-user with real-time sync, swap `store.ts` for a Supabase-backed implementation; the UI imports only from that module, so nothing else needs to change.

## Structure

```
src/
  types.ts               data model + statuses
  colors.ts              identity palette + contrast helper
  store.ts               persistence + selectors (the swap point for a backend)
  App.tsx                board, columns, toolbar, filters
  components/
    Onboarding.tsx       first-use color/name picker
    UserBadge.tsx        color swatch + hover/click popover
    CardModal.tsx        view/edit card, submit/withdraw request
```

## Stack

Vite + React 18 + TypeScript. No UI framework — plain CSS in `src/styles.css`.
