/**
 * Server-side AI proxy for the Brilliant probability-learning app.
 *
 * Exposes ONE HTTPS callable function: `aiGenerate`.
 * The API key never leaves the server: it is read from the `AI_API_KEY`
 * Firebase secret at runtime and forwarded to an OpenAI-compatible
 * Chat Completions endpoint via `fetch`.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, CallableRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

initializeApp();

// --- Configuration (provider-agnostic, OpenAI-compatible) ------------------
// Secret: bound to the function below. Set via:
//   firebase functions:secrets:set AI_API_KEY
const AI_API_KEY = defineSecret("AI_API_KEY");

// Non-secret config, read from process.env at runtime (with sane defaults).
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

const MAX_TOKENS = 400;
const TEMPERATURE = 0.4;
const UPSTREAM_TIMEOUT_MS = 20_000;

// Problem generation needs more room for JSON (params + a full scenario) and a
// touch more variety than tutoring prose.
const GENERATE_MAX_TOKENS = 600;
const GENERATE_TEMPERATURE = 0.8;
// How many times the model may re-propose before we signal "use the fallback".
const MAX_GENERATION_ATTEMPTS = 3;

// Abuse protection: cap the size of the structured payload we accept.
const MAX_PAYLOAD_CHARS = 8_000;

// --- Per-user rate limiting (Phase 0) --------------------------------------
// Paid generation must be protected. We meter calls per signed-in UID with a
// Firestore-backed fixed-window counter (`rateLimits/{uid}`): a per-minute cap
// to blunt bursts and a per-day cap to bound daily spend. Tune as needed.
const RATE_LIMIT_PER_MINUTE = 20;
const RATE_LIMIT_PER_DAY = 500;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

// --- Task contract ---------------------------------------------------------
const ALLOWED_TASKS = [
  "explainWrong",
  "workedSolution",
  "remediation",
  "recap",
  "conceptAnother",
  "rephrase",
  "generateProblem",
] as const;

type Task = (typeof ALLOWED_TASKS)[number];

/** Prose tasks go through `buildPrompt`; `generateProblem` has its own path. */
type ProseTask = Exclude<Task, "generateProblem">;

interface AiGenerateRequest {
  task: string;
  payload: Record<string, unknown>;
}

interface PromptPair {
  system: string;
  user: string;
}

