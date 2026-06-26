/**
 * AI client layer for the probability course.
 *
 * This module talks to a Firebase callable named `aiGenerate` (implemented by
 * another agent) to fetch PROSE ONLY — explanations, recaps, re-skinned
 * scenarios. It NEVER asks the model for an answer key: every numeric answer is
 * supplied by the deterministic solver (`conceptSchemas.ts`) and passed to the
 * model as ground truth.
 *
 * Hard guarantees:
 * - Works with AI turned OFF: `isAIEnabled()` gates everything.
 * - Degrades gracefully: every task function builds a deterministic fallback
 *   from its structured inputs and NEVER throws. On any failure (disabled,
 *   missing Firebase, network/timeout, malformed response) it returns the
 *   fallback with `usedAI: false`.
 *
 * No React here.
 */

import { solveConcept, generateProblem, CONCEPT_LABELS, ALL_CONCEPTS } from './conceptSchemas';
import type { ConceptId, GeneratedProblem, SolverResult } from './types';
import { validateProblemSpec } from './problemValidation';
import { cacheKey, readCachedProblem, writeCachedProblem } from './problemCache';

// ---------------------------------------------------------------------------
// Public input contracts.
// ---------------------------------------------------------------------------

/** Input for explaining why a learner's answer was wrong. */
export interface WrongAnswerInput {
  conceptId: ConceptId;
  prompt: string;
  learnerAnswer: string;
  /** OUR computed answer — ground truth the model must never contradict. */
  correctAnswer: string;
  params: Record<string, number | string>;
}

/** Input for a natural-language worked solution. */
export interface WorkedSolutionInput {
  conceptId: ConceptId;
  prompt: string;
  /** Exact solver output; the model only narrates these steps. */
  solution: SolverResult;
}

/** Input for a short remediation/review card after repeated mistakes. */
export interface RemediationInput {
  conceptId: ConceptId;
  /** Optional free-text notes about what the learner got wrong. */
  recentMistakes?: string[];
}

/** Input for an end-of-lesson recap. */
export interface RecapInput {
  lessonId: string;
  conceptIds: ConceptId[];
  /** Optional mastery label to personalize the recap tone. */
  masteryLabel?: string;
}

/** Input for re-explaining a concept "another way". */
export interface ConceptAnotherInput {
  conceptId: ConceptId;
  /** Optional concrete problem prompt to anchor the alternate explanation. */
  prompt?: string;
}

// ---------------------------------------------------------------------------
// Enablement + callable plumbing.
// ---------------------------------------------------------------------------

/**
 * Whether AI features are enabled. True only when the build-time env flag
 * `VITE_AI_ENABLED` is exactly the string 'true'. Synchronous by design.
 */
export function isAIEnabled(): boolean {
  try {
    return import.meta.env?.VITE_AI_ENABLED === 'true';
  } catch {
    return false;
  }
}

/**
 * Endpoint for the Vercel serverless AI proxy (the migrated `aiGenerate`).
 * Set `VITE_AI_ENDPOINT` to the deployed URL, e.g.
 * `https://<project>.vercel.app/api/aiGenerate`. When unset, every AI call
 * short-circuits to `null` and the deterministic generator is used.
 */
const AI_ENDPOINT: string | undefined = (() => {
  try {
    return import.meta.env?.VITE_AI_ENDPOINT || undefined;
  } catch {
    return undefined;
  }
})();

/** Default timeout for the request so the UI never hangs on the model. */
const AI_TIMEOUT_MS = 8000;

/**
 * Timeout for problem GENERATION specifically. Authoring + validating a fresh
 * scenario is slower than a prose snippet, so we allow more headroom — but still
 * bounded, so a slow model always yields to the instant deterministic fallback.
 */
const GENERATE_TIMEOUT_MS = 22000;

/** Reject a promise if it does not settle within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ai-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Maps each client task to the task name the `aiGenerate` callable accepts.
 * The server (functions/src/index.ts) uses shorter names; keeping the mapping
 * here lets the rest of this file use descriptive, self-documenting task names.
 */
