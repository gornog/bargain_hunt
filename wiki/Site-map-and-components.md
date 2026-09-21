# Site map and components

Astro maps files in `src/pages/` directly to URLs. There is no separate routing table.

| URL | File | Purpose |
| --- | --- | --- |
| `/` | `src/pages/index.astro` | Overview, totals, and recent records |
| `/episodes` | `src/pages/episodes.astro` | Searchable episode catalogue |
| `/log` | `src/pages/log.astro` | Protected editor form; saves episode and team data |
| `/experts` | `src/pages/experts.astro` | Presenter, expert, and auctioneer cards |
| `/stats` | `src/pages/stats.astro` | Calculated statistics and Chart.js charts |
| `/people` | `src/pages/people.astro` | Redirect to `/experts` for old links |

## Reusable building blocks

| File | What it owns |
| --- | --- |
| `src/layouts/Layout.astro` | HTML document, page title, metadata, global stylesheet |
| `src/components/SiteHeader.astro` | Brand and navigation. Edit the `links` list to add a navigation item. |
| `src/components/SiteFooter.astro` | Shared footer; each page supplies the short right-hand detail. |
| `src/components/Team.astro` | One red or blue editor card: assigned expert, three judged lots, bonus lot, and final-profit mode. |
| `src/components/PersonCombobox.astro` | Searchable person picker for presenters and team experts. |
| `src/components/EntityCombobox.astro` | Native datalist picker for auction houses and auctioneers. |
| `src/components/StatsCharts.astro` | Histogram and per-episode Chart.js bar charts. |
| `src/components/ItemScatterChart.astro` | Chart.js scatter plot of lots. |
| `src/lib/archive.ts` | Server-only PocketBase connection, file proxy URL, team-result rules, and archive loading. |
| `src/styles/global.css` | All visual styling. Search for the component class name before editing a rule. |

## Editing a page safely

Make a new `.astro` file in `src/pages/` for a new URL, import `Layout`, `SiteHeader`, and `SiteFooter`, then run `npm run build`. Use normal `<a href="/path">` links between pages.

Do not put PocketBase credentials in browser JavaScript. Page frontmatter (between `---` markers) runs on the server; a `<script>` runs in the visitor's browser. Fetch data through `loadArchive()` or `getPocketBase()` in frontmatter or a server endpoint.
