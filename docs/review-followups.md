# Review follow-ups

**POLISH — Gallery exposes developer-facing copy.**

Status: Deferred. Do not fix in the current security pass.

Source: `frontend/app/gallery/page.tsx`, lines 24–25.

Observed rendered text:

> Approved work only. Served by getMedia(), which selects the publicly granted columns and filters status='approved'.

Replace this with user-facing copy in a separately authorized polish pass.