const SERVER_TASK: Record<string, string> = {
  explainWrongAnswer: 'explainWrong',
  workedSolution: 'workedSolution',
  remediation: 'remediation',
  lessonRecap: 'recap',
  explainConceptAnother: 'conceptAnother',
  rephraseScenario: 'rephrase',
};

/**
 * Translate a client payload (keyed by `conceptId`/`learnerAnswer`/`prompt`)
 * into the field names the callable's prompt builders read (`concept`/
 * `userAnswer`/`question`/`explanation`). Concept ids are expanded to their
 * friendly labels so the model sees "Conditional probability", not the slug.
 * Original keys are preserved too, so the server's fallbacks still work.
 */
function adaptPayloadForServer(payload: Record<string, unknown>): Record<string, unknown> {
  const adapted: Record<string, unknown> = { ...payload };

  const conceptId = payload.conceptId;
  if (typeof conceptId === 'string') {
    adapted.concept = CONCEPT_LABELS[conceptId as ConceptId] ?? conceptId;
  }
  const conceptIds = payload.conceptIds;
  if (Array.isArray(conceptIds) && conceptIds.length) {
    adapted.concept = conceptIds.map((id) => CONCEPT_LABELS[id as ConceptId] ?? String(id)).join(', ');
  }

  if (typeof payload.prompt === 'string') adapted.question = payload.prompt;
  if (payload.learnerAnswer !== undefined) adapted.userAnswer = payload.learnerAnswer;

  // Fold structured context the server reads via `explanation`/`context`.
  const solution = payload.solution as
    | { fraction?: string; steps?: { label: string; value: string }[] }
    | undefined;
  if (solution?.steps?.length) {
    adapted.explanation = solution.steps.map((step) => `${step.label}: ${step.value}`).join('; ');
  }
  // The worked-solution task only carries the exact answer inside `solution`;
  // surface it as `correctAnswer` so the server can anchor its final line.
  if (solution?.fraction && adapted.correctAnswer === undefined) {
    adapted.correctAnswer = solution.fraction;
  }
  const recentMistakes = payload.recentMistakes;
  if (Array.isArray(recentMistakes) && recentMistakes.length) {
    adapted.explanation = `Recent mistakes: ${recentMistakes.join('; ')}`;
  }
  if (typeof payload.masteryLabel === 'string' && payload.masteryLabel) {
    adapted.context = `Learner standing: ${payload.masteryLabel}`;
  }

  return adapted;
}

/**
 * Resolve the signed-in user's Firebase ID token, or `null` when there is no
 * configured Firebase / no signed-in user. Firebase is imported lazily so this
 * file (and its tests) load even when Firebase is not configured.
 */
async function getIdToken(): Promise<string | null> {
  try {
    const { firebaseEnabled, auth } = await import('../../firebase');
    if (!firebaseEnabled || !auth) return null;
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * POST `{ task, payload }` to the Vercel `aiGenerate` endpoint with the user's
 * Firebase ID token as a Bearer header. Returns the parsed JSON body on a 2xx
 * response, or `null` on ANY failure (disabled, unconfigured endpoint, signed
 * out, network error, timeout, non-OK status, malformed JSON). Never throws.
 */
async function postAiGenerate(
  serverTask: string,
  serverPayload: Record<string, unknown>,
): Promise<unknown | null> {
  if (!isAIEnabled()) return null;
  if (!AI_ENDPOINT) return null;
  try {
    const idToken = await getIdToken();
    // Generation is gated behind sign-in (the server rejects anon calls). Skip
    // the round-trip for signed-out learners and degrade to deterministic.
    if (!idToken) return null;

    const response = await withTimeout(
      fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ task: serverTask, payload: serverPayload }),
      }),
      AI_TIMEOUT_MS,
    );

    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Call the `aiGenerate` endpoint with `{ task, payload }`.
 * Returns `{ text }` on success, or `null` on ANY failure (disabled, missing
 * Firebase, signed out, network error, timeout, malformed response). Never
 * throws.
 */
