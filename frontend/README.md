# frontend

2D canvas renderer + admin console. Not implemented yet — see `docs/spec.md` (root of
the repo) for the full design: stack recommendation (§3), model-configuration console
(§4), data model to render (§5), animation vocabulary (§6), sound (§8).

Once real, `npm run build` should produce a static build directory (`dist/` expected by
`.github/workflows/pages.yml` — update that workflow if the actual output path differs)
suitable for both the GitHub Pages public demo and local/Docker self-hosting.
