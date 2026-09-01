# VMS Dashboard

Frontend dashboard untuk Vessel Monitoring System: Fleet View, vessel dashboard, report, trace playback, voyage plan, alarm, fuel management, CCTV snapshot, profile, dan administrator tools.

Dokumentasi lengkap ada di:

[docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md)

## Quick Start

```bash
npm install
npm run dev
```

Dev server:

```text
http://localhost:5173
```

## Environment

Buat `.env`:

```env
VITE_API_BASE_URL=https://apitest.semar.biz.id/api/v1
```

## Script Utama

| Command | Fungsi |
| --- | --- |
| `npm run dev` | Jalankan dev server |
| `npm run build` | Build production |
| `npm run preview` | Preview build |
| `npm run check` | Svelte check |
| `npm run lint` | Prettier check + ESLint |
| `npm run format` | Format project |
| `npm run test` | Unit test |

## Docker

Build:

```bash
docker build \
  --build-arg VITE_API_BASE_URL=https://apitest.semar.biz.id/api/v1 \
  -t vms-dashboard:staging .
```

Run:

```bash
docker run --rm -p 8082:8082 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=8082 \
  vms-dashboard:staging
```

Atau:

```bash
docker compose up -d --build
```

## CI

GitHub Actions tersedia untuk build Docker image dan push ke GHCR:

- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`

Flow:

```text
push -> npm build -> docker build -> push GHCR
```

## Struktur Singkat

```text
src/routes/+page.svelte          Login page
src/routes/app/+page.svelte      Main workspace
src/routes/layout.css            Global style
src/lib/Sidebar.svelte           Main sidebar
src/lib/pages/FleetViewPage.svelte
src/lib/pages/VesselPage.svelte
src/lib/pages/VoyagePlansPage.svelte
src/lib/pages/AdministratorPage.svelte
src/lib/pages/vessel/*           Vessel sub-pages
src/lib/api/*                    API wrappers
src/lib/utils/*                  Map/asset/coordinate helpers
static/assets                    Static icons, logo, map markers
```

## Catatan

- Base map memakai CARTO Voyager/OpenStreetMap.
- Auth memakai JWT bearer token di `localStorage`.
- Page yang memiliki filter tanggal/waktu/range umumnya tidak auto-load sebelum user klik Load.
- Fleet View adalah page awal setelah login.
