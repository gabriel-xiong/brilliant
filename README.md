# Brilliant Probability

Brilliant Probability is a Vite + React + TypeScript learning app for building probability intuition through a structured, interactive course. It emphasizes concrete experiments, direct manipulation, instant feedback, and persistent mastery tracking before introducing formulas.

## Features

- **Seven-lesson probability path:** a course-first flow from introductory probability through counting outcomes, compound events, conditional probability, mutually exclusive events, expected value, and Bayesian updating.
- **Structured progression:** lessons unlock in order, practice unlocks by completed concept, and the final exam unlocks only after the full course path is complete.
- **Mastery tracking:** learner progress is labeled as `Needs practice`, `Proficient`, or `Mastered`, with progress persisted locally and, when signed in, through Firebase Auth and Firestore.
- **Interactive, content-driven lessons:** lessons combine short explanations with simulations, direct-manipulation labs, sliders, sort/order tasks, multi-stage questions, and embedded experiments.
- **Instant hand-written feedback:** lesson questions include authored feedback and explanations designed to guide the concept without simply revealing answers.
- **Adaptive practice:** learners can choose question count, unlimited mode, adaptive or fixed difficulty, and one or more unlocked concepts. Practice tracks streaks, levels, and session summaries.
- **Generated practice scenarios:** practice can use AI-authored scenario wording when enabled, while deterministic app logic keeps the answer key authoritative.
- **AI tutoring support:** optional AI calls power answer-aware hints, worked solutions, remediation tips, lesson recaps, and alternate concept explanations, all with deterministic fallbacks.
- **Lesson recaps and review:** end-of-lesson recap dialogs summarize the learner's status, can be revisited later, and support AI-assisted re-explanation when configured.
- **Sound polish:** a lightweight app-wide click sound and sound toggle add feedback without affecting the learning flow.

## Grading And AI Safety

All grading logic is custom-built and deterministic with no AI dependency. The app uses its own concept schemas, solvers, and a tolerant numeric answer checker that accepts equivalent fractions, decimals, and percentages.

AI is used only for prose and scenario variation. The model never supplies the authoritative answer key; generated problems are validated against the deterministic solver, and every AI feature falls back safely when the endpoint is disabled, slow, or unavailable.

## Tech Stack

- React 18, TypeScript, Vite
- Material UI and Framer Motion
- Firebase Auth and Firestore for sign-in, profile, progress, lessons, and rate-limit data
- Vercel serverless function at `api/aiGenerate.ts` for optional AI proxying
- Vitest and Testing Library for unit/component tests
- Firebase Hosting support, with Vercel used for AI compute

## Getting Started

```bash
npm install
npm run dev
```

Useful commands:

- `npm run build` checks TypeScript and creates a production build.
- `npm run test` runs the Vitest test suite.
- `npm run test:watch` runs tests in watch mode.
- `npm run preview` previews the production build locally.
- `npm run seed:firestore` seeds lesson data into Firestore.
- `npm run firebase -- <args>` runs Firebase CLI commands through the project dependency.
- `npm run firebase:login`, `npm run firebase:emulators`, and `npm run firebase:deploy` cover common Firebase workflows.

## Environment

Copy `.env.example` to `.env` for local development and fill in the Vite Firebase client variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Optional client AI settings:

- `VITE_AI_ENABLED=true` enables AI affordances in the client.
- `VITE_AI_ENDPOINT=https://<project>.vercel.app/api/aiGenerate` points the client to the deployed Vercel proxy.

Server-side AI variables belong in Vercel project settings, not in the client `.env`:

- `AI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `AI_MODEL`
- `AI_BASE_URL`
- `ALLOWED_ORIGIN`

Do not commit service account keys, private API keys, or local secret files.

## Deployment

Firebase project configuration lives in `.firebaserc`, `firebase.json`, and `firestore.rules`. Client setup is in `src/firebase.ts`, and Firestore seeding is handled by `scripts/seed-firestore.mjs`.

The AI proxy runs on Vercel. See `VERCEL_DEPLOY.md` for required Vercel environment variables, deployment steps, and how to point `VITE_AI_ENDPOINT` at the deployed function.

## Future Work

- Make wrong-answer feedback even more specific to common misconceptions.
- Provide easier remediation flows after repeated mistakes.
- Verify performance and interaction comfort on low-end mobile devices.
