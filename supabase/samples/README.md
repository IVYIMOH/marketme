# Local sample gallery

These ten JPEG previews are CC BY 2.0 photographs by Geoff Gallice. Each image's original source, author, license URL and SHA-256 are recorded in [manifest.json](manifest.json). The manifest is also the source for gallery attribution. The prepared images were re-encoded as JPEG, resized to fit within 1600 × 1600 without enlargement, and stripped of EXIF, XMP, IPTC and ICC metadata. Originals are not included or uploaded.

From the repository root, after installing the root and frontend dependencies and starting local Supabase:

```sh
./node_modules/.bin/supabase migration up --local
node scripts/seed-local-gallery.mjs --dry-run
node scripts/seed-local-gallery.mjs
```

The script reads credentials only from this project's local CLI status. It does not load `.env` files or accept a supplied service key. Non-loopback API URLs in `--url`, exported Supabase URL variables, or CLI output are rejected. All fetches refuse redirects. Do not export the legacy remote `VITE_SUPABASE_URL` when running this script.

The existing `media` bucket must remain private. The seed creates ten approved `is_sample` rows with no photographer account and uploads only `samples/previews/*.jpg`. Original keys use `samples/unavailable-originals/` and intentionally have no objects. Sample prices are zero, the sample marker is immutable, and both the invoice endpoint and database reject sample payments.

Reruns verify existing row fields and downloaded preview hashes, then create only missing records and objects. Conflicting content is never overwritten. Failed uploads/inserts can leave matching previews behind; rerunning completes the batch. The script does not delete unrelated data or manage auth users.

Verification commands:

```sh
node --test scripts/seed-local-gallery.test.mjs scripts/sample-invoice.test.mjs
node scripts/verify-local-samples.mjs
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -f supabase/tests/gallery_samples.sql
npm run build
```

The integration verifier creates one temporary confirmed local buyer, uses it to check all ten sample invoice rejections, and deletes it in `finally`. It sends no confirmation email. The SQL checks roll back their entire transaction. Neither check requires LNbits or a real invoice.
