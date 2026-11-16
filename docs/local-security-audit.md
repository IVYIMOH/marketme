# Local security audit — 2026-11-16

The local `marketme` gallery contains ten attributed sample previews. Samples are not purchasable and do not require synthetic seller accounts. No remote Supabase project was read or modified.

## Verified

| Check | Result |
| --- | --- |
| Profile column permissions | Anonymous `SELECT role` and `SELECT *` fail with PostgreSQL `42501`; anonymous `id, display_name, created_at` succeeds. Authenticated role reads are also denied. The existing Supabase Auth admin grant remains intact. |
| Role metadata tampering | Previously verified `role: admin` and `app_role: admin` inputs resolve to buyer; this result was supplied at the start of the fresh audit and was not rerun. |
| Storage | The sole bucket, `media`, remains private. All ten approved sample previews can be anonymously signed; direct public URLs fail. The reserved original keys have no uploaded objects and cannot be signed. |
| Image bytes | All ten served previews match the checked-in manifest SHA-256 values. Previews are at most 1600 pixels on either side and contain no EXIF, XMP, IPTC or ICC metadata. |
| Sample purchases | All ten authenticated invoice requests return HTTP 409 with `Sample images are not for sale`; no payments are created. A unit check also rejects a mock sample with a positive price before provider access. The database independently rejects sample payments. |
| Sample integrity | Client roles cannot write sample/attribution columns. Database checks require attribution, zero price and distinct preview/original keys; the sample marker cannot be changed after insert. Ordinary media still requires a photographer. |
| Remote seed refusal | Remote CLI arguments and exported URL variables are rejected before credential or network access. A remote URL returned by CLI status is rejected before requests. Fetches refuse redirects. |
| Idempotence | First seed: 10 objects and 10 rows created. Second seed: 0 objects and 0 rows created. |
| Frontend secrets | Application source and generated bundles expose only the public Supabase URL/anon key. No detected service-role, secret, JWT signing or S3 secret values are present. |
| Escaped rendering | Component checks cover titles, category/location/lens, photographer names and error text. Fresh-browser checks cover gallery/detail sample metadata, including injected script/image markup and unsafe attribution URL schemes. |
| Frontend validation | Production build and TypeScript checks pass. A fresh browser loads all ten images and shows attribution and sample labels with no purchase controls on sample detail pages. |

The three profile-permission migrations dated November 13, 14 and 16 are retained together so the recorded local migration history is reproducible. The final state is restrictive. `20261116010000_gallery_samples.sql` adds the sample schema and payment guards.

## Cleanup

The two pre-existing `profile-audit-*@local.test` users, their two audit media rows, two `profile-read-check.png` storage objects, and related photographer/profile records were removed after exact identity checks. The integration verifier's temporary buyer was also deleted. Ivy's original account was preserved.

Final inventory verified directly in PostgreSQL: one original auth user/profile, zero photographer records, ten sample media rows, ten matching preview objects, zero payments, and zero leftover test users or test objects. No sample originals were uploaded. A final scan of frontend source and production output found zero matches for local server credential values.

## Remaining findings

These are existing application/configuration gaps; the sample seed does not resolve them:

- Ordinary uploads still send original bytes unchanged and default `preview_key` to `storage_key`. An approved ordinary image's original can therefore be exposed as its preview. A separate processing pipeline is still required for ordinary uploads.
- CAPTCHA is disabled in configuration and runtime, and frontend auth forms have no CAPTCHA integration.
- Local SMTP uses Mailpit (`supabase_inbucket_marketme:1025`); production SMTP is not configured. Email confirmation is enabled.
- `config.toml` specifies two emails/hour, while the running local Auth container reports `GOTRUE_RATE_LIMIT_EMAIL_SENT=360000`. Runtime OTP/verification limits are 30 and token refresh is 150. Repository `sign_in_sign_ups=30` has no matching explicit variable in the inspected runtime environment. This was a configuration audit, not a load test or a hosted-project audit.
- The resend interval is 1 second, minimum password length is 6, no password complexity is required, secure password change is disabled, and TOTP/phone MFA is disabled in configuration.
- Two pre-existing public wildlife assets, `leopard.jpg` and `roller.jpg`, contain EXIF artist/copyright fields (and basic resolution fields for leopard), with no GPS. Those assets were left unchanged.
- Existing gallery developer-facing copy remains deferred under `docs/review-followups.md`.

See [sample setup and verification](../supabase/samples/README.md) for reproducible commands. Secret values and test credentials are not stored in this report.
