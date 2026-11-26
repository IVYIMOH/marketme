# marketme (NatuVara)

A photography marketplace with a public gallery, photographer submissions, admin moderation, and Lightning invoice payments.

The frontend uses **Next.js 15, React 19, and TypeScript**. The backend uses **Supabase Postgres, Auth, Storage, row-level security, and Edge Functions**. Payments integrate with LNbits.

## Requirements

- Node.js 22.x and npm.
- Docker Engine or Docker Desktop, installed and running.
- Internet access for the initial dependency and Supabase container downloads.

The root lockfile installs Supabase CLI 3.1.0. Run the commands below from the repository root; the CLI commands use that installed version.

## Run locally

### 1. Install dependencies and start Supabase

```bash
npm ci
npm --prefix frontend ci
npm run db:start
npx --no-install supabase migration up
```

The local startup script creates a Docker network that binds published ports to loopback and disables raw gateway request logs. Use it each time you start the project.

The root package provides the Supabase CLI and forwards frontend scripts. The frontend has its own package and lockfile, so both dependency installs are required. The migration command applies pending migrations to the local stack.

### 2. Configure the frontend

For first-time setup:

```bash
cp frontend/.env.example frontend/.env.local
```

If `frontend/.env.local` already exists, update it instead of overwriting it. Set these variables in that ignored file:

| Variable | Local setting |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The local Supabase anon key; enter it yourself. |

To find the local anon key, run this command in your own terminal and keep its credential output private:

```bash
npx --no-install supabase status
```

Use the anon key for the browser client. Service-role keys and other server secrets must stay out of `NEXT_PUBLIC_*` variables and source control. The active frontend reads `frontend/.env.local`; restart the frontend after changing it.

### 3. Start the frontend

```bash
npm run dev
```

Open **http://127.0.0.1:3000**. Keep Supabase running while using the app.

Development writes to `frontend/.next-dev`; production builds and `npm start` use `frontend/.next`. This keeps a production build from overwriting a running development server's cache.

| Local service | Address |
| --- | --- |
| App | http://127.0.0.1:3000 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| Development email inbox | http://127.0.0.1:54324 |
| Postgres | `127.0.0.1:54322` |

Email confirmation is enabled. Development confirmation emails appear in the local inbox.

### 4. Populate the gallery (optional)

After starting Supabase and applying migrations:

```bash
node scripts/seed-local-gallery.mjs --dry-run
node scripts/seed-local-gallery.mjs
```

This adds ten attributed sample previews to the local gallery. Samples are free previews with no purchasable originals and do not need LNbits. The seed checks existing content before adding missing rows and objects. See [sample attribution and verification](supabase/samples/README.md).

### Stop the project

Press `Ctrl+C` in the frontend terminal. To stop Supabase while retaining local data:

```bash
npx --no-install supabase stop
```

For a later session, start Supabase again, apply any pending migrations, and run `npm run dev`.

## Run a production build locally

With the frontend environment configured and local Supabase running:

```bash
npm run build
npm --prefix frontend run start
```

The app is served on port 3000. Stop the development server before starting this server on the same port.

## Local database changes

Migrations live in `supabase/migrations/`. Apply pending migrations to an existing local stack with:

```bash
npx --no-install supabase migration up
```

Supabase CLI 3.1.0 defaults this command to local. The root `db:up` script still contains the older `--local` flag; use the command above with this CLI version.

`npm run db:reset` rebuilds the local database from migrations and removes local database data. Sample previews are populated separately by the sample seed script.

## Checks

Run the existing frontend redirect tests, sample unit tests, and production build:

```bash
node --experimental-strip-types frontend/tests/authRedirect.test.mjs
node --experimental-strip-types --test frontend/tests/landingPhotos.test.mjs
node --test scripts/seed-local-gallery.test.mjs scripts/sample-invoice.test.mjs
npm run build
```

With local Supabase running and migrations applied, run the photographer onboarding authorization tests:

```bash
npx --no-install supabase test db --network-id marketme-loopback supabase/tests/photographer_onboarding.test.sql
```

These 18 database checks create synthetic users and profiles inside a transaction and roll them back. The root `npm test` command is still a placeholder; use the explicit commands above.

## Authentication status

Email signup and sign-in, confirmation resend, photographer profile completion, and destinations for buyers, photographers, and admins are implemented. Photographer company information is private. Database permissions protect account roles, ownership, and photographer verification fields.

### Google sign-in

The buyer and photographer sign-in pages show **Continue with Google** when Google is enabled in the connected Supabase Auth project.

