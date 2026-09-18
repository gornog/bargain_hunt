# Bargain Hunt · Field Notes

An Astro SSR archive for logging Bargain Hunt episodes, team purchases and auction results. PocketBase stores the data; the dashboard calculates archive totals and expert performance on each request.

## Import the BBC episode guide

The importer tries the BBC's structured programme representations first and falls back to the public guide page. It creates missing experts and episodes, and skips matching records so it can be run again safely.

```sh
POCKETBASE_URL=http://localhost:8090 npm run import:bbc
```

The importer only fills episode metadata (series, episode number, title, date and presenter). Team prices, team experts and results are intentionally left for the field-notes form, because that information is not supplied by the BBC guide.

`npm run import:bbc` is the normal non-destructive sync. It adds new standard BBC episodes and refreshes only unprotected BBC metadata; it never deletes records or overwrites an existing synopsis. Every episode referenced by `team_performances` is protected from identity changes.

For a one-off catalogue reset, use the same importer in nuclear mode. It starts with the normal sync, compares every BBC PID with the standard manifest fetched in that same run, repairs unprotected coordinates, and reports old extended/shortened/nonstandard BBC records. It does not delete until explicitly applied:

```sh
# Review only: no records are deleted.
npm run import:bbc:nuclear

# Take a PocketBase backup, check the report, then delete only unprotected
# BBC records that are absent from the current standard manifest.
npm run import:bbc:nuclear -- --apply

# Future full reset only: permits removal of records with team data as well.
npm run import:bbc:nuclear -- --apply --include-logged
```

`--include-logged` is intentionally dangerous and is rejected without `--apply`.

Episode and expert images are downloaded only when the PocketBase record has no
image, so routine syncs do not repeatedly request BBC media. To deliberately
refresh stored images, set `BBC_REFRESH_IMAGES=true` for that run:

```sh
BBC_REFRESH_IMAGES=true POCKETBASE_URL=http://localhost:8090 npm run import:bbc
```

For the Proxmox deployment, run it from the frontend container with `POCKETBASE_URL=http://pocketbase:8090`.

## Consolidate auctioneers into the people directory

The schema keeps the legacy `auctioneers` collection during a safe, additive migration. Import the updated `pb_schema.json`, then preview the migration and apply it only after the reported counts look right:

```sh
POCKETBASE_URL=http://pocketbase:8090 POCKETBASE_SUPERUSER_TOKEN=... node tools/migrate-auctioneers-to-experts.mjs
POCKETBASE_URL=http://pocketbase:8090 POCKETBASE_SUPERUSER_TOKEN=... node tools/migrate-auctioneers-to-experts.mjs --apply
```

It creates or reuses people by their legacy expert link or case-insensitive name, marks them as auctioneers, merges their auction houses, and copies each episode's links to `auctioneer_people`. It never deletes or modifies old links, so validate the migrated episode count (including the three logged episodes) before retiring the legacy collection.


## Production and private editing

See [the production deployment guide](deploy/README.md). It keeps PocketBase off the host network, locks its collection rules, and protects `/log` with an editor sign-in.
## Development

`npm run dev` starts Astro on all interfaces at port 4321. For production, use `npm run build` followed by `node ./dist/server/entry.mjs`.

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
