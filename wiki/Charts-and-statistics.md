# Charts and statistics

`src/pages/stats.astro` prepares data on the server. The two chart components receive only the data needed to draw; PocketBase credentials are never sent to the browser. Chart.js itself is vendored at `public/vendor/chart.umd.js`.

## Existing statistics

| Display | Source and calculation |
| --- | --- |
| Red/Blue record | Sum of `teamProfit()` per team colour |
| Biggest win/loss | Highest/lowest recorded team result |
| Expert leaderboard | Team results grouped by assigned expert |
| Profit histogram | Team result counts in `profitBins` |
| Episode chart | Red + Blue result for each logged episode |
| Lot tables | `items` with a name and required prices |
| Scatter plot | Lots with purchase, sale, and auctioneer estimate |

## Add a simple statistic

In `src/pages/stats.astro`, derive a value from `teams`, `items`, `details`, or `experts` before the second `---`. Render it in the page markup using `{value}`. Use `money.format(number)` for pounds. Keep calculations close to related values and name the result for what it measures.

## Add a Chart.js chart

1. Prepare a small JSON-safe data structure in `stats.astro`, for example `const labelsAndValues = rows.map((row) => ({ label: row.name, value: row.profit }));`.
2. Add a focused component in `src/components/`, following `StatsCharts.astro`. Accept data through `Astro.props`, then use `JSON.stringify(data).replace(/</g, '\\u003c')` before placing it in a `data-*` attribute.
3. Load `/vendor/chart.umd.js` and initialize one chart per matching component root. Check `dataset.ready` so Astro navigation or repeated components do not initialize it twice.
4. Add the component to `stats.astro` with an explanatory heading and a no-data message.
5. Run `npm run build` and test at narrow and wide browser widths.

For a bar chart, use `type: 'bar'`; for a line chart, use `type: 'line'`; for points, use `type: 'scatter'`. Chart options define axes, tooltips, animation, and responsiveness. The existing charts use the project palette: Red `#ed2638`, Blue `#2587d6`, Golden Gavel `#ffd04a`, and dark navy `#111722`.

## Change histogram bands

Edit `profitBins` in `stats.astro`. Each band has `label`, inclusive `min`, and inclusive `max`. Keep bands consecutive and non-overlapping, and retain `-Infinity` / `Infinity` only at the outer ends.