// --- Small helpers ---------------------------------------------------------
function asString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function clip(value: string, max = 2_000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

const BASE_SYSTEM =
  "You are a warm, concise probability tutor inside an interactive learning app. " +
  "Write in plain language a motivated beginner can follow. Be encouraging and " +
  "never condescending. Prefer intuition before notation. Keep it short: " +
  "2-5 sentences, or a tight numbered step list. Do not use Markdown headers.";

// The grounding rule shared by tasks that receive a deterministic ground-truth
// answer. The app already computed `correctAnswer`; the model must trust it.
const GROUNDING_RULE =
  "IMPORTANT: The provided correctAnswer was computed by the app's deterministic " +
  "engine and is authoritative. Treat it as correct. NEVER assert a different " +
  "final number or contradict it. Your job is only to explain or diagnose in " +
  "plain language.";

// --- Prompt builders (one per task) ----------------------------------------
function buildPrompt(task: ProseTask, payload: Record<string, unknown>): PromptPair {
  const question = clip(asString(payload.question ?? payload.prompt));
  const concept = clip(asString(payload.concept ?? payload.topic), 400);
  const correctAnswer = clip(asString(payload.correctAnswer), 400);
  const userAnswer = clip(asString(payload.userAnswer ?? payload.studentAnswer), 400);
  const choices = clip(asString(payload.choices ?? payload.options), 1_000);
  const explanation = clip(asString(payload.explanation ?? payload.context), 1_500);

  switch (task) {
    case "explainWrong":
      return {
        system: `${BASE_SYSTEM} ${GROUNDING_RULE}`,
        user:
          "A learner answered a probability question incorrectly. In 2-4 sentences, " +
          "gently diagnose the likely misconception behind their answer and point them " +
          "toward the right way to think about it. Do NOT restate the full solution.\n\n" +
          `Concept: ${concept}\n` +
          `Question: ${question}\n` +
          (choices ? `Choices: ${choices}\n` : "") +
          `Learner's answer: ${userAnswer}\n` +
          `correctAnswer (authoritative, do not change): ${correctAnswer}`,
      };

    case "workedSolution":
      return {
        system: `${BASE_SYSTEM} ${GROUNDING_RULE}`,
        user:
          "Give a short, clear worked solution as a numbered list of 2-5 steps that " +
          "leads to the given correct answer. End by stating the final answer exactly " +
          "as the provided correctAnswer.\n\n" +
          `Concept: ${concept}\n` +
          `Question: ${question}\n` +
          (choices ? `Choices: ${choices}\n` : "") +
          `correctAnswer (authoritative, must be the final answer): ${correctAnswer}`,
      };

    case "remediation":
      return {
        system: BASE_SYSTEM,
        user:
          "A learner is struggling with this concept. In 2-4 sentences, offer one " +
          "concrete tip or a simpler way to think about it, plus a tiny example. " +
          "Be encouraging and do not reveal answers to any specific quiz question.\n\n" +
          `Concept: ${concept}\n` +
          (question ? `They were working on: ${question}\n` : "") +
          (explanation ? `Extra context: ${explanation}` : ""),
      };

    case "recap":
      return {
        system: BASE_SYSTEM,
        user:
          "Write a short recap (2-4 sentences or up to 3 bullet-style lines) that " +
          "summarizes the key takeaways of this concept so the learner can lock it in.\n\n" +
          `Concept: ${concept}\n` +
          (explanation ? `Material covered: ${explanation}` : ""),
      };

    case "conceptAnother":
      return {
        system: BASE_SYSTEM,
        user:
          "Offer one fresh analogy or a different angle for understanding this concept " +
          "(2-4 sentences). Do not repeat the wording already shown to the learner.\n\n" +
          `Concept: ${concept}\n` +
          (explanation ? `Already explained as: ${explanation}` : ""),
      };

    case "rephrase":
      return {
        system: BASE_SYSTEM,
        user:
          "Rephrase the following explanation more simply and clearly for a beginner, " +
          "keeping the same meaning. Keep it to 2-4 sentences. Do not add new claims.\n\n" +
          `Concept: ${concept}\n` +
          `Text to rephrase: ${explanation || question}`,
      };

    default: {
      // Exhaustiveness guard — unreachable because callers validate first.
      const _never: never = task;
      throw new HttpsError("invalid-argument", `Unsupported task: ${String(_never)}`);
    }
  }
}

// --- Upstream call ---------------------------------------------------------
interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a strict JSON object response. */
  jsonMode?: boolean;
}

async function callChatCompletions(
  apiKey: string,
  prompt: PromptPair,
  options: ChatOptions = {},
): Promise<string> {
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  const body: Record<string, unknown> = {
    model,
    max_tokens: options.maxTokens ?? MAX_TOKENS,
    temperature: options.temperature ?? TEMPERATURE,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  };
  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    logger.error("AI upstream request failed", { error: String(err) });
    throw new HttpsError("internal", "AI service is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Log details server-side; return a safe, generic message to the client.
    const bodyText = await response.text().catch(() => "");
    logger.error("AI upstream returned non-OK status", {
      status: response.status,
      body: clip(bodyText, 500),
    });
    throw new HttpsError("internal", "AI service returned an error.");
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    logger.error("Failed to parse AI upstream response", { error: String(err) });
    throw new HttpsError("internal", "AI service returned an unreadable response.");
  }

  const text = extractText(data);
  if (!text) {
    logger.error("AI upstream response had no usable text", {
      sample: clip(asString(data), 500),
    });
    throw new HttpsError("internal", "AI service returned an empty response.");
  }
  return text;
}

function extractText(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  return typeof content === "string" ? content.trim() : "";
}

// ===========================================================================
// Per-user rate limiting (Phase 0)
// ===========================================================================

/**
 * Fixed-window per-UID rate limit backed by Firestore (`rateLimits/{uid}`).
 * Atomically resets the minute/day windows when they elapse and increments the
 * counters; throws `resource-exhausted` once either cap is hit. Applied to every
 * authenticated `aiGenerate` call before any upstream/model work happens.
 */
