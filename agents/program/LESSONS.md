# Lessons (append-only; cite the WP)

Generalizable things we learned while executing the program. One short paragraph each.
Repo-historical lessons from earlier waves live in `agents/handoffs/` and the session memory
`/memories/repo/lessons.md`; the most important are restated here so every agent sees them.

- **(L01-S2) Enforce at the boundary where bytes land, not where intent is declared.** Presigned PUT cannot bind body length; `finalize` must HEAD the object and enforce size/type. Same principle for any re-fetched resource.
- **(L01-S3) Classify asset columns before guarding them.** Placeholder-URL guards belong only on storage-key/http paths; inline `data:` finals (avatar, signatures) are intentional.
- **(2026-07-07) Never store a raw Promise in `useState` on the server.** Use `onServerPrefetch`/awaited `useAsyncData`, or SSR devalue will crash on the page with the least async work.
- **(2026-07-07) Export `BULWARK_BACKEND=real` in the invoking shell**, not just `webServer.env`, or Playwright parallelizes against one Postgres and ~70% of specs fail for the wrong reason.
- **(2026-09-17, program setup) Design return is partial by nature.** Treat the design system as the critical path (it was complete) and gate screen WPs on their individual SPECs, not on whole packets — otherwise phase 0–2 would have waited on packets C–J for no reason.
- **(2026-09-17, codegraph) Regex-based indexing is fine for a map, but prefer exact-then-dynamic route matching** — `[^/]+` happily matched `/admin/properties/new` for `/admin/properties/:id`. Escape `[id]` in globs before turning them into regexes.
