---
name: spectrum-sandbox-environment
description: "Tooling quirks of the spectrum /workspace container — corepack pnpm, no Docker, gh auth via CS_GITHUB_TOKEN env var"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5849510a-abe4-479e-8e82-c768da9070f5
  modified: 2026-07-19T20:48:35.829Z
---

In the spectrum workspace container (as of 2026-07-19): no global `pnpm` — invoke as `corepack pnpm …` (plain `pnpm` and scripts that spawn `pnpm` fail with ENOENT; `expo install`/`expo lint` auto-install hit this, so add packages with `corepack pnpm add` using versions from `expo/bundledNativeModules.json`). No Docker, so `supabase start` cannot run — schema/RLS testing is done with the PGlite harness in `packages/db-tests`. GitHub auth: no `gh auth login`; use `GH_TOKEN=$CS_GITHUB_TOKEN gh …` (the env var is populated in the session; `.env` only references it). Repo-local git identity was set to tartale/tartalework@gmail.com. Expo reads env from `apps/mobile/.env`, which is a symlink to the root `.env`.
