# Docker self-hosting

This installation uses two containers:

```text
Browser -> host port 4321 -> Astro app -> private Docker network -> PocketBase
```

Only the Astro app is published to the Docker host. PocketBase is private to the Docker network, and the app uses server-side credentials to read and write it.

## First installation

Install Docker Engine and the Docker Compose plugin on the machine. Clone this repository, then from the repository root:

```sh
cp deploy/.env.example deploy/.env
# Edit deploy/.env and replace every placeholder password.
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
```

Open `http://DOCKER-MACHINE-IP:4321`. Change `APP_PORT` in `deploy/.env` before starting if that host port is already used. Put the app behind an HTTPS reverse proxy if it will be accessed outside a trusted LAN.

The first container start creates the named `pocketbase_data` volume. Open PocketBase's Admin UI only temporarily through a controlled method when setting up the first superuser; do not permanently publish port 8090. Import `pb_schema.json` into the new PocketBase instance before using the logger.

## Updates

```sh
git pull
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
docker image prune
```

The named PocketBase volume is not replaced by an application rebuild. Do not run `docker compose down -v` in production: `-v` deletes the database volume.

## Backup and recovery

Back up PocketBase before schema changes, imports with destructive options, or upgrades. From the Docker host, stop the stack briefly and archive the named volume, or use PocketBase's built-in backup tooling. Test a restore on a separate machine. Back up the application repository and the private `deploy/.env` separately; the latter contains passwords.

## Security checklist

- Set long, unique `SITE_EDITOR_PASSWORD` and PocketBase superuser passwords.
- Keep `deploy/.env` out of Git.
- Publish only the Astro port; do not add a PocketBase `ports:` entry.
- After initial setup, use `npm run pocketbase:lock -- --apply` from a container that can reach PocketBase to lock direct collection access. Read `deploy/README.md` first.
- Use HTTPS and a reverse-proxy authentication layer when the editor route is exposed beyond a trusted local network.
