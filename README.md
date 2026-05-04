# Bulwark

Wildfire-hardening retrofit operations platform for residential properties in Oregon's WUI zones.

## Repo layout

- `demo/` — interactive static demo of the product (deployed to Netlify)
- `agents/wireframes/` — source HTML wireframes for screens
- `boilerplate/` — agentic dashboard boilerplate
- `docs/` — BRD, tech spec, style guide, UX context

## Demo

The `demo/` folder is a static site (no build step). It is deployed automatically by Netlify
via the root `netlify.toml`.

Local preview:

```powershell
cd demo
python -m http.server 8000
# open http://localhost:8000/login.html
```

Access is gated by a soft client-side login (presenter-shared credentials).
