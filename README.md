# Sermon Register

A private, self-hosted register for Lehr and Gebet services. The desktop view is a spreadsheet-style register with inline entry; the iPhone view uses a compact list and form. Data is stored in a local SQLite file and does not require a database subscription.

The current application supports creating and listing services, including reusable Songs, Texts, Vorraden, and People created while a service is saved. The complete architecture, finalized schema, staged plan, and remaining decisions are in [DESIGN.md](DESIGN.md).

## Run locally

Requirements: Node.js 22 or newer, pnpm, and Python 3.

In one terminal:

```bash
python database/server.py
```

In another terminal:

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The SQLite database is created automatically at `data/sermon-register.db` and is intentionally excluded from Git.

## Run with Docker

```bash
docker compose pull
docker compose up -d
```

Docker Compose always pulls the latest `main` image from `ghcr.io/clarencewollman-star/sermonregister:main`. The current image contains application version `0.2.1`. Open <http://localhost:3810>. The web app securely forwards database requests to SQLite inside the same container. The host directory `/docker/sermonregister/data` is mounted into the container, so database records survive image and container replacement.

The `main` image is refreshed whenever the GitHub Actions publish job succeeds on the `main` branch. If the GitHub package is private, sign in first with `docker login ghcr.io`.

If the app is opened with a server name or private IP instead of `localhost`, set `APP_ORIGIN` in `compose.yaml` to the exact browser origin, including port `3810` when used.

## GitHub container image

The workflow in `.github/workflows/docker-image.yml` builds the Docker image for pull requests. After changes reach `main`, it also publishes the image to GitHub Container Registry as:

```text
ghcr.io/clarencewollman-star/sermonregister
```

The repository's package visibility settings determine who can download that image.

## Application version

The current release is `0.2.1`. It is shown in the application header, stored in the image's OCI version label, and published as the GHCR tag `0.2.1`. `package.json` is the release-version source used by the frontend and GitHub Actions. Portainer follows the rolling `main` image tag from `compose.yaml`.

## Interface design

All application layout and control styling is based on [AdminLTE 4](https://github.com/ColorlibHQ/AdminLTE) and Bootstrap 5. AdminLTE is included locally in the Docker image; the application does not depend on a design CDN or subscription service.

## Private data and backups

These paths remain local and are not committed or copied into the image:

- `data/sermon-register.db`
- `data/uploads/`
- `data/backups/`
- `.env*`

Back up the SQLite database and uploads together. Do not expose the current application directly to the public internet: authentication, private HTTPS access, PDF handling, and automated backups are later stages documented in `DESIGN.md`.

## Verification

```bash
pnpm run build
```

The SQLite API also initializes a new database automatically from `database/schema.sql`.
