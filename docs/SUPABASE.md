# Running Kaya's database on Supabase

Kaya's API stays on Render (it's an always-on server with a background
scheduler); only the Postgres database moves to Supabase.

## 1. Create the project
1. supabase.com -> New project. Pick the region closest to your Render service
   (Frankfurt `eu-central-1` if Render is in Frankfurt).
2. Choose a database password made of **letters and numbers only** (avoids
   URL-encoding problems) and keep it somewhere safe.

## 2. Get the connection string (use the *Session pooler*)
Project -> **Connect** -> **Session pooler**. It looks like:

    postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres

Do **not** use the "Direct connection": it is IPv6-only unless you buy the
IPv4 add-on, and Render can't reach it. Do **not** use the Transaction pooler
(port 6543): Kaya relies on session-level behaviour.

Paste in your real password, then add `?sslmode=no-verify` at the end.

## 3. Set these on the Render service (Environment tab)
| Key | Value |
|---|---|
| `DATABASE_ADMIN_URL` | the string from step 2, with `?sslmode=no-verify` |
| `DB_POOL_MAX` | `8` |
| `DB_ADMIN_POOL_MAX` | `3` |

Leave `APP_DB_PASSWORD` as it is. Save and let Render redeploy. On boot the
setup script creates the restricted `kaya_app` role, builds the tables, applies
row-level security and seeds the demo data. Watch the Logs for
`Verified: all known fixups are in place.`

## 4. Turn off Supabase's public Data API
Project Settings -> **Data API** -> disable it. Kaya never uses it, and the
setup script also revokes the `anon` / `authenticated` roles' access to our
tables as a second layer.

## Notes
- `sslmode=no-verify` encrypts the connection but does not check the server
  certificate. For full verification, download Supabase's CA certificate and
  switch to `sslmode=verify-full` with `NODE_EXTRA_CA_CERTS`.
- Free projects pause after a week of inactivity and have no automatic
  backups. Use the Pro plan for paying customers.
- Existing data on Render's Postgres is not copied across automatically. For
  demo data nothing is needed: an empty database is reseeded on first boot.
