---
name: spectrum-project-state
description: "Spectrum MVP status as of 2026-07-19 — what's built, what's verified, and the single remaining task"
metadata: 
  node_type: memory
  type: project
  originSessionId: 5849510a-abe4-479e-8e82-c768da9070f5
  modified: 2026-07-19T20:54:08.741Z
---

Spectrum (github.com/tartale/spectrum) full MVP was built 2026-07-19 in one push per the approved plan; architecture decisions are recorded as a comment on issue #1. Commits are local on `main` and NOT pushed (user has not asked to push). Stack: Expo SDK 57 monorepo (`apps/mobile`), `packages/shared` (RuleBasedScorer behind a `MatchScorer` interface for later ML), `packages/db-tests` (PGlite harness applying the real `supabase/migrations` with RLS enforced via `set role authenticated`), Supabase backend. All 21 tests, typecheck, and lint green; Expo web bundles.

The one remaining task (#8, in_progress): run the app against a real `supabase start` stack and walk the E2E flow in a browser — blocked in the container by missing Docker; user may install Docker or run the stack on their host. Then `pnpm db:seed` creates admin@example.com + three families (password `spectrum-dev-1234`).

Gotchas encoded in the schema: profile columns role/verification_status/location are protected by a `guard_profile_columns` trigger — trusted server-side updates must set the transaction-local `spectrum.system_update` flag or run with `auth.uid()` null (service role). Other-family data is only reachable through security-definer RPCs (`nearby_families`, `my_matches`, `my_conversations`, `express_interest`, `review_verification`), never direct table reads. See [[spectrum-sandbox-environment]] for container tooling quirks.
