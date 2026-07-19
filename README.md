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

## Alternate Apps

Other services also help neurodivergent kids and their families connect, and may be a good fit depending on what you're looking for:

- [Friendometry](https://friendometry.com/) — connects parents of children (ages 2–17) with autism, ADHD, or anxiety to arrange in-person friendships. Location-based browsing and search, available on iOS and Android ($24.99/year).
- [Making Authentic Friendships](https://www.cnn.com/2020/02/22/health/special-needs-friends-app-trnd) — matches people based on diagnosis and general location (zip code), with users across many states and countries.
- [ASD PlayDate](https://appadvice.com/app/asd-playdate/1189768278) — matches children with ASD as playmates using communication skills, play preferences, and demographics.
- [Hiki](https://apps.apple.com/us/app/hiki-autism-adhd-nd-dating/id1466184914) — a friendship and dating community for neurodivergent teens and adults (a different audience than parent-arranged playdates).

Spectrum's focus within this space: document-verified membership, a no-photos privacy model, trigger-aware compatibility scoring with explainable confidence, and messaging that opens only on mutual interest.

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
