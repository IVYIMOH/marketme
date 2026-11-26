# Local security verification, 26 November 2026

Scope: the NatuVara working tree, reachable Git history, production frontend build, project-owned test logs and the local Supabase stack. The hosted project, cloud backups and external log destinations were outside this review.

| Area | Evidence |
| --- | --- |
| Dependencies | npm initially reported one critical and three high findings in the frontend tree. The patched tree uses Next.js 15.5.29 and a patched PostCSS override. npm reported zero known advisories in both dependency trees after the changes. |
| Network and API | Docker inspection showed every published Supabase port bound to IPv4 loopback. Local Studio and the development inbox are included. Browser clients use a publishable or anon key for Auth, the public gallery and operations protected by row-level security. The build rejects a privileged key in the browser key setting. |
| Secrets and logs | The test payment server had logged an API key. The gateway echoed signed file tokens into Docker output. The old local test logs were sanitized and expired test JWT files removed. Local gateway request logging and analytics collection were disabled. Targeted deletion removed 219 credential-bearing log events from the local analytics store. A rescan found zero matching events. After serving fresh signed previews, scanning running project containers found zero private credential values or non-public JWTs in their output. |
| Environment files | Private environment files are ignored and existing local environment files were restricted to owner read/write. Direct requests to four private environment paths returned 404. A scan of tracked files, reachable Git history, current project logs, public assets and generated frontend output found no matching private credentials. The public Supabase browser key is intentional. |
| Authentication and authorization | The production browser test completed a simulated Google PKCE exchange and checked cancellation and destinations. A real local password session exercised onboarding, submitting a private request and signing out. The recovery form delivered a single-use code to the local inbox, changed the password, and rejected the previous password. Supabase Auth reported a 12-character minimum password, a 10-minute code lifetime, a one-minute email cooldown and reauthentication for password changes. |
| Private records and photos | The three pgTAP suites cover admin, onboarding, buyer privacy, original downloads and private requests (51 assertions). The gallery SQL checks and the local sample integration checks passed. A browser uploaded a real image, confirmed the approved preview was downscaled and verified anonymous signing of the original was denied. The legacy local photo received a separate preview. |
| Schema and builds | The production build, TypeScript checks and repository tests passed. Lint of the application’s public schema returned no findings. Full schema lint also reported warnings in installed extension functions. |

## Repeat the checks

Run from the project root with the local stack started using `npm run db:start`.

```bash
npm audit
npm --prefix frontend audit
node --experimental-strip-types --test frontend/tests/*.mjs scripts/*.test.mjs
npm run build
python3 scripts/check-secrets.py --local
npx --no-install supabase db lint --schema public --level warning
npx --no-install supabase test db --network-id marketme-loopback supabase/tests/photographer_onboarding.test.sql supabase/tests/temporary_admin.test.sql supabase/tests/privacy_boundaries.test.sql
docker exec -i supabase_db_marketme psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/gallery_samples.sql
node scripts/verify-local-samples.mjs
```

The final two checks require the seeded gallery. `node scripts/backfill-local-previews.mjs` regenerates missing legacy previews on the local project. The private original remains intact. Previously issued signed links remain usable until expiry.

## Deployment and privacy

Apply the migrations, deploy the frontend and Edge Functions, and configure the hosted Auth settings and email templates. Review existing ordinary listings for legacy previews before reopening a hosted gallery. Access rules for future requests cannot recall files already downloaded. For production, configure TLS, private administrative access, SMTP, and request logging that omits headers, bodies and signed URLs. The high local hourly email quota is a development Mailpit setting. The production quota, MFA, CAPTCHA and backup configuration require separate verification. The existing verified-email admin bootstrap is still active.

The public policy and authenticated access/deletion request form are available at `/privacy`. The operator processes requests from `public.privacy_requests`. Confirm the public contact, retention periods, backup expiry, operator access and deletion process for the actual deployment. Historical provider or host backups may retain copies beyond a deletion from the active local log store.
