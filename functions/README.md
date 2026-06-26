# AI proxy - Cloud Functions

> **Legacy / unused.** This Cloud Function has been superseded by the Vercel
> serverless function at `api/aiGenerate.ts` (the Firebase Blaze plan is not
> available). Firebase Hosting, Auth, and Firestore still run on the free Spark
> plan; only this compute moved. Kept here for reference. See
> `VERCEL_DEPLOY.md` at the repo root for the current deploy steps.


Server-side AI proxy for **Phase 2: AI Features**. Exposes one HTTPS callable,
`aiGenerate`, that builds task-specific prompts on the server and forwards them
to an OpenAI-compatible Chat Completions endpoint. The API key never reaches the
client.

## Callable contract

```ts
// Client (src/, owned by another agent) calls:
const aiGenerate = httpsCallable(functions, "aiGenerate");
const res = await aiGenerate({ task, payload });
// res.data === { text: string }
```

- `task`: one of `'explainWrong' | 'workedSolution' | 'remediation' | 'recap' | 'conceptAnother' | 'rephrase'`
- `payload`: a structured object (e.g. `{ question, concept, correctAnswer, userAnswer, choices, explanation }`).
  Only the fields relevant to the task are used; the server builds the prompt - raw text is never blindly forwarded.
- Response: `{ text: string }`

For `explainWrong` and `workedSolution`, `payload.correctAnswer` is the
ground-truth answer from the app's deterministic engine. The prompts instruct
the model to treat it as authoritative and never assert a different final
number.

## Configuration (env / secret)

| Name          | Kind             | Required | Default                      |
| ------------- | ---------------- | -------- | ---------------------------- |
| `AI_API_KEY`  | secret           | yes      | -                            |
| `AI_BASE_URL` | env var          | no       | `https://api.openai.com/v1`  |
| `AI_MODEL`    | env var          | no       | `gpt-4o-mini`                |

### Set the secret (required)

```bash
firebase functions:secrets:set AI_API_KEY
# paste the key when prompted; it is stored in Google Secret Manager
```

### Set the model / base URL (optional)

These are plain (non-secret) env vars. Define them in `functions/.env` for local
dev (do NOT commit a real key there - `.env` is gitignored), or provide them in
the deploy environment. Examples:

```bash
# functions/.env  (local only, gitignored)
AI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
```

To target a different OpenAI-compatible provider, point `AI_BASE_URL` at its
`/v1` root and set `AI_MODEL` to a model it serves.

## Build

```bash
cd functions
npm install
npm run build   # tsc -> lib/
```

## Deploy

```bash
firebase deploy --only functions
```

(First deploy will prompt to grant the function access to the `AI_API_KEY`
secret.)

## Client gating

The client gates all AI calls behind `VITE_AI_ENABLED=true`. With AI off
(the default), the MVP runs unchanged and uses its deterministic fallbacks, so
deploying this function is optional for the base experience.
