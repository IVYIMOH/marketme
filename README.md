# marketme

A marketplace app built on Supabase (Postgres + Auth), with a Vite +
vanilla JS frontend.

## Stack

- Frontend: Vite + vanilla JavaScript
- Backend: Supabase (Postgres, Auth, RLS) — no separate API server
- Auth: Supabase email/password auth, with email confirmation required

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env` with your real Supabase project URL and anon key from
**Project Settings → API** in the Supabase dashboard.

```bash
npm run dev
```

Open the URL Vite prints (defaults to `http://127.0.0.1:3000`).

## Important: email confirmation is required

Signup does **not** immediately sign you in. After creating an account,
a confirmation email is sent, and sign-in is refused
(`"Email not confirmed"`) until that link is clicked. This is real
hosted project behavior (`mailer_autoconfirm: false`), not a bug — don't
"fix" it by trying to sign in with a fresh unconfirmed account, and
don't be surprised when a fresh signup can't sign in right away.

Supabase's built-in email sending is rate-limited (roughly 2/hour) and
may restrict delivery to addresses associated with the project's own
team. For local testing, use the same email as your Supabase account
login to avoid silent non-delivery.

## Database changes

Schema changes are managed as Supabase migrations in
`supabase/migrations/`. To apply pending migrations to the hosted
project:

```bash
npx supabase db push --dry-run   # review first
npx supabase db push             # apply
```

## Security model

`profiles.role` (`buyer` / `photographer` / `admin`) is intentionally
**not** writable by ordinary users, even on their own row — enforced at
the Postgres column-privilege level, not just RLS (see
`supabase/migrations/20260826215258_harden_profiles_rls.sql`). The only
legitimate way to change a role is the `set_profile_role()` function,
callable only by an existing admin.
