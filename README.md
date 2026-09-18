# Bargain Hunt · Field Notes

An Astro SSR archive for logging Bargain Hunt episodes, team purchases and auction results. PocketBase stores the data; the dashboard calculates archive totals and expert performance on each request.

## Import the BBC episode guide

The importer tries the BBC's structured programme representations first and falls back to the public guide page. It creates missing experts and episodes, and skips matching records so it can be run again safely.

```sh
POCKETBASE_URL=http://localhost:8090 npm run import:bbc
```

The importer only fills episode metadata (series, episode number, title, date and presenter). Team prices, team experts and results are intentionally left for the field-notes form, because that information is not supplied by the BBC guide.

For the Proxmox deployment, run it from the frontend container with `POCKETBASE_URL=http://pocketbase:8090`.


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
