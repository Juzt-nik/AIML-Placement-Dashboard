# AIML Placement Dashboard

A department placement dashboard — Dashboard, Students, Mentors, and Report views —
built with React + Vite, styled as a formal institutional site, backed by Supabase.

## 1. Install dependencies

```bash
npm install
```

## 2. Connect to Supabase

Copy the example env file and fill in your project's credentials
(Supabase dashboard → Project Settings → API):

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

`.env` is already in `.gitignore` — never commit real keys.

## 3. Run locally

```bash
npm run dev
```

Opens at `http://localhost:5173`. You'll need to be logged in via Supabase Auth
for RLS-protected tables (`students`, `offers`) to return data — see the schema
setup notes for creating a test coordinator login.

## 4. Deploy to Vercel

1. Push this project to a GitHub repo
2. In Vercel: **New Project** → import the repo → framework preset auto-detects Vite
3. Add the same two environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
   under **Project Settings → Environment Variables**
4. Deploy

## Structure

```
src/
  components/
    Masthead.jsx     — header + nav bar
    StatCard.jsx      — dashboard stat tile
  pages/
    Dashboard.jsx      — aggregate stats + charts
    Students.jsx       — filterable student table
    Mentors.jsx         — per-mentor rollup cards
    Report.jsx          — class-wise printable summary
  lib/
    supabase.js         — Supabase client
  index.css              — design tokens + all styling
```

## Not yet built

- Login screen / auth gate (currently every page queries Supabase directly;
  RLS will just return empty results if nobody's logged in)
- Mentor "request a change" form and coordinator "approve/reject" queue
  (the `change_requests` table and `approve_change_request()` function
  already exist in the schema — this just needs a UI)

Ask to build either of these next.
