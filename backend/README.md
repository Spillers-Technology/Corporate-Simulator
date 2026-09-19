# backend

File-layer parser (reads any meeting-directory-shaped data source, real or demo) +
process/streaming layer (shells out to `claude -p` and `codex exec`, streams output to
the frontend). Not implemented yet — see `docs/spec.md` §3–5 for the full design,
and its Authentication subsection in §4 for how CLI sign-in should be handled (defer to
each CLI's own credential storage, never re-implement secret storage in this app).