async function callAiGenerate(
  task: string,
  payload: Record<string, unknown>,
): Promise<{ text: string } | null> {
  const serverTask = SERVER_TASK[task] ?? task;
  const serverPayload = adaptPayloadForServer(payload);
  const data = await postAiGenerate(serverTask, serverPayload);
  if (data === null) return null;

  let text: string | null = null;
  if (typeof data === 'string') {
    text = data;
  } else if (data && typeof data === 'object' && 'text' in data) {
    const candidate = (data as { text?: unknown }).text;
    if (typeof candidate === 'string') text = candidate;
  }

  if (!text || !text.trim()) return null;
  return { text: text.trim() };
}

// ---------------------------------------------------------------------------
// Deterministic fallback helpers.
// ---------------------------------------------------------------------------

/** Coerce a mixed param record down to the numeric-only record the solver wants. */
function numericParams(params: Record<string, number | string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(params)) {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

/** Render solver steps as readable "label: value" lines. */
function stepLines(solution: SolverResult): string[] {
  return solution.steps.map((step) => `${step.label}: ${step.value}`);
}

/** Short, concept-specific intuition used by remediation / "another way". */
const CONCEPT_INTUITION: Record<ConceptId, string> = {
  'single-event':
    'Count the outcomes that count as a win, then divide by every equally-likely outcome. Probability is just "share of the possibilities".',
  complement:
    'Sometimes the "not" event is easier to count. Find the probability of the thing happening, then subtract from 1 to get the probability it does NOT happen.',
  'and-multiply':
    'For independent events, "and" means both must happen, so you multiply their probabilities. Each event narrows the possibilities further.',
  'or-inclusion-exclusion':
    'For "or", add the two probabilities, then subtract the overlap once so the shared outcomes are not counted twice.',
  conditional:
    'Conditioning shrinks the world to the cases where the condition is true. Count the matches inside that smaller group and divide by the group size.',
  'expected-value':
    'Expected value is the long-run average payout: multiply each outcome by its probability and add them up.',
  bayes:
    'Start with the prior, weight it by how strongly the evidence points to it, then divide by how likely that evidence was overall. A positive test on a rare condition can still be surprisingly uncertain.',
};

/**
 * A short, answer-free intuition nudge for a concept. Safe to show in-lesson
 * before a learner has revealed the answer, since it never states a number —
 * it only reframes how to think about the concept.
 */
export function conceptHint(conceptId: ConceptId): string {
  return CONCEPT_INTUITION[conceptId] ?? 'Re-read the question and identify the favorable and total outcomes.';
}

// ---------------------------------------------------------------------------
// Task functions. Each returns a deterministic fallback when AI is off/fails,
// and the model's prose (validated where needed) when it succeeds.
// ---------------------------------------------------------------------------

/**
 * Explain why a learner's answer was wrong, treating `correctAnswer` as ground
 * truth. The model is explicitly instructed never to assert a different number.
 */
export async function aiExplainWrongAnswer(
  input: WrongAnswerInput,
): Promise<{ explanation: string; usedAI: boolean }> {
  const conceptLabel = CONCEPT_LABELS[input.conceptId] ?? input.conceptId;

  // Deterministic fallback, enriched with exact solver steps when possible.
  let steps: string[] = [];
  try {
    const solution = solveConcept(input.conceptId, numericParams(input.params));
    steps = stepLines(solution);
  } catch {
    steps = [];
  }
  const fallback =
    `Not quite — you answered ${input.learnerAnswer || '(blank)'}, ` +
    `but the correct answer is ${input.correctAnswer}. ` +
    `This is a ${conceptLabel} problem. ${CONCEPT_INTUITION[input.conceptId] ?? ''}` +
    (steps.length ? `\n\nWalk through it:\n${steps.map((s) => `- ${s}`).join('\n')}` : '');

  const ai = await callAiGenerate('explainWrongAnswer', {
    conceptId: input.conceptId,
    prompt: input.prompt,
    learnerAnswer: input.learnerAnswer,
    correctAnswer: input.correctAnswer,
    params: input.params,
    groundTruthNote:
      `The correct answer is exactly ${input.correctAnswer}. Treat this as ground ` +
      `truth. Do NOT state any different numeric answer; only explain the reasoning.`,
  });

  if (ai) return { explanation: ai.text, usedAI: true };
  return { explanation: fallback.trim(), usedAI: false };
}

/**
 * Produce a step-by-step worked solution as an array of prose strings. The
 * fallback narrates the exact solver steps verbatim.
 */
export async function aiWorkedSolution(
  input: WorkedSolutionInput,
): Promise<{ steps: string[]; usedAI: boolean }> {
  const fallbackSteps = stepLines(input.solution);
  const fallback = fallbackSteps.length
    ? fallbackSteps
    : [`The answer is ${input.solution.fraction} (${input.solution.decimal}).`];

  const ai = await callAiGenerate('workedSolution', {
    conceptId: input.conceptId,
    prompt: input.prompt,
    solution: input.solution,
    groundTruthNote:
      `The exact answer is ${input.solution.fraction}. Narrate these steps in ` +
      `plain language without changing any numbers.`,
  });

  if (ai) {
    const lines = ai.text
      .split('\n')
      .map((line) => line.replace(/^[\s\-*\d.)]+/, '').trim())
      .filter((line) => line.length > 0);
    if (lines.length) return { steps: lines, usedAI: true };
  }
  return { steps: fallback, usedAI: false };
}

