# Spectrum

Spectrum is a safe community app for parents of children on the autism spectrum to discover compatible playmates nearby.

## Purpose
Spectrum helps families connect through carefully curated groups and private messaging, while protecting privacy and focusing on thoughtful compatibility.

## Key Features
- Restricted membership groups
  - Membership is limited and verified
  - Proof of identity and address is required
  - Groups are organized by location for local meetups
- Privacy-first experience
  - No photos are allowed
  - Personal details stay intentional and relevant
- Compatibility-focused profiles
  - Profiles capture triggers, likes and dislikes, age, activity preferences, and distance
  - Supports planning either one-on-one or group activities
- In-app private messaging
  - Secure and direct communication inside the app

## Benefits
- Safer social connections for children and families
- Better matching through meaningful profile details
- Local friend groups that respect privacy and comfort
- Easier coordination without relying on public photo sharing

## Development

Monorepo layout: `apps/mobile` (Expo — iOS/Android/web), `packages/shared` (domain types, match scorer, geocoding), `packages/db-tests` (schema/RLS tests on in-process Postgres), `supabase/` (migrations, config, seed).

```sh
pnpm install
pnpm db:start        # local Supabase stack (requires Docker); copy keys into .env
pnpm db:seed         # seed admin + demo families (password: spectrum-dev-1234)
pnpm web             # Expo on web at http://localhost:8081
pnpm typecheck && pnpm lint && pnpm test
```

Architecture decisions are recorded on [issue #1](https://github.com/tartale/spectrum/issues/1).
