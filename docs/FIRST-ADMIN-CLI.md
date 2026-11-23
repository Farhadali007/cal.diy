# First-admin provisioning CLI (VOICERO Calendar)

One-time CLI provisioning of the platform admin account. Founder decision
2026-11-23: no public signup window, no hardcoded passwords, no reusable
seeded credentials.

## Why a CLI, not the setup wizard

The web setup wizard (`POST /api/auth/setup`) only runs when zero users
exist. The dev install already holds test users, so the wizard can never
provision the real platform admin. This CLI is the replacement path.

## What it does

```
npx tsx apps/web/scripts/create-first-admin.ts \
  --email admin@voicero.io --name "VOICERO Admin" --username voicero-admin \
  [--webapp-url http://127.0.0.1:3300] [--quiet]
```

Or via the package script: `yarn create-first-admin --email ... --name ... --username ...`

1. **One-time gate.** Refuses (exit 1) if any user already carries the
   `voicero-first-admin-cli` metadata marker, if the email is taken, or if
   the username is taken at platform scope. Test users and fixture admins
   do not block it, and it cannot create a second admin.
2. **Creates the admin** with the same fields as the setup wizard
   (`ADMIN` role, verified email, `CAL` identity provider, `WEBAPP`
   creation source) — but **no password row**.
3. **Creates a single-use password-setup request** (6-hour expiry, same as
   `PASSWORD_RESET_EXPIRY_HOURS`) and prints the setup URL **once**:
   `<webapp-url>/auth/forgot-password/<request-id>`.
4. The operator opens the link and sets the admin password through the
   standard reset flow. The link expires on use.

No password is ever generated, shown, or stored. "Forces change on first
login" holds by construction: the account has no usable password until the
operator sets one through the single-use link.

## Running it against the dev install (no rebuild needed)

The script imports the generated Prisma client directly (the repo's client
is generated to `packages/prisma/generated/prisma`, so `@prisma/client`'s
default entry is un-generated and throws at runtime — the CLI follows the
same import `packages/prisma/index.ts` uses). Compile it in the sandbox —
tsc follows the import and emits the generated client tree alongside it —
and run the output inside the web container, which already has the Prisma
runtime (`@prisma/client/runtime/*`) and `DATABASE_URL`:

```bash
# in the fork checkout (sandbox)
npx tsc apps/web/scripts/create-first-admin.ts \
  --module commonjs --target es2022 --moduleResolution node \
  --esModuleInterop --skipLibCheck --outDir /tmp/first-admin
docker cp /tmp/first-admin root@VPS:/tmp/first-admin   # then on the VPS:
docker cp /tmp/first-admin/. voicero-caldev-calcom:/calcom/scripts-voicero/
docker exec voicero-caldev-calcom node \
  /calcom/scripts-voicero/apps/web/scripts/create-first-admin.js \
  --email admin@voicero.io --name "VOICERO Admin" --username voicero-admin \
  --webapp-url http://127.0.0.1:3300 --quiet
```

`--quiet` prints only `SETUP_URL=<url>`, for scripted use. The URL is a
credential-equivalent for 6 hours: capture it in a variable, never log it,
never record it in any file or report.

## If the link expires

The admin account still exists (without a password). Submit the admin
email at `/auth/forgot-password`: the reset-request row is created even
though no email is sent on installs without a mail provider. An operator
with database access can then read the new request id and build the URL:

```sql
SELECT id, expires FROM "ResetPasswordRequest"
WHERE email = 'admin@voicero.io' AND expires > now()
ORDER BY "createdAt" DESC LIMIT 1;
```

## If the command refuses ("already provisioned")

The first admin already exists. Log in with the existing admin account,
or use the forgot-password flow above to set a new password for it. There
is no supported way to run this command twice; that is the point.

## Files

- `packages/features/auth/lib/createFirstAdmin.ts` — the provisioning
  service (gate, create, reset request).
- `packages/features/auth/lib/createFirstAdmin.test.ts` — vitest spec
  (gate refusals, validation, creation fields, 6h expiry, URL shape).
- `apps/web/scripts/create-first-admin.ts` — the thin CLI (argv parsing,
  printing, exit codes).