/**
 * Build a short remediation card (title + review prose) for a struggling
 * concept. Fallback uses the concept's built-in intuition.
 */
export async function aiRemediation(
  input: RemediationInput,
): Promise<{ title: string; review: string; usedAI: boolean }> {
  const conceptLabel = CONCEPT_LABELS[input.conceptId] ?? input.conceptId;
  const title = `Quick review: ${conceptLabel}`;
  const fallbackReview =
    `${CONCEPT_INTUITION[input.conceptId] ?? ''}` +
    (input.recentMistakes && input.recentMistakes.length
      ? `\n\nThings to watch for:\n${input.recentMistakes.map((m) => `- ${m}`).join('\n')}`
      : '');

  const ai = await callAiGenerate('remediation', {
    conceptId: input.conceptId,
    recentMistakes: input.recentMistakes ?? [],
  });

  if (ai) return { title, review: ai.text, usedAI: true };
  return { title, review: fallbackReview.trim(), usedAI: false };
}

/**
 * Generate an end-of-lesson recap. Fallback summarizes the lesson's concepts.
 */
export async function aiLessonRecap(input: RecapInput): Promise<{ recap: string; usedAI: boolean }> {
  const labels = input.conceptIds.map((id) => CONCEPT_LABELS[id] ?? id);
  const conceptsSentence = labels.length
    ? labels.join(', ')
    : 'the key ideas from this lesson';
  const fallback =
    `In this lesson you practiced ${conceptsSentence}.` +
    (input.masteryLabel ? ` Your current standing: ${input.masteryLabel}.` : '') +
    `\n\n${input.conceptIds.map((id) => `- ${CONCEPT_LABELS[id] ?? id}: ${CONCEPT_INTUITION[id] ?? ''}`).join('\n')}`;

  const ai = await callAiGenerate('lessonRecap', {
    lessonId: input.lessonId,
    conceptIds: input.conceptIds,
    masteryLabel: input.masteryLabel,
  });

  if (ai) return { recap: ai.text, usedAI: true };
  return { recap: fallback.trim(), usedAI: false };
}

/**
 * Re-explain a concept "another way". Fallback uses the alternate intuition.
 */
