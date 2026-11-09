# Ticket Risk TO

A mobile-first web app that tells you how likely a parking ticket is on a Toronto street, right now or at a time you pick. Parking-sign green, but on the driver's side.

Type an address (or tap the location button), choose how long you're parking, and you get:

- **A 0–100 risk score** for that 100-block and time window, with a plain-language line like "about one ticket is written here during these hours every 2 weeks"
- **An hour-by-hour chart** for any day of the week (tap a bar to check that time)
- **A "quieter at…" tip** when risk is high
- **The most common tickets** on that street and what they cost
- **The busiest blocks** on the street

It installs to the home screen and works offline once data for a street has been loaded.

## How the score works

The score comes from the City of Toronto's [parking ticket dataset](https://open.toronto.ca/dataset/parking-tickets/) (about 3.4 million tickets for 2024–2025).

1. Tickets are grouped by street and 100-block (e.g. 600–699 College St), and counted by hour of day and day of week.
2. For your block and time, the app estimates how many tickets are written there in that hour in a typical week.
3. That number is compared against every block and hour in the city. A score of 80 means 80% of all tickets are written at quieter places or times.
4. For a stay longer than an hour, the busiest hour in the window counts — one bad hour is enough to get a ticket.

| Score | Label |
| --- | --- |
| 0–24 | Low |
| 25–59 | Moderate |
| 60–84 | High |
| 85–100 | Very high |

Things to know:

- **It measures enforcement, not your personal odds.** The data says where and when tickets get written, not how many cars were parked there.
- **Private-property tickets are left out** (infraction code 3, ~19% of all tickets), since they're about lots and driveways, not street parking.
- **Searching a street without a number** uses the average block on that street.
- **Blocks with fewer than 5 tickets in two years** aren't stored; the app treats them as very quiet.
- The dataset has addresses but no coordinates. "Use my location" turns your GPS position into an address with [OpenStreetMap Nominatim](https://nominatim.org/), only when you tap the button.

## Development

Needs Node 20+ (22 recommended, see `.nvmrc`). Python 3.9+ only if you rebuild the data.

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

### Refreshing the data

The built data is committed in `public/data/` (~4 MB, split into 64 files so the app only downloads the street you look up). To rebuild it:

```bash
npm run data                                       # 2024 + 2025
python3 scripts/build_data.py --years 2023 2024 2025  # any years
python3 scripts/build_data.py --exclude-codes        # keep private-property tickets
```

The script downloads the yearly ZIPs into `data-raw/` (git-ignored) and uses only the Python standard library.

## Project layout

```
scripts/build_data.py   download + aggregate ticket data into public/data/
src/lib/normalize.ts    street-name matching (mirrors the Python rules)
src/lib/data.ts         data loading, sharding, search
src/lib/risk.ts         scoring
src/lib/geo.ts          GPS + reverse geocoding
src/components/         UI pieces
public/sw.js            offline cache
```

## Tech stack

| Part | What it uses |
| --- | --- |
| App | React 18 + TypeScript, built with Vite 5 |
| Styling | Plain CSS with light/dark themes, Plus Jakarta Sans (self-hosted via Fontsource) |
| Offline / install | Web app manifest + a small hand-written service worker (`public/sw.js`) |
| Data | Static JSON in `public/data/`, built by a Python 3 script (standard library only) |
| Location | Browser geolocation + OpenStreetMap Nominatim for street lookup |
| Tests | Vitest |
| Backend | None. It's a fully static site, so no server, database or API keys |

## Deploying

It's a static site: build with `npm run build` and serve the `dist/` folder. No environment variables are needed. The ticket data is already committed, so Python isn't needed at build time.

| Host | Setup |
| --- | --- |
| **Netlify** | "Add new site → Import from Git", pick the repo. `netlify.toml` sets the build command, folder, Node version and cache headers. |
| **Vercel** | Import the repo. It detects Vite automatically (build `npm run build`, output `dist`). |
| **Cloudflare Pages** | Framework preset "Vite", build command `npm run build`, output `dist`, env var `NODE_VERSION=22`. |
| **GitHub Pages** | Settings → Pages → Source: **GitHub Actions**. `.github/workflows/deploy.yml` deploys every push to `main`. |
| **Anywhere else** | Upload the contents of `dist/` to any static host or bucket (S3, Firebase Hosting, Render static site…). |

Hosting under a sub-path (like `example.com/parking/`)? Build with `BASE_PATH=/parking/ npm run build`.

The site needs HTTPS for "Use my location" to work. All the hosts above provide it.

## Disclaimer

This shows patterns from past tickets. It's not legal advice and not a guarantee. Always read the signs.

Data: Contains information licensed under the [Open Government Licence – Toronto](https://open.toronto.ca/open-data-license/).

Independent project. Not affiliated with the City of Toronto, Toronto Police or the Toronto Parking Authority (Green P).