1. In Google Cloud, configure the OAuth consent screen and create an OAuth client of type **Web application**. For local development, add `http://127.0.0.1:54321/auth/v1/callback` to **Authorized redirect URIs**. For a hosted project, use the callback URL shown on the Google provider page in Supabase.
2. For local development, put the following settings in the ignored `supabase/.env` file and replace the placeholders with the Google client credentials. Run `npx --no-install supabase stop` and `npm run db:start` to apply the settings.

   ```dotenv
   SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED=true
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<your Google client ID>
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<your Google client secret>
   ```

3. For a hosted deployment, enable **Google** under Supabase **Authentication → Sign In / Providers** and enter the client ID and secret there. Under **URL Configuration**, set the Site URL to the app origin and add `https://<your-app-domain>/auth/callback**` to the redirect allowlist so the requested page and photographer onboarding context survive the redirect.

Open `/auth/login` or `/photographer/login` and choose **Continue with Google**. If the Google consent screen is in testing mode, use an account listed as a test user.

### Admin access

For the current temporary admin setup, the verified account designated in the bootstrap migration receives the admin role through `20261118010000_temporary_admin_email.sql`. Use its existing password at `/auth/login`; a fresh sign-in opens `/admin`. The rule also handles future email verification and removes this temporary grant if that account changes email. The backend checks the stored role for moderation.

Verify the temporary admin rule with `npx --no-install supabase test db --network-id marketme-loopback supabase/tests/temporary_admin.test.sql`. The checks use temporary users and submissions inside a rolled-back transaction.

Authentication notes:

- OAuth uses PKCE. Complete sign-in in the browser where it started. Password recovery uses a single-use email code. For hosted Auth, install the checked-in recovery email template under Authentication → Email Templates → Reset password.
- LAN authentication is unverified. Access from another device needs a browser-reachable `NEXT_PUBLIC_SUPABASE_URL`, matching Supabase auth/redirect URLs, and Next.js development origin configuration.

## Privacy and security operations

The public policy is at `/privacy`. Set the server-side `PRIVACY_CONTACT_EMAIL` before building if you have a public privacy mailbox. Signed-in users can file access or deletion requests. Review `public.privacy_requests` through a trusted admin connection, confirm identity using the registered email, and deliver data privately. For deletion, locate the user's Storage objects before deleting their account, review any purchases and required financial records, remove eligible objects and account data, then close the request. Supabase Auth account deletion alone does not remove uploaded files.

If a previously shared webhook secret or a real LNbits key was logged in another environment, rotate that credential there and remove retained log copies.

The app has no timed purge for account records. The operator sets retention, backup access and expiry in the deployment. Keep a record of completed deletions so restoring a backup does not reinstate deleted accounts. Review the hosting and gateway log settings for query strings, authorization headers, signed links and request bodies before exposing a production deployment.

Run `python3 scripts/check-secrets.py --local` with local Supabase running to check reachable Git history, working files, project logs and browser output against credential patterns and configured private values. The scanner reports locations only. See [security verification](docs/security-verification.md) for findings and limits.

## Optional payment services

Browsing sample photos does not require payment configuration. Purchases of ordinary media require LNbits and the local Edge Functions.

Create an ignored `supabase/functions/.env.local` file with `LNBITS_URL` and the LNbits invoice-only `LNBITS_API_KEY`. Set `LNBITS_AMOUNT_UNIT=msat` if the payment status endpoint reports millisatoshis (the default is `sat`). Set `APP_ORIGINS` to the comma-separated browser origins that may call payment functions in your deployment. For optional background callbacks, set `LNBITS_WEBHOOK_URL` to a trusted relay that adds `Authorization: Bearer <LNBITS_WEBHOOK_SECRET>` on the server. Keep credentials out of the URL. Buyer polling works without a relay. The LNbits URL must be reachable from the Edge Function container. Keep these values out of the frontend and source control.

In a separate terminal, with Supabase running:

```bash
npx --no-install supabase functions serve --network-id marketme-loopback --env-file supabase/functions/.env.local
```

The local CLI supplies the functions' Supabase credentials. JWT verification settings for each function are in `supabase/config.toml`. See the [local security audit](docs/local-security-audit.md) for the recorded checks and remaining upload/payment limitations.

## Repository layout

- `frontend/`: Next.js pages, components, API helpers, and frontend tests.
- `supabase/migrations/`: Database schema, policies, grants, and functions.
- `supabase/functions/`: Invoice creation, payment checks, and the LNbits webhook.
- `supabase/samples/` and `scripts/`: Attributed gallery previews, local seeding, and verification.
- `docs/`: Security findings and review follow-ups.

References: [Supabase local development](https://supabase.com/docs/guides/local-development/overview), [Supabase CLI](https://supabase.com/docs/reference/cli/introduction), and [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables).