export async function aiExplainConceptAnother(
  input: ConceptAnotherInput,
): Promise<{ explanation: string; usedAI: boolean }> {
  const conceptLabel = CONCEPT_LABELS[input.conceptId] ?? input.conceptId;
  const fallback =
    `Another way to think about ${conceptLabel}: ${CONCEPT_INTUITION[input.conceptId] ?? ''}`;

  const ai = await callAiGenerate('explainConceptAnother', {
    conceptId: input.conceptId,
    prompt: input.prompt,
  });

  if (ai) return { explanation: ai.text, usedAI: true };
  return { explanation: fallback.trim(), usedAI: false };
}

/**
 * Re-skin a problem's scenario with a new theme while preserving EVERY number.
 * If the model's text drops any of the problem's numbers (a sign it changed the
 * setup/answer), the result is discarded and the original prompt is returned.
 */
export async function aiRephraseScenario(
  problem: GeneratedProblem,
  theme?: string,
): Promise<{ prompt: string; usedAI: boolean }> {
  const fallback = problem.prompt;

  const ai = await callAiGenerate('rephraseScenario', {
    conceptId: problem.conceptId,
    prompt: problem.prompt,
    params: problem.params,
    theme: theme ?? null,
    groundTruthNote:
      'Rewrite the story/theme only. Keep EVERY number identical so the answer ' +
      'does not change.',
  });

  if (ai && preservesNumbers(problem, ai.text)) {
    return { prompt: ai.text, usedAI: true };
  }
  return { prompt: fallback, usedAI: false };
}

/**
 * Guard for `aiRephraseScenario`: returns true only if every distinct numeric
 * param value appears as a standalone number token in the candidate text.
 */
function preservesNumbers(problem: GeneratedProblem, candidate: string): boolean {
  const tokens = candidate.match(/-?\d+(?:\.\d+)?/g) ?? [];
  const present = new Set(tokens);
  const required = new Set<number>(Object.values(problem.params).filter((v) => Number.isFinite(v)));
  for (const value of required) {
    if (!present.has(String(value))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// AI-authored problem generation (Phase 1).
//
// Core principle: the AI proposes a SCENARIO + structured PARAMS for one of the
// 7 known concepts; the deterministic `solveConcept` computes the authoritative
// answer key on the CLIENT. The AI never supplies the number, so there is no
// AI-trust issue — a bad/novel AI payload can only ever degrade to the
// deterministic generator, never to a wrong answer.
// ---------------------------------------------------------------------------

/** What the practice surface asks for: a concept at an open-ended numeric level. */
export interface GenerateProblemSpec {
  conceptId: ConceptId;
  /** Open-ended difficulty level (>= 1). */
  level: number;
  /** Variety seed; same (concept, level, seed) is reproducible + cacheable. */
  seed?: number;
}

/** Shape the `generateProblem` callable returns (prose + params, NO answer). */
interface AiProblemSpec {
  conceptId: ConceptId;
  params: Record<string, number>;
  scenarioPrompt: string;
}

/** Coerce a loose record into numeric-only params, dropping non-finite values. */
function toNumericParams(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(n)) out[key] = n;
    }
  }
  return out;
}

/**
 * Parse the callable's response into a strict `AiProblemSpec`, accepting either
 * a structured `{ problem: {...} }` / top-level object or a JSON string in
 * `{ text }`. Returns null when nothing usable can be extracted.
 */
