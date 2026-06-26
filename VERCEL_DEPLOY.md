# Deploying the AI proxy to Vercel

The AI compute (`aiGenerate`) runs as a Vercel serverless function at
`api/aiGenerate.ts`. Firebase Hosting, Auth, and Firestore stay on the free
Spark plan — only the compute moved to Vercel (the Firebase Blaze plan is not
available). The client calls the function via `fetch` with the signed-in user's
Firebase ID token as a `Bearer` header.

## 1. Set server env vars on Vercel

In the Vercel dashboard (Project → Settings → Environment Variables), or via the
CLI, set:

| Variable                        | Required | Notes                                                            |
| ------------------------------- | -------- | ---------------------------------------------------------------- |
| `AI_API_KEY`                    | yes      | OpenAI-compatible API key (plain env var, not a Firebase secret).|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | yes      | Full service-account key JSON (single-line string).              |
| `AI_MODEL`                      | no       | Default `gpt-4o-mini`.                                            |
| `AI_BASE_URL`                   | no       | Default `https://api.openai.com/v1`.                             |
| `ALLOWED_ORIGIN`                | no       | CORS allow-origin; default `*`. Set to your Hosting origin.      |

Get `FIREBASE_SERVICE_ACCOUNT_JSON` from the Firebase Console → Project Settings
→ Service accounts → "Generate new private key" for project `sandboxapp-fd40a`.
Paste the entire downloaded JSON as the value.

## 2. Deploy

```bash
vercel          # first run links/creates the project
vercel deploy    # or `vercel --prod` for production
```

## 3. Point the client at the deployed function

Set `VITE_AI_ENDPOINT` in `.env` to the deployed URL, then rebuild:

```bash
# .env
VITE_AI_ENDPOINT=https://<project>.vercel.app/api/aiGenerate
```

```bash
npm run build
```

Deploy the rebuilt client to Firebase Hosting as usual (`npm run firebase:deploy`).

## Graceful fallback

When `VITE_AI_ENDPOINT` is blank (or the user is signed out), the client returns
`null` from every AI call and uses the deterministic generator — nothing breaks.
