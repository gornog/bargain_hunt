# Production deployment and PocketBase security

The former stack exposes PocketBase (`8090:8090`) to every network that can reach the host, and the current schema uses blank API rules. In PocketBase, a blank rule means anyone can perform that operation; it is not an "unset" or private rule. This must be changed before treating the app as private.

## Recommended layout: two containers, one copy of the application

Use `docker-compose.portainer.yml` as the Portainer stack. It does **not** create another clone: `/opt/bargain-hunt/astro-build` is mounted once into the Astro container, while PocketBase keeps the existing `/opt/bargain-hunt/pb_data` volume.

- Publish only Astro on `4321` (or put it behind the existing HTTPS reverse proxy).
- PocketBase has `expose: 8090`, so it can only be reached from the Docker network by `http://pocketbase:8090`.
- The Astro server reads/writes PocketBase over that private network using server-only PocketBase superuser credentials. They are never sent to the browser.
- The `/log` page uses HTTP Basic authentication. Set a long `SITE_EDITOR_PASSWORD`; production returns `503` for `/log` if it is omitted.

Publishing a second host port does not make a second page from the Astro container: a port only forwards to a process already listening inside that container. Astro listens on 4321 and PocketBase is a separate process, so the right design is two containers connected by a private Docker network—not duplicate repositories or data volumes.

## Safe migration order

1. Back up `/opt/bargain-hunt/pb_data` while the PocketBase container is stopped (and test restoring it).
2. PocketBase does not use traditional API keys. Use an existing superuser email and password, stored as `POCKETBASE_SUPERUSER_EMAIL` and `POCKETBASE_SUPERUSER_PASSWORD` in Portainer's environment/secrets UI, never in a checked-in file. The app also accepts `POCKETBASE_SUPERUSER_TOKEN` when you deliberately provide a valid superuser token, but email/password is the durable option here.
3. Configure the other values from `.env.production.example` in Portainer. Use a unique, randomly generated editor password and serve the public site over HTTPS.
4. Build the Astro app, deploy the stack, and first verify the public pages plus authenticated `/log` still work.
5. From an admin shell on the Docker host, dry-run and then lock every non-system collection:

```sh
POCKETBASE_URL=http://127.0.0.1:8090 POCKETBASE_SUPERUSER_EMAIL='…' POCKETBASE_SUPERUSER_PASSWORD='…' npm run pocketbase:lock
POCKETBASE_URL=http://127.0.0.1:8090 POCKETBASE_SUPERUSER_EMAIL='…' POCKETBASE_SUPERUSER_PASSWORD='…' npm run pocketbase:lock -- --apply
```

If PocketBase is already removed from host port publishing, run the script from the Astro container or a temporary container on `bargain_hunt_internal`, using `http://pocketbase:8090`.

6. Confirm that `https://your-site/api/collections/episodes/records` now returns `403` without an Authorization header and that `http://host:8090/_/` is unreachable.

## Editor-account options

The implemented option is appropriate for one or a few trusted editors: HTTP Basic auth at `/log`, with PocketBase completely private. It has little operational overhead, but all editors share one password.

For independent audit trails, replace Basic auth with a PocketBase `users` auth collection and application sessions, then use per-user rules such as `@request.auth.role = "editor"`. Keep direct PocketBase private and let Astro act as the backend-for-frontend. For an organisation with SSO/MFA requirements, put an identity-aware reverse proxy (Authentik, Authelia, Cloudflare Access, or a corporate OIDC proxy) in front of `/log`; keep the same private PocketBase network.

Do not rely on CORS, a hidden URL, or Portainer port mappings as authorization: they do not protect direct PocketBase API writes. Rotate the API key and editor password on staff/device changes, pin image versions, enable PocketBase rate limits, and review container logs/backups regularly.