function parseProblemSpec(data: unknown): AiProblemSpec | null {
  let obj: unknown = data;
  // Unwrap `{ text: "<json>" }` (mirrors the prose tasks' return shape).
  if (obj && typeof obj === 'object' && 'text' in obj) {
    const text = (obj as { text?: unknown }).text;
    if (typeof text === 'string') {
      try {
        obj = JSON.parse(text);
      } catch {
        return null;
      }
    }
  }
  if (obj && typeof obj === 'object' && 'problem' in obj) {
    obj = (obj as { problem?: unknown }).problem;
  }
  if (!obj || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;
  const conceptId = record.conceptId;
  const scenarioPrompt = record.scenarioPrompt ?? record.prompt;
  if (typeof conceptId !== 'string' || !ALL_CONCEPTS.includes(conceptId as ConceptId)) return null;
  if (typeof scenarioPrompt !== 'string' || !scenarioPrompt.trim()) return null;

  return {
    conceptId: conceptId as ConceptId,
    params: toNumericParams(record.params),
    scenarioPrompt: scenarioPrompt.trim(),
  };
}

/**
 * Call the `generateProblem` callable. Returns the raw spec on success or null
 * on ANY failure (disabled, missing Firebase, signed out, network, timeout,
 * unparseable). Never throws. Auth is required server-side; we also short-circuit
 * locally when there is no signed-in user so signed-out learners skip the call
 * and fall straight through to the deterministic generator.
 */
async function callGenerateProblem(spec: GenerateProblemSpec): Promise<AiProblemSpec | null> {
  if (!isAIEnabled()) return null;
  if (!AI_ENDPOINT) return null;
  try {
    const idToken = await getIdToken();
    // Generation is gated behind sign-in (the server rejects anon calls). Skip
    // the round-trip for signed-out learners and degrade to deterministic.
    if (!idToken) return null;

    const payload = {
      conceptId: spec.conceptId,
      concept: CONCEPT_LABELS[spec.conceptId] ?? spec.conceptId,
      level: Math.max(1, Math.round(spec.level)),
      seed: spec.seed ?? 1,
    };
    const response = await withTimeout(
      fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ task: 'generateProblem', payload }),
      }),
      GENERATE_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    return parseProblemSpec((await response.json()) as unknown);
  } catch {
    return null;
  }
}

/**
 * Produce a problem for `(conceptId, level, seed)`, preferring an AI-authored
 * scenario but always returning a usable, gradable problem.
 *
 * Order of preference (each step degrades gracefully to the next):
 *   1. Cache hit — a previously verified problem served instantly.
 *   2. Fresh AI generation — model authors prose + params; we VALIDATE them and
 *      compute the answer key locally with `solveConcept`, then cache it.
 *   3. Deterministic fallback — `generateProblem`, used when AI is off, the
 *      learner is signed out, generation fails/times out, or validation rejects
 *      the model's payload.
 *
 * The returned `problem.source` records which path produced the PROSE; the
 * answer key is deterministic either way. Never throws.
 */
export async function aiGenerateProblem(
  spec: GenerateProblemSpec,
): Promise<{ problem: GeneratedProblem; usedAI: boolean }> {
  const level = Math.max(1, Math.round(spec.level));
  const seed = spec.seed ?? 1;
  const conceptId = spec.conceptId;

  // The deterministic problem doubles as our fallback AND the source of
  // concept-specific display metadata (tolerance / unit / placeholder / band).
  const fallback = generateProblem(conceptId, level, seed);
  if (!isAIEnabled()) return { problem: fallback, usedAI: false };

  const key = cacheKey(conceptId, level, seed);

  // 1) Instant cache hit.
  const cached = await readCachedProblem(key);
  if (cached && cached.conceptId === conceptId) {
    return { problem: cached, usedAI: cached.source === 'ai' };
  }

  // 2) Fresh AI generation, validated + solved locally.
  const aiSpec = await callGenerateProblem({ conceptId, level, seed });
  if (aiSpec && aiSpec.conceptId === conceptId) {
    const valid = validateProblemSpec(conceptId, aiSpec.params, aiSpec.scenarioPrompt);
    if (valid.ok) {
      const solution = solveConcept(conceptId, aiSpec.params);
      const aiProblem: GeneratedProblem = {
        ...fallback,
        id: `${conceptId}-L${level}-ai-${seed}`,
        params: aiSpec.params,
        prompt: aiSpec.scenarioPrompt,
        acceptedAnswer: solution.fraction,
        acceptedDecimal: solution.decimal,
        solution,
        source: 'ai',
        confidence: 1, // Deterministic answer key — full confidence in Phase 1.
      };
      // Best-effort cache write; don't block the learner on it.
      void writeCachedProblem(key, aiProblem);
      return { problem: aiProblem, usedAI: true };
    }
  }

  // 3) Deterministic fallback (instant, always correct).
  return { problem: fallback, usedAI: false };
}
