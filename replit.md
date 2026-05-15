# Chấm Công JTEC

An attendance management system for employee check-in/check-out tracking with photo verification and an admin dashboard.

## Run & Operate

- `pnpm --filter @workspace/chamcong run dev` — run the frontend (port 8081)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19, Vite 7, Tailwind CSS 4, Wouter (routing), Radix UI / Shadcn components
- Database & Storage: Supabase (PostgreSQL + Storage via `@supabase/supabase-js`)
- Validation: Zod
- Build: Vite

## Where things live

- `artifacts/chamcong/` — main React frontend application
- `artifacts/chamcong/src/lib/supabase.ts` — Supabase client + shared types
- `artifacts/chamcong/src/pages/` — all page components (ChamCong, Admin, TraCuu, UngTuyen, GioiThieu)
- `artifacts/api-server/` — Express backend (not currently used in main workflow)
- `lib/api-spec/openapi.yaml` — OpenAPI source of truth
- `lib/db/` — Drizzle ORM schema definitions
- `.replit` — workflow config (runs frontend on port 8081)

## Architecture decisions

- All DB/storage calls go directly from the browser to Supabase using the public anon key
- No Supabase Auth — admin access uses a custom password checked against the `configs` table
- Photos (check-in/out, ID cards) are stored in Supabase Storage buckets (`checkin_photos`, `application_docs`)
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public publishable keys stored as shared env vars

## Product

- **ChamCong** — employees check in/out with photo capture and shift selection
- **TraCuu** — employees look up their attendance status for today
- **UngTuyen** — job application form with ID document upload
- **GioiThieu** — company introduction page
- **Admin** — admin dashboard for managing attendance records, job applications, shifts, and configs

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Must set `PORT=8081` and `BASE_PATH=/` when running the dev server
- Supabase RLS may be disabled on some tables for dev convenience — review before production
- Run `pnpm install` before starting if `node_modules` is missing
