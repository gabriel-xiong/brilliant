# Brilliant Probability agent guide

This repo is a Vite + React + TypeScript app for an interactive probability lesson. Treat it as a course-first learning product: the default user flow should land on the course page, with profile/auth as supporting surfaces.

## Project commands

- Install deps: `npm install`
- Run app: `npm run dev`
- Build check: `npm run build`
- Firebase CLI: `npm run firebase -- <args>`
- Firebase login: `npm run firebase:login`
- Firebase emulators: `npm run firebase:emulators`
- Deploy: `npm run firebase:deploy`
- Seed Firestore: `npm run seed:firestore`

Run `npm run build` after code changes unless the change is docs-only.

## Firebase context

- Firebase project: `sandboxapp-fd40a`
- Config files: `firebase.json`, `.firebaserc`, `firestore.rules`
- Client setup lives in `src/firebase.ts`.
- Admin/seed setup lives in `scripts/seed-firestore.mjs`.
- Do not commit service account keys or local secrets.
- If Firebase auth fails with `auth/configuration-not-found`, the likely fix is enabling the provider in the Firebase Console, not only changing code.

Installed Firebase skills that may be useful after restarting Codex:

- `firebase-basics`
- `firebase-auth-basics`
- `firebase-hosting-basics`
- `firebase-security-rules-auditor`

## Product and UX direction

- Keep probability explanations intuitive and concrete before introducing formulas.
- Prefer learner-facing language like “expected” and “observed” over jargon.
- Interactive labs should make the experiment visible before the user clicks anything.
- Use short, relevant feedback. Incorrect feedback should guide the concept without revealing the answer.
- Preserve the course-first route; profile should be reachable from the course page and should route back home.
- Progress/mastery labels should be understandable and should explain the threshold for mastery.

## UI preferences

- Avoid clunky controls, cramped wrapping, and stale-looking default UI.
- Keep number styling visually consistent with nearby text.
- Buttons should feel aligned, compact, and intentional.
- Lesson cards should fit comfortably on screen without feeling oversized.
- When editing layout, check both the coin lab and wheel lab for parallel polish.

## Development guardrails

- Use `apply_patch` for file edits.
- Prefer `rg` for searching.
- Preserve unrelated user changes in the working tree.
- Do not run destructive git commands unless explicitly requested.
- Avoid broad dependency upgrades unless the user asks.
- If adding tests, prefer Vitest + Testing Library for components and Playwright for end-to-end lesson/auth flows.