async function enforceRateLimit(uid: string): Promise<void> {
  const ref = getFirestore().collection("rateLimits").doc(uid);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = (snap.exists ? snap.data() : {}) as {
      minuteStart?: number;
      minuteCount?: number;
      dayStart?: number;
      dayCount?: number;
    };

    let minuteStart = typeof data.minuteStart === "number" ? data.minuteStart : 0;
    let minuteCount = typeof data.minuteCount === "number" ? data.minuteCount : 0;
    let dayStart = typeof data.dayStart === "number" ? data.dayStart : 0;
    let dayCount = typeof data.dayCount === "number" ? data.dayCount : 0;

    if (now - minuteStart >= MINUTE_MS) {
      minuteStart = now;
      minuteCount = 0;
    }
    if (now - dayStart >= DAY_MS) {
      dayStart = now;
      dayCount = 0;
    }

    if (minuteCount >= RATE_LIMIT_PER_MINUTE) {
      throw new HttpsError(
        "resource-exhausted",
        `Rate limit: max ${RATE_LIMIT_PER_MINUTE} requests/minute. Please slow down.`,
      );
    }
    if (dayCount >= RATE_LIMIT_PER_DAY) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily limit reached (${RATE_LIMIT_PER_DAY}/day). Try again tomorrow.`,
      );
    }

    tx.set(
      ref,
      { minuteStart, minuteCount: minuteCount + 1, dayStart, dayCount: dayCount + 1 },
      { merge: true },
    );
  });
}

// ===========================================================================
// Problem generation (Phase 1)
//
// The model proposes a SCENARIO + structured PARAMS for one of the 7 known
// concepts. It NEVER returns an answer: the client recomputes the authoritative
// key with its deterministic `solveConcept`. We validate well-posedness and
// prose-faithfulness here as defense-in-depth (the client re-validates too), and
// regenerate up to MAX_GENERATION_ATTEMPTS before signaling "use the fallback".
//
// The validation below is kept IN SYNC with the client copy in
// `src/services/ai/problemValidation.ts`. If you change one, change both.
//
// Phase 2 note: for out-of-scope/novel problems that do not map onto a known
// concept, the approved plan is to accept a high-confidence LLM-consensus answer
// instead. That verifier is intentionally NOT built here.
// ===========================================================================

const CONCEPTS = [
  "single-event",
  "complement",
  "and-multiply",
  "or-inclusion-exclusion",
  "conditional",
  "expected-value",
  "bayes",
] as const;
type ConceptId = (typeof CONCEPTS)[number];

interface ProblemSpec {
  conceptId: ConceptId;
  params: Record<string, number>;
  scenarioPrompt: string;
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** Mirror of the client well-posedness check (param schemas of `solveConcept`). */
function isWellPosed(conceptId: ConceptId, params: Record<string, number>): boolean {
  switch (conceptId) {
    case "single-event":
    case "complement": {
      const { favorable, total } = params;
      return isInt(total) && total > 0 && isInt(favorable) && favorable >= 0 && favorable <= total;
    }
    case "and-multiply": {
      const { favA, totA, favB, totB } = params;
      return (
        isInt(totA) && totA > 0 && isInt(favA) && favA >= 0 && favA <= totA &&
        isInt(totB) && totB > 0 && isInt(favB) && favB >= 0 && favB <= totB
      );
    }
    case "or-inclusion-exclusion": {
      const { total, countA, countB, countBoth } = params;
      if (!(isInt(total) && total > 0)) return false;
      if (!(isInt(countA) && countA >= 0 && countA <= total)) return false;
      if (!(isInt(countB) && countB >= 0 && countB <= total)) return false;
      if (!isInt(countBoth)) return false;
      const minBoth = Math.max(0, countA + countB - total);
      const maxBoth = Math.min(countA, countB);
      return countBoth >= minBoth && countBoth <= maxBoth;
    }
    case "conditional": {
      const { countB, countAandB } = params;
      return isInt(countB) && countB > 0 && isInt(countAandB) && countAandB >= 0 && countAandB <= countB;
    }
    case "expected-value": {
      const { pNum, pDen, payoffWin, payoffLose } = params;
      return (
        isInt(pDen) && pDen > 0 && isInt(pNum) && pNum >= 0 && pNum <= pDen &&
        isInt(payoffWin) && isInt(payoffLose)
      );
    }
    case "bayes": {
      const { priorH, sensitivity, falsePositive } = params;
      if (!(isInt(priorH) && priorH > 0 && priorH < 1000)) return false;
      if (!(isInt(sensitivity) && sensitivity > 0 && sensitivity <= 1000)) return false;
      if (!(isInt(falsePositive) && falsePositive >= 0 && falsePositive <= 1000)) return false;
      return sensitivity > 0 || falsePositive > 0;
    }
    default:
      return false;
  }
}

/** Values that MUST appear in the prose (bayes -> %, EV payoffs -> magnitude). */
function displayValues(conceptId: ConceptId, params: Record<string, number>): number[] {
  switch (conceptId) {
    case "single-event":
    case "complement":
      return [params.favorable, params.total];
    case "and-multiply":
      return [params.favA, params.totA, params.favB, params.totB];
    case "or-inclusion-exclusion":
      return [params.total, params.countA, params.countB, params.countBoth];
    case "conditional":
      return [params.countB, params.countAandB];
    case "expected-value":
      return [params.pNum, params.pDen, params.payoffWin, Math.abs(params.payoffLose)];
    case "bayes":
      return [params.priorH / 10, params.sensitivity / 10, params.falsePositive / 10];
    default:
      return [];
  }
}

function proseFaithful(conceptId: ConceptId, params: Record<string, number>, prose: string): boolean {
  if (!prose.trim()) return false;
  const tokens = new Set(prose.match(/-?\d+(?:\.\d+)?/g) ?? []);
  for (const value of displayValues(conceptId, params)) {
    if (!Number.isFinite(value)) return false;
    if (!tokens.has(String(value))) return false;
  }
  return true;
}

/** Plain-language param schema + magnitude guidance the model must satisfy. */
function conceptSchemaHint(conceptId: ConceptId, level: number): string {
  const big = Math.max(6, 4 + level * 3); // soft magnitude target that grows with level
  switch (conceptId) {
    case "single-event":
      return `params: { favorable, total } with total an integer near ${big} and 0 < favorable < total. Ask for P(favorable outcome).`;
    case "complement":
      return `params: { favorable, total } with total an integer near ${big} and 0 < favorable < total. Ask for the probability of the COMPLEMENT (the "not" event).`;
    case "and-multiply":
      return `params: { favA, totA, favB, totB } with each total a positive integer near ${big} and 0 < fav < tot. Two INDEPENDENT events; ask for P(A and B).`;
    case "or-inclusion-exclusion":
      return `params: { total, countA, countB, countBoth } with total near ${big}; 0 <= countA,countB <= total; and max(0, countA+countB-total) <= countBoth <= min(countA, countB). Ask for P(A or B).`;
    case "conditional":
      return `params: { countB, countAandB } with countB a positive integer near ${big} and 0 < countAandB < countB. Ask for P(A given B).`;
    case "expected-value":
      return `params: { pNum, pDen, payoffWin, payoffLose } with 0 < pNum < pDen (pDen near ${Math.max(2, Math.min(level + 2, 12))}); payoffWin a positive dollar amount; payoffLose <= 0 (a loss, shown as "lose $X"). Ask for the expected payout in dollars. Mention payoffWin as "$<payoffWin>" and the loss as "$<|payoffLose|>".`;
    case "bayes":
      return `params are PER-1000 integers: { priorH, sensitivity, falsePositive }. In the PROSE express each as a percentage = value/10 (e.g. priorH 30 -> "3%"). priorH small (rare condition, scales rarer with level), sensitivity high (e.g. 800-990), falsePositive low (e.g. 20-200). Ask for P(has condition | positive test).`;
    default:
      return "";
  }
}

function buildGenerationPrompt(conceptId: ConceptId, level: number, attempt: number): PromptPair {
  const system =
    "You are a probability problem author for an interactive learning app. You " +
    "respond ONLY with a single JSON object (no prose around it). You invent a " +
    "fresh, concrete, real-world SCENARIO and the structured numeric PARAMS for " +
    "it. You must NOT include or compute the answer — the app computes it. Keep " +
    "the scenario to 1-2 short sentences a beginner can follow.";
  const user =
    `Create one probability problem for the concept "${conceptId}" at difficulty ` +
    `level ${level} (higher = larger numbers / rarer events). ` +
    `${conceptSchemaHint(conceptId, level)}\n\n` +
    "Return JSON with EXACTLY these keys:\n" +
    `{ "conceptId": "${conceptId}", "params": { ... integers ... }, "scenarioPrompt": "the question text" }\n\n` +
    "Rules: every numeric value in params MUST appear verbatim in scenarioPrompt " +
    "(for bayes, as the percentage value/10; for expected-value, as dollar " +
    "amounts). Use integers for all params. Do NOT state the answer. " +
    (attempt > 0 ? `Previous attempt was invalid; pick different, clearly valid numbers.` : "");
  return { system, user };
}

function parseGeneratedSpec(text: string, expected: ConceptId): ProblemSpec | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;
  const scenario = record.scenarioPrompt ?? record.prompt;
  if (typeof scenario !== "string" || !scenario.trim()) return null;

  const rawParams = record.params;
  const params: Record<string, number> = {};
  if (rawParams && typeof rawParams === "object") {
    for (const [key, value] of Object.entries(rawParams as Record<string, unknown>)) {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n)) params[key] = n;
    }
  }
  // Pin to the REQUESTED concept so the client solves with the right branch.
  return { conceptId: expected, params, scenarioPrompt: scenario.trim() };
}

/**
 * Generate + validate a problem spec, retrying the model up to
 * MAX_GENERATION_ATTEMPTS. Throws `unavailable` when no valid spec is produced,
 * which the client treats as "use the deterministic fallback".
 */
async function generateProblemSpec(
  apiKey: string,
  conceptId: ConceptId,
  level: number,
): Promise<ProblemSpec> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const prompt = buildGenerationPrompt(conceptId, level, attempt);
    let text: string;
    try {
      text = await callChatCompletions(apiKey, prompt, {
        maxTokens: GENERATE_MAX_TOKENS,
        temperature: GENERATE_TEMPERATURE,
        jsonMode: true,
      });
    } catch (err) {
      logger.warn("generateProblem upstream attempt failed", { attempt, error: String(err) });
      continue;
    }
    const spec = parseGeneratedSpec(text, conceptId);
    if (spec && isWellPosed(conceptId, spec.params) && proseFaithful(conceptId, spec.params, spec.scenarioPrompt)) {
      return spec;
    }
    logger.info("generateProblem produced an invalid spec; retrying", { conceptId, attempt });
  }
  throw new HttpsError("unavailable", "Could not generate a valid problem; use fallback.");
}

// --- The callable ----------------------------------------------------------
export const aiGenerate = onCall(
  {
    secrets: [AI_API_KEY],
    enforceAppCheck: false, // App Check honored if the client sends a token; not required.
    cors: true,
  },
  async (request: CallableRequest<AiGenerateRequest>): Promise<Record<string, unknown>> => {
    // --- Phase 0: require sign-in. -----------------------------------------
    // Paid generation must never be open to the public. Firebase callables carry
    // the caller's ID token automatically when a user is signed in; we reject
    // anything without a verified `request.auth`. The client guards generation
    // behind sign-in and degrades to its deterministic generator otherwise, so
    // signed-out/anonymous learners still get the full (offline) experience.
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in to use AI features.");
    }

    const data = request.data;

    if (!data || typeof data !== "object") {
      throw new HttpsError("invalid-argument", "Request body must be an object.");
    }

    const task = data.task;
    if (typeof task !== "string" || !ALLOWED_TASKS.includes(task as Task)) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown task. Expected one of: ${ALLOWED_TASKS.join(", ")}.`,
      );
    }

    const payload = data.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw new HttpsError("invalid-argument", "`payload` must be an object.");
    }

    // Cheap abuse protection: cap the serialized payload size.
    let payloadSize = 0;
    try {
      payloadSize = JSON.stringify(payload).length;
    } catch {
      throw new HttpsError("invalid-argument", "`payload` is not serializable.");
    }
    if (payloadSize > MAX_PAYLOAD_CHARS) {
      throw new HttpsError(
        "invalid-argument",
        `payload too large (${payloadSize} chars, max ${MAX_PAYLOAD_CHARS}).`,
      );
    }

    const apiKey = AI_API_KEY.value();
    if (!apiKey) {
      logger.error("AI_API_KEY secret is not configured.");
      throw new HttpsError("internal", "AI service is not configured.");
    }

    // --- Phase 0: per-user rate limiting before any paid work. -------------
    await enforceRateLimit(uid);

    const typedPayload = payload as Record<string, unknown>;

    // --- Phase 1: structured problem generation. --------------------------
    if (task === "generateProblem") {
      const conceptId = typedPayload.conceptId;
      if (typeof conceptId !== "string" || !CONCEPTS.includes(conceptId as ConceptId)) {
        throw new HttpsError(
          "invalid-argument",
          `generateProblem requires conceptId in: ${CONCEPTS.join(", ")}.`,
        );
      }
      const levelRaw = Number(typedPayload.level);
      const level = Number.isFinite(levelRaw) ? Math.max(1, Math.min(50, Math.round(levelRaw))) : 1;
      const problem = await generateProblemSpec(apiKey, conceptId as ConceptId, level);
      return { problem };
    }

    // --- Prose tasks (explain, worked solution, recap, ...). --------------
    const prompt = buildPrompt(task as ProseTask, typedPayload);
    const text = await callChatCompletions(apiKey, prompt);
    return { text };
  },
);
