# VOICERO Cal.diy dev install — task 1.7 (committed in the fork)

Dev-install Compose + env for the guarded VPS A first build, authored
2026-11-22 from the upstream tree at baseline
`ae027bb70e694e2d2c44569f398d6cbcee0389b1` and committed at the fork root
after the CVE patches (tasks 1.3/1.4).

## Files (all at the fork root)

| File | Purpose |
|---|---|
| `docker-compose.dev.yml` | Guarded dev stack: Postgres + Redis + web + API v2 (+ profile-gated Prisma Studio) |
| `.env.dev.example` | Env template (placeholders only — no real secrets) |
| `pre-build-check.sh` | Guard-9 pre-build checklist, run on VPS A before every build |
| `validate-dev-install.py` | Guard validator (run from the fork root; must sit beside the compose file) |
| `DOCKER-DEV-INSTALL.md` | This procedure |

## Status

**COMMITTED 2026-11-22.** The substance of 1.7 is done and validated
(see Validation below); the files live at the fork root. Nothing here
was run on VPS A and no image was built: 1.8 (bring-up) is the next
step.

## What changed vs the upstream stock compose

Upstream `docker-compose.yml` at the baseline binds `3000:3000` on all
interfaces, uses untagged `postgres` / `redis:latest`, hardcodes
example DB credentials (`unicorn_user` / `magical_password`), uses
fixed container names (`database`, `redis`) on a network called
`stack`, and puts no resource caps anywhere. The dev file fixes all of
that per IMPLEMENTATION-PLAN.md §C:

- Ports remapped to verified-free loopback ports, never `0.0.0.0`:
  web `127.0.0.1:3300:3000`, API v2 `127.0.0.1:3301:80`, Redis
  `127.0.0.1:6381:6379`, Studio `127.0.0.1:5555:5555`; Postgres
  publishes **no** host port (internal-only; `5434` stays reserved
  if a loopback PG port is ever needed).
- Caps on every service (guard 1–2): web 2g / 1.5 CPU, PG 1g / 0.5,
  Redis 256m / 0.25, API v2 1g / 0.5, Studio 512m / 0.25.
- Pinned tags (guard 7): `postgres:16-alpine`, `redis:7-alpine`
  (Postgres ≥ 13 required; 16 is the conservative pick). Web/API
  images build from source — no published Cal.diy tags exist.
- Own project `voicero-caldev`, own network, project-prefixed
  container/volume names (guard 6).
- `logging.max-size 10m / max-file 3` on every container (guard 8).
- DB credentials come from `.env.dev` with fail-fast `${VAR:?}`
  interpolation — no hardcoded passwords anywhere.
- `MAX_OLD_SPACE_SIZE=4096` build arg (guard 3, down from 6144).
- `NEXT_PUBLIC_DISABLE_SIGNUP=true` baked into the web build and the
  runtime env; no seed service, no seed env var — the dev DB starts
  empty.
- Studio is profile-gated (`--profile tools`), never started by
  default.
- No Stripe keys, no `CALCOM_LICENSE_KEY`, no Google OAuth values:
  billing is dead EE debris (task 1.11) and calendar wiring is
  Phase 2 (task 2.8). Nothing is improvised here.
- Healthchecks (`pg_isready`, `redis-cli ping`) gate the web/API
  startup order.

## Procedure (task 1.8, for the bring-up run)

On VPS A, in the fork checkout, with `.env.dev` created from the
template (secrets via the approved flow only):

1. `cp .env.dev.example .env.dev` and fill the secrets via the approved
   flow only (never commit `.env.dev`; `.gitignore` covers it via
   `.env.*`, with `!.env.dev.example` excepting the template).
2. `./pre-build-check.sh` — abort on any FAIL; confirm manually that
   no Ashemail/VOICERO deploy is in flight.
3. `docker compose -f docker-compose.dev.yml up -d database redis`
   (build-time DB must be reachable; see step 4).
4. Capped builds on the compose network so `database` resolves
   (guard 3; `docker compose build` has no memory flag, so build
   explicitly):
   ```sh
   NET=$(docker network ls --filter name=voicero-caldev --format '{{.Name}}' | head -1)
   docker build --memory 8g --cpus 2.5 --network "$NET" \
     --build-arg MAX_OLD_SPACE_SIZE=4096 \
     --build-arg DATABASE_URL="postgresql://<user>:<password>@database:5432/calendso" \
     --build-arg DATABASE_DIRECT_URL="postgresql://<user>:<password>@database:5432/calendso" \
     --build-arg NEXT_PUBLIC_WEBAPP_URL=http://127.0.0.1:3300 \
     --build-arg NEXT_PUBLIC_API_V2_URL=http://127.0.0.1:3301/api/v2 \
     --build-arg NEXT_PUBLIC_DISABLE_SIGNUP=true \
     --build-arg CALCOM_TELEMETRY_DISABLED=1 \
     --build-arg NEXTAUTH_SECRET="<from .env.dev>" \
     --build-arg CALENDSO_ENCRYPTION_KEY="<from .env.dev>" \
     -t voicero-caldev-calcom:dev .
   docker build --memory 8g --cpus 2.5 --network "$NET" \
     --build-arg DATABASE_URL="postgresql://<user>:<password>@database:5432/calendso" \
     --build-arg DATABASE_DIRECT_URL="postgresql://<user>:<password>@database:5432/calendso" \
     -f apps/api/v2/Dockerfile -t voicero-caldev-calcom-api:dev .
   ```
   Never substitute a production `DATABASE_URL` here (guard R9).
   Never run these builds during a deploy or inside 03:30–04:30 /
   05:20–05:35 UTC (guard 4).
5. `docker compose -f docker-compose.dev.yml up -d` (web + API v2).
6. Verify: `curl http://127.0.0.1:3300` and the API v2 health
   endpoint respond; `docker compose ps` shows all healthy.

## Open items for 1.8 (not decided here)

- **First admin user with signup disabled.** With
  `NEXT_PUBLIC_DISABLE_SIGNUP=true` and no seed, there is no
  documented first-login path yet. Options at bring-up: create the
  admin via Prisma/CLI, or briefly allow signup for the first admin
  and then disable it. Decide + record at 1.8; do not silently
  re-enable public signup.

## Validation (this run, sandbox)

- `docker` is not installed in the sandbox, so `docker compose
  config` could not run here — it must be run on VPS A at 1.8
  before first use (noted as a 1.8 step, not claimed as done).
- Instead validated with `validate-dev-install.py` (kept in this
  directory): YAML parses; every service has the exact guard 1–2
  caps; every published port is `127.0.0.1`-bound; no `0.0.0.0`;
  no untagged `postgres` / `redis:latest`; no hardcoded example
  credentials; no seed service; signup disabled in compose + env;
  Studio is profile-gated; all names/networks project-prefixed.
- `pre-build-check.sh`: `bash -n` clean; function-level tests pass
  (both branches); full run in the sandbox correctly FAILS the RAM
  check (sandbox has ~6 GB < 8 GB) — the guard trips as designed.
- Secret scan: no real secrets in any file (only `CHANGE-ME-*`
  placeholders); no `.env` values printed anywhere in this run.
