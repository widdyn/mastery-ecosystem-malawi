# AGENTS.md — Mastery Ecosystem (Malawi Talent Map)

## Stack
- **Backend**: Express.js (Node >=18), serves static files from both `public/` and root
- **Frontend**: Vanilla HTML5 + CSS3 + JS (IIFE pattern, no framework)
- **Database**: Supabase (Postgres) via `@supabase/supabase-js` — uses admin client (`supabaseAdmin`) for all DB access; no Supabase Auth
- **Auth**: Custom token-based — bcryptjs password hash, random token stored in `localStorage` as `auth_user` (JSON) + `auth_token`. Sent via `x-user-email` header.
- **Maps**: OpenLayers (v10, CDN); **Charts**: Chart.js (investor dashboard only)

## Commands
- `npm start` — production
- `npm run dev` — dev with nodemon (auto-restart)

No build step, no tests, no linter, no typecheck.

## Database (Supabase)
Apply schema via Supabase dashboard SQL editor: `supabase_migration.sql` contains full DDL.

Two tables:
- `map_users` — public map pins (legacy standalone registration)
- `auth_users` — full auth users (signup creates matching `map_users` row)

## API Endpoints (all `/api/`)
| Endpoint | Method | Notes |
|---|---|---|
| `/api/talent` | GET | Combined auth_users + map_users with district centroid fallback |
| `/api/users` | GET | Legacy map_users |
| `/api/register` | POST | Legacy map_users registration |
| `/api/auth/signup` | POST | Creates auth_user + map_user, returns `{token, user}` |
| `/api/auth/signin` | POST | Returns `{token, user}` |
| `/api/auth/profile` | GET/PUT | x-user-email header required |
| `/api/auth/map-location` | GET/PUT | Update user's map pin |

Coordinates validated: lat -17..-9, lng 32..36 (Malawi bounds). District centroids in `DISTRICT_COORDS` in `server.js`.

## Styling
- Single `style.css` (~1900 lines) — CSS custom properties for theming
- Dark theme: `.dark-theme` class on `<html>`, toggled by `theme.js`, persisted in localStorage
- Fonts: Inter (body, `--font-sans`), Outfit (headings, `--font-heading`)
- Icons: Font Awesome 6
- Spacing system: `--space-{1,2,3,4,5,6,8,10,12,16,20,24,32}`
- Breakpoints: 1200px, 992px, 900px, 768px, 600px, 480px
- Grid layouts use `grid-template-columns` (not flexbox for panels)
- `.map-filter-grid`: `1fr 380px` (map + filter sidebar)
- `.contact-grid`: `1fr 1fr`

## Key Conventions
- All HTML pages are standalone, linked via `<nav>` shared across pages
- `theme.js` is loaded in `<head>` (before body) for flash-free theme; nav active-link highlighting
- Fade-in animations via `.fade-up` / `.stagger-children` classes, activated by IntersectionObserver in `theme.js`
- Favicon: placeholder via Font Awesome (no actual favicon file)
- `.env` requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## File Ownership
- `server.js` — all API routes + legacy inline profile page
- `style.css` — all styles (single file)
- `theme.js` — theme toggle, nav active-link, auth nav badge, scroll animations
- Root HTML files (7 pages) — each is a complete page with its own inline JS
- `public/` — legacy standalone pages (map-only, register-only)
- `docs/superpowers/` — design specs
- `malawi_districts.geojson` — district boundary data for OpenLayers
