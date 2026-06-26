/**
 * AI client layer for the probability course.
 *
 * This module talks to the Vercel `aiGenerate` endpoint to fetch PROSE ONLY —
 * explanations, recaps, re-skinned scenarios. It NEVER asks the model for an
 * answer key: every numeric answer is supplied by the deterministic solver
 * (`conceptSchemas.ts`) and passed to the model as ground truth.
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
import { parseNumericValue } from '../answerCheck';

// ---------------------------------------------------------------------------
// Public input contracts.
// ---------------------------------------------------------------------------

/** Input for explaining why a learner's answer was wrong. */
export type WrongAnswerKind = 'numeric' | 'choice' | 'sort' | 'order';
export type HintDepth = 1 | 2 | 3;

export interface WrongAnswerInput {
  conceptId: ConceptId;
  prompt: string;
  learnerAnswer: string;
  /** OUR computed answer — ground truth the model must never contradict. */
  correctAnswer: string;
  params: Record<string, number | string>;
  /** 1 = light nudge, 2 = stronger hint, 3 = strongest answer-free hint. */
  hintDepth?: HintDepth;
  /**
   * How to compare the submitted answer. Defaults to `numeric` only when the
   * correct answer parses numerically; otherwise falls back to text choice.
   */
  answerKind?: WrongAnswerKind;
  /** Full multiple-choice context for answer-specific hinting. */
  choices?: { label: string; value: string }[];
  selectedChoice?: { label: string; value: string };
  correctChoice?: { label: string; value: string };
  incorrectFeedback?: string;
  explanation?: string;
  /** Extra lesson context that is visible to the learner around this question. */
  context?: string;
  /** Safe givens extracted from the lesson, such as total faces/trials. */
  givenFacts?: string[];
  /** Authored hints for this specific prompt, when available. */
  hints?: string[];
  /** Hint text already visible in the UI for this answer attempt. */
  previousHints?: string[];
  /** Solver-style setup guidance that may include givens but not the final answer. */
  solverHint?: string;
  /**
   * `explanation` may state the correct answer after practice feedback.
   * `nudge` is for lesson hints and should diagnose without revealing.
   */
  answerMode?: 'explanation' | 'nudge';
}

/** Input for a natural-language worked solution. */
export interface WorkedSolutionInput {
  conceptId: ConceptId;
  prompt: string;
  /** Exact solver output; the model only narrates these steps. */
  solution: SolverResult;
}

export interface WrongAnswerResult {
  explanation: string;
  usedAI: boolean;
  /** False when another progressive hint would be duplicate or non-productive. */
  hasMoreHints?: boolean;
  /** Highest useful hint depth for this answer context. */
  maxHintDepth?: HintDepth;
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
  const contextParts: string[] = [];
  const existingContext = typeof adapted.context === 'string' ? adapted.context : '';
  if (existingContext) contextParts.push(existingContext);
  if (typeof payload.context === 'string' && payload.context && payload.context !== existingContext) {
    contextParts.push(payload.context);
  }
  const givenFacts = payload.givenFacts;
  if (Array.isArray(givenFacts) && givenFacts.length) {
    contextParts.push(`Given facts: ${givenFacts.map(String).join('; ')}`);
  }
  const hints = payload.hints;
  if (Array.isArray(hints) && hints.length) {
    contextParts.push(`Authored hints: ${hints.map(String).join(' | ')}`);
  }
  const previousHints = payload.previousHints;
  if (Array.isArray(previousHints) && previousHints.length) {
    contextParts.push(`Previous visible hints: ${previousHints.map(String).join(' | ')}`);
  }
  if (typeof payload.solverHint === 'string' && payload.solverHint) {
    contextParts.push(`Solver setup hint: ${payload.solverHint}`);
  }
  if (contextParts.length) adapted.context = contextParts.join('\n');

  return adapted;
}

/**
 * Resolve the signed-in user's Firebase ID token, or `null` when there is no
 * configured Firebase / no signed-in user. Signed-out demo users can still call
 * the Vercel endpoint; the server applies a tighter anonymous rate limit.
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

function aiRequestHeaders(idToken: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return headers;
}

/**
 * POST `{ task, payload }` to the Vercel `aiGenerate` endpoint. When signed in,
 * include the user's Firebase ID token as a Bearer header; when signed out, the
 * server treats the request as anonymous demo traffic. Returns the parsed JSON
 * body on a 2xx response, or `null` on ANY failure. Never throws.
 */
async function postAiGenerate(
  serverTask: string,
  serverPayload: Record<string, unknown>,
): Promise<unknown | null> {
  if (!isAIEnabled()) return null;
  if (!AI_ENDPOINT) return null;
  try {
    const idToken = await getIdToken();
    const response = await withTimeout(
      fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: aiRequestHeaders(idToken),
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
 * endpoint, network error, timeout, malformed response). Never throws.
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

function shown(value: string, fallback = '(blank)'): string {
  return value.trim() || fallback;
}

function inferAnswerKind(input: WrongAnswerInput): WrongAnswerKind {
  if (input.answerKind) return input.answerKind;
  return parseNumericValue(input.correctAnswer) === null ? 'choice' : 'numeric';
}

function parseSortSummary(summary: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of summary.split(';')) {
    const [item, bucket] = part.split('->').map((piece) => piece?.trim());
    if (item && bucket) out[item] = bucket;
  }
  return out;
}

function parseOrderSummary(summary: string): string[] {
  return summary
    .split(';')
    .map((part) => part.trim().replace(/^\d+\.\s*/, ''))
    .filter(Boolean);
}

function compareNumericAnswer(learnerAnswer: string, correctAnswer: string): string {
  const learner = parseNumericValue(learnerAnswer);
  const correct = parseNumericValue(correctAnswer);
  const shownAnswer = shown(learnerAnswer);

  if (learner === null) {
    return `Your answer, ${shownAnswer}, is not in a numeric form I can compare yet. Rewrite it as a fraction, decimal, percent, or count, then check the setup again.`;
  }
  if (correct === null) {
    return `Your answer, ${shownAnswer}, needs to be checked against the structure of the question.`;
  }

  const delta = learner - correct;
  const close = Math.abs(delta) <= Math.max(0.01, Math.abs(correct) * 0.08);
  if (close) {
    return `Your answer, ${shownAnswer}, is close, so the issue is probably rounding, format, or one missing adjustment.`;
  }
  if (delta > 0) {
    return `Your answer, ${shownAnswer}, is too large, so you likely counted too many outcomes or missed a subtraction/conditioning step.`;
  }
  return `Your answer, ${shownAnswer}, is too small, so you likely left out some favorable cases or multiplied/conditioned one step too far.`;
}

function promptFocus(prompt: string): string {
  const bold = /\*\*([^*]+)\*\*/.exec(prompt);
  if (bold?.[1]) return bold[1].trim();
  const sentence = prompt.split(/[?.!]/).find((part) => part.trim().length > 0)?.trim();
  return sentence && sentence.length <= 140 ? sentence : 'the exact question being asked';
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
};

function numberFromToken(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const numeric = Number(token);
  if (Number.isFinite(numeric)) return numeric;
  return WORD_NUMBERS[token.toLowerCase()];
}

function combinedContext(input: WrongAnswerInput): string {
  return [
    input.prompt,
    input.context,
    input.givenFacts?.join(' '),
    input.hints?.join(' '),
    input.solverHint,
    input.explanation,
  ]
    .filter(Boolean)
    .join(' ');
}

function acceptedFraction(input: WrongAnswerInput): { numerator: number; denominator: number } | null {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(input.correctAnswer);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) return null;
  return { numerator, denominator };
}

type SingleEventRequest = 'count' | 'probability' | 'expected-count';

const DIE_SIDE_LABELS = ['1', '2', '3', '4', '5', '6'];

function stripPromptMarkup(value: string): string {
  return value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function classifySingleEventRequest(input: WrongAnswerInput): SingleEventRequest | null {
  const prompt = stripPromptMarkup(input.prompt).toLowerCase();
  if (/\b(?:expected|expect|about how many)\b/.test(prompt)) return 'expected-count';
  if (/\bhow many\b/.test(prompt) && /\b(successful|favorable|winning|target)\b/.test(prompt)) return 'count';
  if (/\b(successful|favorable|winning|target)\s+(?:outcomes?|sides?|faces?|slices?)\b/.test(prompt) && /\benter a whole number\b/.test(prompt)) return 'count';
  if (/\b(probability|chance|p\s*\()\b/.test(prompt)) return 'probability';
  return null;
}

function cleanEventPhrase(value: string): string {
  return stripPromptMarkup(value)
    .replace(/\benter\b.*$/i, '')
    .replace(/\busing that count,?\s*/i, '')
    .replace(/\bwhat is the probability of\s+/i, '')
    .replace(/\bhow many of the six die sides are successful outcomes\b/i, '')
    .replace(/[?.!,;:]+$/g, '')
    .trim();
}

function extractQuotedEvent(text: string): string | null {
  const eventMatch = /\b(?:event|target)\s+["“]([^"”]+)["”]/i.exec(text);
  if (eventMatch?.[1]) return cleanEventPhrase(eventMatch[1]);
  const anyQuoteMatch = /["“]([^"”]+)["”]/.exec(text);
  return anyQuoteMatch?.[1] ? cleanEventPhrase(anyQuoteMatch[1]) : null;
}

function extractEventPhrase(input: WrongAnswerInput): string | null {
  const prompt = stripPromptMarkup(input.prompt);
  const context = stripPromptMarkup(combinedContext(input));
  const quoted = extractQuotedEvent(prompt) ?? extractQuotedEvent(context);
  if (quoted) return quoted;

  const focus = stripPromptMarkup(promptFocus(input.prompt));
  const sources = [focus, prompt];
  for (const source of sources) {
    const probabilityMatch = /\bprobability of\s+(?:rolling|roll|landing on|land on|getting|get|spinning)\s+([^?.]+)/i.exec(source);
    if (probabilityMatch?.[1]) return cleanEventPhrase(probabilityMatch[1]);

    const eventMatch = /\b(?:rolling|roll|landing on|land on|getting|get|spinning)\s+([^?.]+)/i.exec(source);
    if (eventMatch?.[1]) return cleanEventPhrase(eventMatch[1]);
  }

  const faceMatch = /\bone specific face(?:,\s*like\s*(face\s*\d+))?/i.exec(prompt);
  if (faceMatch?.[1]) return cleanEventPhrase(faceMatch[1]);
  if (faceMatch) return 'one specific face';
  return null;
}

function dieSidesForEvent(eventPhrase: string | null): string[] {
  if (!eventPhrase) return [];
  const lower = eventPhrase.toLowerCase();

  if (/\bnot\s+(?:5\s+or\s+6|6\s+or\s+5)\b/.test(lower)) return ['1', '2', '3', '4'];
  const notSingle = /\bnot\s+([1-6])\b/.exec(lower);
  if (notSingle) return DIE_SIDE_LABELS.filter((side) => side !== notSingle[1]);
  if (/\beven\b/.test(lower)) return ['2', '4', '6'];
  if (/\bodd\b/.test(lower)) return ['1', '3', '5'];
  if (/\b(?:4\s+or\s+less|less than\s+5|at most\s+4)\b/.test(lower)) return ['1', '2', '3', '4'];
  if (/\b(?:over\s+4|greater than\s+4|more than\s+4)\b/.test(lower)) return ['5', '6'];

  const faceMatches = Array.from(lower.matchAll(/\bface\s*([1-6])\b/g)).map((match) => `Face ${match[1]}`);
  if (faceMatches.length) return Array.from(new Set(faceMatches));

  const digitMatches = Array.from(lower.matchAll(/(?<!\d)([1-6])(?!\d)/g)).map((match) => match[1]);
  if (digitMatches.length) return Array.from(new Set(digitMatches));

  if (/\bone specific face\b/.test(lower)) return ['the named face'];
  return [];
}

function eventDescription(eventPhrase: string | null, items: string[]): string {
  if (items.length > 0 && items.every((item) => /^[1-6]$/.test(item))) {
    if (items.length === 2) return `rolling either ${items[0]} or ${items[1]}`;
    return items.length === 1 ? `rolling ${items[0]}` : `rolling either ${joinList(items)}`;
  }
  if (items.length > 0 && items.every((item) => /^Face \d$/i.test(item))) {
    return `landing on ${joinList(items)}`;
  }
  return eventPhrase ? cleanEventPhrase(eventPhrase) : 'the named event';
}

function trialUnit(input: WrongAnswerInput): string {
  const text = combinedContext(input).toLowerCase();
  if (/\bspin|spinner|wheel\b/.test(text)) return 'spins';
  if (/\broll|die|dice\b/.test(text)) return 'rolls';
  if (/\bflip|coin\b/.test(text)) return 'flips';
  return 'trials';
}

function stripUiNumbering(text: string): string {
  return text.replace(/\b(?:part|step|stage|question)\s+\d+\b\.?:?/gi, '');
}

function hasSixOutcomeContext(text: string): boolean {
  return /\b(?:fair\s+)?(?:six|6)[-\s]?(?:face|faced|sided|side|sides|die|dice|outcome|outcomes|slice|slices|wedge|wedges)\b/i.test(text) ||
    /\b(?:six|6)\s+(?:equal(?:ly likely)?\s+)?(?:faces?|sides?|outcomes?|slices?|wedges?)\b/i.test(text);
}

function concreteSingleEventHint(input: WrongAnswerInput, hintDepth: 2 | 3): string | null {
  const request = classifySingleEventRequest(input);
  if (!request) return null;

  const eventPhrase = extractEventPhrase(input);
  const items = dieSidesForEvent(eventPhrase);
  const itemList = joinList(items);
  const eventText = eventDescription(eventPhrase, items);
  const { favorable, total, trials } = inferSingleEventGivens(input);
  const totalText = Number.isFinite(total) && total ? `${total}` : 'all';
  const unit = trialUnit(input);

  if (request === 'count') {
    if (items.length > 0) {
      return hintDepth === 2
        ? `The event is ${eventText}. The successful die sides are ${itemList}.`
        : `Count the named successful die sides: ${itemList}. Enter that count as a whole number.`;
    }
    return hintDepth === 2
      ? 'The answer should be a count of successful outcomes, not a probability.'
      : 'Count only the outcomes that make the named event happen, then enter that count as a whole number.';
  }

  if (request === 'probability') {
    if (items.length === 1 && /^Face \d$/i.test(items[0]) && totalText === '6') {
      return hintDepth === 2
        ? `${items[0]} is the 1 favorable face. The total equally likely faces are 1 through 6.`
        : `${items[0]} is 1 favorable face out of the 6 total equally likely faces. Write favorable faces over total faces.`;
    }
    if (items.length > 0 && totalText === '6') {
      return hintDepth === 2
        ? `The event is ${eventText}. On a six-sided die, the successful sides are ${itemList}; the total equally likely sides are 1 through 6.`
        : `Use the successful die sides named by the event, ${itemList}, over the total die sides, 1 through 6. Write successful sides over total sides.`;
    }
    if (Number.isFinite(favorable) && Number.isFinite(total) && total && total > 0) {
      return hintDepth === 2
        ? `There ${favorable === 1 ? 'is' : 'are'} ${favorable} favorable ${favorable === 1 ? 'outcome' : 'outcomes'} out of ${total} equally likely outcomes.`
        : `Write the one-trial probability as favorable outcomes over all ${total} equally likely outcomes.`;
    }
    return hintDepth === 2
      ? `The event is ${eventText}. Count its successful outcomes and compare them with the total equally likely outcomes.`
      : 'Write the probability as successful outcomes over total equally likely outcomes.';
  }

  if (request === 'expected-count') {
    if (items.length === 1 && /^Face \d$/i.test(items[0]) && Number.isFinite(total) && total && Number.isFinite(trials)) {
      return hintDepth === 2
        ? `${items[0]} is the 1 favorable face out of ${total} total equally likely faces.`
        : `First write the one-trial probability using ${items[0]} as the 1 favorable face out of ${total} total faces. Then multiply by ${trials} ${unit}.`;
    }
    if (items.length > 0 && Number.isFinite(total) && total && Number.isFinite(trials)) {
      return hintDepth === 2
        ? `Each trial is successful when it is ${eventText}; use those successful outcomes out of ${total} equally likely outcomes first.`
        : `First write the one-trial probability using ${itemList} as the successful ${items.length === 1 ? 'outcome' : 'outcomes'} out of ${totalText}. Then multiply by ${trials} trials/spins.`;
    }
    if (Number.isFinite(favorable) && Number.isFinite(total) && total && Number.isFinite(trials)) {
      return hintDepth === 2
        ? `Each trial has ${favorable} favorable ${favorable === 1 ? 'outcome' : 'outcomes'} out of ${total} equally likely outcomes.`
        : `Write the one-trial probability as ${favorable} favorable ${favorable === 1 ? 'outcome' : 'outcomes'} over ${total} total equally likely outcomes, then multiply by ${trials} trials/spins.`;
    }
  }

  return null;
}

function inferSingleEventGivens(input: WrongAnswerInput): { favorable?: number; total?: number; trials?: number } {
  const params = numericParams(input.params);
  const rawText = combinedContext(input);
  const text = stripUiNumbering(rawText);
  const lower = text.toLowerCase();
  const givens: { favorable?: number; total?: number; trials?: number } = {};
  const hasParamTotal = Number.isFinite(params.total);

  if (Number.isFinite(params.favorable)) givens.favorable = params.favorable;
  if (hasParamTotal) givens.total = params.total;

  const outOfMatch = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:\w+\s+){0,4}out of\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/i.exec(text);
  if (outOfMatch) {
    givens.favorable ??= numberFromToken(outOfMatch[1]);
    givens.total ??= numberFromToken(outOfMatch[2]);
  }

  const totalMatch =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:equal(?:ly likely)?\s+)?(?:faces?|slices?|sides?|outcomes?|wedges?)\b/i.exec(text) ??
    /\bfair\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)[-\s]?(?:face|sided|slice|side|outcome|wedge)/i.exec(text);
  if (totalMatch) givens.total ??= numberFromToken(totalMatch[1]);

  const countMatch =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:specific\s+)?(?:favorable|successful|target|winning|matching)?\s*(?:faces?|slices?|sides?|outcomes?|wedges?)\b/i.exec(text);
  if (countMatch && /specific|target|favorable|successful|winning|matching|one\s+(?:face|slice|side|outcome|wedge)/i.test(countMatch[0])) {
    givens.favorable ??= numberFromToken(countMatch[1]);
  }
  if (givens.favorable === undefined && /\bone\s+specific\s+(?:face|slice|side|outcome|wedge)\b/i.test(lower)) {
    givens.favorable = 1;
  }
  if (givens.favorable === undefined && /\bonly\s+one\s+(?:face|slice|side|outcome|wedge)\b/i.test(lower)) {
    givens.favorable = 1;
  }

  const fraction = acceptedFraction(input);
  if (fraction && classifySingleEventRequest(input) === 'probability') {
    givens.favorable ??= fraction.numerator;
    givens.total ??= fraction.denominator;
  }

  if (!hasParamTotal && hasSixOutcomeContext(rawText)) {
    givens.total = 6;
  }

  const trialMatch =
    /\b(?:out of|over|in|for)\s+(\d+)\s+(?:spins?|rolls?|flips?|trials?|draws?|plays?|balls?)\b/i.exec(text) ??
    /\b(\d+)\s+(?:spins?|rolls?|flips?|trials?|draws?|plays?|balls?|times)\b/i.exec(text);
  let trials = trialMatch ? Number(trialMatch[1]) : undefined;
  if (!trialMatch && /\b(expected|expect|about how many)\b/i.test(text)) {
    const outOfCounts = Array.from(text.matchAll(/\bout of\s+(\d+)\b/gi))
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value));
    trials = outOfCounts.length ? Math.max(...outOfCounts) : undefined;
  }
  if (trials !== undefined) givens.trials = trials;

  return givens;
}

function singleEventWalkthrough(input: WrongAnswerInput): string {
  const concrete = concreteSingleEventHint(input, 3);
  if (concrete) return concrete;

  const { favorable, total, trials } = inferSingleEventGivens(input);
  if (Number.isFinite(favorable) && Number.isFinite(total) && total && total > 0) {
    const trialText = Number.isFinite(trials)
      ? ` Then multiply that probability by the number of trials: ${trials} trials/spins.`
      : '';
    return `Use the given counts: there ${favorable === 1 ? 'is' : 'are'} ${favorable} favorable ${favorable === 1 ? 'outcome' : 'outcomes'} and ${total} total equally likely outcomes, so the one-trial probability is favorable over total.${trialText}`;
  }

  return 'Write the one-trial probability as favorable outcomes over all equally likely outcomes. If the question asks for an expected count, multiply that probability by the number of trials.';
}

type ChoiceMisconception =
  | 'impossible-vs-unlikely'
  | 'overdiagnose-unfair'
  | 'observed-vs-true'
  | 'equal-likelihood'
  | 'impossible-next'
  | 'always-same'
  | 'ignore-base-rate';

function selectedChoiceText(input: WrongAnswerInput): string {
  return [
    input.selectedChoice?.label,
    input.selectedChoice?.value,
    input.learnerAnswer,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function concreteChoiceFactHint(input: WrongAnswerInput, hintDepth: HintDepth): string | null {
  const selected = selectedChoiceText(input);
  const prompt = stripPromptMarkup(combinedContext(input)).toLowerCase();

  if (/\b(no outcomes?|empty|none)\b/.test(selected) && /\b(?:greater than|over)\s+4\b/.test(selected + ' ' + prompt)) {
    if (hintDepth === 3) {
      return 'For A or B, keep outcomes that satisfy either condition. Since greater than 4 means 5 or 6, those outcomes are part of B and cannot be treated as empty.';
    }
    if (hintDepth === 2) {
      return 'List the six die sides before judging the option: 5 and 6 both satisfy "greater than 4," so that event is not empty.';
    }
    return 'Greater than 4 does have outcomes on a six-sided die: 5 and 6. This option removes outcomes that are actually possible.';
  }

  if (/\b(impossible|no outcomes?|empty|none)\b/.test(selected) && /\beven\b/.test(selected + ' ' + prompt)) {
    return 'Even numbers are possible on a six-sided die: 2, 4, and 6. This option removes outcomes that are actually possible.';
  }

  if (/\bexactly\s+one\b/.test(selected) && /\bor\b/.test(prompt)) {
    if (hintDepth === 3) {
      return 'For A or B, include outcomes in A, in B, or in both. If one side satisfies both events, it still belongs in the union.';
    }
    if (hintDepth === 2) {
      return 'For an "or" event, check whether any outcome satisfies both events. Overlap still counts unless the prompt explicitly asks for exactly one.';
    }
    return 'In probability, A or B includes overlap unless the prompt says exactly one. A side that satisfies both events still counts for A or B.';
  }

  if (/\b(unfair|broken|rigged|biased|must be)\b/.test(selected)) {
    if (hintDepth > 1) return null;
    return 'That choice turns limited evidence into a diagnosis. A short run or one surprising result can happen without proving the die or wheel changed.';
  }

  if (/\b(permanent|permanently|changed|true probability|actual probability|now\s+\d+\s*\/\s*\d+|observed)\b/.test(selected)) {
    return 'That choice treats one observed result as a new true probability. The long-run chance comes from the setup, not from the latest sample alone.';
  }

  if (/\b(equal|equally likely|same chance|every .* equally|no matter what)\b/.test(selected)) {
    return 'Equal sides mean each single side has the same chance, not that every event has the same chance. The event with more matching sides is more likely.';
  }

  if (/\b(always|same mix|reset|no matter what)\b/.test(selected)) {
    return 'That choice assumes the setup resets. If the prompt removes, conditions on, or changes the group, the next chance has to use the group that remains.';
  }

  if (/\b(impossible|never|cannot|can't)\b/.test(selected)) {
    return 'That choice says the outcome cannot happen. If the outcome is still in the list of possible outcomes, it is possible.';
  }

  return null;
}

function classifyChoiceMisconception(input: WrongAnswerInput): ChoiceMisconception | null {
  const text = selectedChoiceText(input);

  if (/\b(impossible|never|cannot|can't)\b/.test(text)) {
    if (/\bnext\b/.test(text)) return 'impossible-next';
    return 'impossible-vs-unlikely';
  }
  if (/\b(unfair|broken|rigged|biased|must be)\b/.test(text)) return 'overdiagnose-unfair';
  if (/\b(permanent|permanently|changed|true probability|actual probability|now\s+\d+\s*\/\s*\d+|observed)\b/.test(text)) return 'observed-vs-true';
  if (/\b(equal|equally likely|same chance|every .* equally|no matter what)\b/.test(text)) return 'equal-likelihood';
  if (/\b(always|same mix|reset|no matter what)\b/.test(text)) return 'always-same';
  if (/\b(ignore|ignored|healthy|base rate|rare)\b/.test(text)) return 'ignore-base-rate';

  return null;
}

function misconceptionChoiceHint(input: WrongAnswerInput): string | null {
  const hintDepth = input.hintDepth ?? 1;
  const concrete = concreteChoiceFactHint(input, hintDepth);
  if (concrete) return concrete;

  const misconception = classifyChoiceMisconception(input);
  if (!misconception) return null;

  const focus = promptFocus(input.prompt);

  const sequences: Record<ChoiceMisconception, [string, string, string]> = {
    'impossible-vs-unlikely': [
      'This choice treats a surprising result as impossible. Random outcomes can miss the expected count in a short run.',
      `For "${focus}", ask whether the result is forbidden or just a low-but-possible wobble around the long-run chance.`,
      `A short run can land below expectation, so a claim that the outcome cannot happen is too strong. The supported reasoning allows random variation and asks for more evidence before diagnosing anything.`,
    ],
    'overdiagnose-unfair': [
      'This choice jumps from one short result to a broken or unfair setup. A small sample can look lopsided even when the true chance has not changed.',
      `Check how much limited evidence "${focus}" really gives. One gap from expected is not enough by itself to diagnose whether the die or wheel changed.`,
      `One short run is limited evidence and can wobble. The supported reasoning separates that result from real evidence that the long-run probability changed or the die or wheel changed.`,
    ],
    'observed-vs-true': [
      'This choice confuses what happened in one run with the true probability. Observed frequency can be 6/60 without becoming the real chance.',
      `Use "${focus}" to separate observed count from expected long-run chance: the sample result is evidence, not a permanent reset of the probability.`,
      `The latest sample fraction is an observation that can wobble, not a new rule for future spins. The long-run probability still comes from the setup.`,
    ],
    'equal-likelihood': [
      'This choice leans on equal likelihood in the wrong place. Equal outcomes matter only inside the current group you are counting.',
      `Re-read "${focus}" and ask what group is being counted now; if the setup changed the group, the old equal-likelihood shortcut may not apply unchanged.`,
      `Equal likelihood only applies to the individual outcomes in the current denominator. The reasoning has to respect the actual group left by the prompt.`,
    ],
    'impossible-next': [
      'This choice turns a changed chance into impossibility. Removing or observing one outcome can lower a chance without making the next event impossible.',
      `For "${focus}", count what remains. If any target outcomes remain, the chance is not zero.`,
      `If target outcomes still remain, the next target can still happen. Use the remaining target count over the remaining total instead.`,
    ],
    'always-same': [
      'This choice assumes the setup resets automatically. That only works when the trial is replaced or the group truly stays the same.',
      `Check "${focus}" for whether something was removed, conditioned on, or otherwise changed before the next probability is asked.`,
      `If something was removed or conditioned on, the group changed. The reasoning has to recompute from the group the prompt says is actually left.`,
    ],
    'ignore-base-rate': [
      'This choice throws away one of the counted groups. For updated probabilities, false alarms or base rates can be part of the denominator.',
      `In "${focus}", ask who belongs in the group you are conditioning on; do not remove cases just because they are inconvenient.`,
      `The denominator is everyone who produced the evidence, including false positives or base-rate cases when the prompt includes them.`,
    ],
  };

  const [light, stronger, strongest] = sequences[misconception];
  if (hintDepth === 1) return light;
  if (hintDepth === 2) {
    const authored = input.incorrectFeedback?.trim();
    return [stronger, authored && !authored.includes(input.correctAnswer) ? authored : '']
      .filter(Boolean)
      .join(' ');
  }
  return strongest;
}

function contrastiveChoiceHint(input: WrongAnswerInput, answerMode: WrongAnswerInput['answerMode']): string {
  const selected = input.selectedChoice?.label ?? input.learnerAnswer;
  const selectedValue = input.selectedChoice?.value;
  const choiceCount = input.choices?.length ?? 0;
  const hintDepth = input.hintDepth ?? 1;

  if (answerMode !== 'nudge') {
    return `Your choice says: "${shown(selected, 'your selected choice')}". The accepted choice is "${shown(input.correctAnswer)}", so compare the key claim in each option against the setup.`;
  }

  const misconceptionHint = misconceptionChoiceHint(input);
  if (misconceptionHint) return misconceptionHint;

  if (hintDepth === 1) {
    return `Your selected option says "${shown(selected, 'your selected choice')}". Check that claim against the concrete outcomes named in the question.`;
  }

  if (hintDepth === 2) {
    const authored = input.incorrectFeedback?.trim();
    return [
      'Point to the exact outcome or count in the setup that would have to exist for that claim to be true.',
      authored && !authored.includes(input.correctAnswer) ? authored : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const otherChoices = choiceCount > 1 ? `There are ${choiceCount} choices; keep a choice only if its claim matches the outcomes named in the setup.` : '';
  return [
    'Use this test: match the option to the visible outcomes first, then reject it if it adds a count, missing case, or certainty the setup does not support.',
    selectedValue ? `Check the value "${selectedValue}" against that same test.` : '',
    otherChoices || 'Keep the option that directly addresses the prompt without adding a conflicting claim.',
  ]
    .filter(Boolean)
    .join(' ');
}

function compareSortAnswer(learnerAnswer: string, correctAnswer: string, answerMode: WrongAnswerInput['answerMode']): string {
  const learner = parseSortSummary(learnerAnswer);
  const correct = parseSortSummary(correctAnswer);
  const mismatch = Object.keys(correct).find((item) => learner[item] && learner[item] !== correct[item]);

  if (mismatch) {
    const concrete = concreteSortHint({ learnerAnswer, correctAnswer } as WrongAnswerInput, 1, mismatch);
    if (concrete && answerMode === 'nudge') return concrete;
    if (answerMode === 'nudge') {
      return `Re-check "${mismatch}". It belongs with "${correct[mismatch]}", not "${learner[mismatch]}".`;
    }
    return `Re-check "${mismatch}": it belongs with "${correct[mismatch]}", not "${learner[mismatch]}".`;
  }

  const missing = Object.keys(correct).find((item) => !learner[item]);
  if (missing) {
    return `Start with "${missing}". It still needs a bucket before the whole sort can be checked.`;
  }

  return 'One placement is off. Pick a single item and ask whether its bucket label really describes it.';
}

function firstSortMismatch(input: WrongAnswerInput): string | null {
  const learner = parseSortSummary(input.learnerAnswer);
  const correct = parseSortSummary(input.correctAnswer);
  return Object.keys(correct).find((item) => learner[item] && learner[item] !== correct[item]) ?? null;
}

function sortReasonForItem(item: string, correctBucket: string, learnerBucket?: string): string | null {
  const numeric = Number(item);
  const bucket = correctBucket.toLowerCase();
  const learner = learnerBucket ? ` It does not belong with "${learnerBucket}".` : '';

  if (Number.isFinite(numeric) && bucket.includes('even') && bucket.includes('not') && bucket.includes('6')) {
    if (numeric % 2 === 0 && numeric !== 6) {
      return `${item} is even and not 6, so it belongs with "${correctBucket}".${learner}`;
    }
  }

  if (Number.isFinite(numeric) && bucket.includes('everything else')) {
    if (numeric % 2 !== 0) {
      return `${item} is not even, so it belongs with "${correctBucket}".${learner}`;
    }
    if (numeric === 6) {
      return `6 is even, but "not a 6" excludes it, so it belongs with "${correctBucket}".${learner}`;
    }
  }

  return null;
}

function concreteSortHint(input: WrongAnswerInput, hintDepth: 1 | 2 | 3, preferredItem?: string): string | null {
  const learner = parseSortSummary(input.learnerAnswer);
  const correct = parseSortSummary(input.correctAnswer);
  const mismatches = Object.keys(correct).filter((item) => learner[item] && learner[item] !== correct[item]);
  const missing = Object.keys(correct).find((item) => !learner[item]);
  const target = preferredItem ?? mismatches[0];

  if (target) {
    const reason = sortReasonForItem(target, correct[target], learner[target]);
    if (reason && hintDepth === 1) return reason;
  }

  const concreteReasons = mismatches
    .map((item) => sortReasonForItem(item, correct[item], learner[item]))
    .filter((reason): reason is string => Boolean(reason));

  if (hintDepth === 2) {
    if (concreteReasons[0]) return concreteReasons[0];
    if (target) return `${target} belongs with "${correct[target]}", not "${learner[target]}".`;
  }

  if (hintDepth === 3) {
    if (concreteReasons.length > 0) {
      return [
        'Sort each face with two checks: is it even, and is it not 6?',
        concreteReasons.slice(0, 3).join(' '),
      ].join(' ');
    }
    if (target) return `Place "${target}" with "${correct[target]}". Then apply the same bucket test to each remaining card.`;
    if (missing) return `Start by placing "${missing}" with "${correct[missing]}", then check the remaining cards one at a time.`;
  }

  return null;
}

function compareOrderAnswer(learnerAnswer: string, correctAnswer: string, answerMode: WrongAnswerInput['answerMode']): string {
  const learner = parseOrderSummary(learnerAnswer);
  const correct = parseOrderSummary(correctAnswer);
  const correctRank = new Map(correct.map((item, index) => [item, index]));

  for (let index = 0; index < learner.length - 1; index += 1) {
    const current = learner[index];
    const next = learner[index + 1];
    const currentRank = correctRank.get(current);
    const nextRank = correctRank.get(next);
    if (currentRank !== undefined && nextRank !== undefined && currentRank > nextRank) {
      if (answerMode === 'nudge') {
        return `Revisit the relative order of "${current}" and "${next}". Those two look flipped on the likelihood scale.`;
      }
      return `"${next}" should come before "${current}" on this scale.`;
    }
  }

  const firstMismatch = correct.find((item, index) => learner[index] && learner[index] !== item);
  if (firstMismatch) {
    return answerMode === 'nudge'
      ? `The first mismatch is near "${learner[correct.indexOf(firstMismatch)]}". Use the scale labels to decide whether that event should move earlier or later.`
      : `The order first goes off near "${firstMismatch}".`;
  }

  return 'The order is close, but one relation is off. Compare neighboring events against the scale labels.';
}

function compareLearnerAnswer(input: WrongAnswerInput, answerKind: WrongAnswerKind, answerMode: WrongAnswerInput['answerMode']): string {
  switch (answerKind) {
    case 'choice':
      return contrastiveChoiceHint(input, answerMode);
    case 'sort':
      return compareSortAnswer(input.learnerAnswer, input.correctAnswer, answerMode);
    case 'order':
      return compareOrderAnswer(input.learnerAnswer, input.correctAnswer, answerMode);
    case 'numeric':
    default:
      return compareNumericAnswer(input.learnerAnswer, input.correctAnswer);
  }
}

function strongestAnswerFreeWalkthrough(input: WrongAnswerInput, answerKind: WrongAnswerKind): string {
  switch (answerKind) {
    case 'sort':
      return concreteSortHint(input, 3) ?? 'Check one card at a time against the bucket labels, then move the first card whose label does not match its bucket.';
    case 'order':
      return 'Treat the scale as a line from lowest chance to highest chance. Compare neighboring events by asking which would happen more often over many trials, move the lower-chance event left, then sweep through the list again until every neighbor increases in likelihood.';
    case 'choice':
      return concreteChoiceFactHint(input, 3) ?? `Keep only a choice whose claim matches the concrete facts in "${promptFocus(input.prompt)}"; reject choices that add a missing outcome, an impossible event, or a stronger diagnosis than the setup supports.`;
    case 'numeric':
    default:
      switch (input.conceptId) {
        case 'complement':
          return 'First find the probability of the event happening, then subtract that probability from 1 to get the "not" case.';
        case 'and-multiply':
          return 'Find the probability of the first required event, find the probability of the second required event, then multiply those probabilities because both must happen together.';
        case 'or-inclusion-exclusion':
          return 'Add the probability of the first event and the probability of the second event, then subtract the overlap once so shared outcomes are not counted twice.';
        case 'conditional':
          return 'Shrink the denominator to only the group named by the condition. Inside that smaller group, count the outcomes that also satisfy the target event, then form target-within-condition over condition.';
        case 'expected-value':
          return 'For each possible payoff, multiply the payoff by its probability. Add the weighted payoff terms together, keeping losses negative if the setup describes a loss.';
        case 'bayes':
          return 'Imagine 1000 people or trials. Count true positives from the target group and false positives from the non-target group, then compare true positives with everyone who tested positive.';
        case 'single-event':
        default:
          return singleEventWalkthrough(input);
      }
  }
}

function progressiveNudge(input: WrongAnswerInput, answerKind: WrongAnswerKind, comparison: string, nextMove: string): string {
  const hintDepth = input.hintDepth ?? 1;
  // Choice hints already need selected-option wording at each level, so the
  // contrastive helper owns the full progressive sequence for that format.
  if (answerKind === 'choice') {
    return comparison;
  }
  if (answerKind === 'sort') {
    const concrete = concreteSortHint(input, hintDepth, firstSortMismatch(input) ?? undefined);
    if (concrete) return concrete;
  }
  if (hintDepth === 1) {
    return comparison;
  }
  if (hintDepth === 2) {
    if (input.conceptId === 'single-event' && answerKind === 'numeric') {
      const concrete = concreteSingleEventHint(input, 2);
      if (concrete) return concrete;
    }
    return nextMove;
  }
  return strongestAnswerFreeWalkthrough(input, answerKind);
}

function normalizedHintText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hintWords(text: string): string[] {
  return normalizedHintText(text).split(' ').filter((word) => word.length > 2);
}

function hintOverlapRatio(candidate: string, previous: string): number {
  const candidateWords = hintWords(candidate);
  if (candidateWords.length === 0) return 1;
  const previousWords = new Set(hintWords(previous));
  const overlapping = candidateWords.filter((word) => previousWords.has(word)).length;
  return overlapping / candidateWords.length;
}

function hasMeaningfulHintOverlap(candidate: string, previous: string): boolean {
  const next = normalizedHintText(candidate);
  const prior = normalizedHintText(previous);
  if (!next) return true;
  if (!prior) return false;
  return next === prior || next.startsWith(prior) || prior.startsWith(next) || hintOverlapRatio(candidate, previous) >= 0.72;
}

function sentencesInHint(text: string): string[] {
  const sentenceMatches = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  return sentenceMatches.map((sentence) => sentence.trim()).filter(Boolean);
}

function trimRepeatedHintOpening(candidate: string, previousHints: string[] = []): string | null {
  let remaining = candidate.trim();
  for (const previous of previousHints) {
    const prior = normalizedHintText(previous);
    const next = normalizedHintText(remaining);
    if (!prior || !next) continue;
    if (next.startsWith(prior)) {
      remaining = remaining.slice(previous.trim().length).replace(/^[\s,.;:!?-]+/, '').trim();
    }
  }

  let sentences = sentencesInHint(remaining);
  while (
    sentences.length > 1 &&
    previousHints.some((previous) => hasMeaningfulHintOverlap(sentences[0], previous))
  ) {
    sentences = sentences.slice(1);
  }

  const trimmed = sentences.join(' ').trim();
  if (!trimmed) return null;
  if (previousHints.some((previous) => hasMeaningfulHintOverlap(trimmed, previous))) return null;
  return trimmed;
}

function maxSequentialDistinctDepth(input: WrongAnswerInput, hintForDepth: (candidate: WrongAnswerInput) => string): HintDepth {
  let maxDepth: HintDepth = 1;
  let prior = '';
  for (const depth of [1, 2, 3] as const) {
    const normalized = normalizedHintText(hintForDepth({ ...input, hintDepth: depth }));
    if (!normalized) break;
    if (prior && hasMeaningfulHintOverlap(normalized, prior)) break;
    maxDepth = depth;
    prior = normalized;
  }
  return maxDepth;
}

function maxProductiveHintDepth(
  input: WrongAnswerInput,
  answerKind: WrongAnswerKind,
  answerMode: WrongAnswerInput['answerMode'],
): HintDepth {
  if (answerMode !== 'nudge') return 1;
  if (answerKind !== 'choice') return 3;

  // A limited-evidence diagnosis has one useful nudge plus one stronger check;
  // pushing to a third hint usually just repeats "do not overdiagnose."
  if (classifyChoiceMisconception(input) === 'overdiagnose-unfair') return 2;

  return maxSequentialDistinctDepth(input, (candidate) => contrastiveChoiceHint(candidate, 'nudge'));
}

function firstUsefulStep(steps: string[]): string {
  const step = steps.find((candidate) => candidate && !/answer|result/i.test(candidate)) ?? steps[0];
  return step && !/:\s*0(?:\b|$)/.test(step) ? `Start by checking: ${step}.` : '';
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

const CONCEPT_ANOTHER_FALLBACK: Record<ConceptId, string> = {
  'single-event':
    'Think of probability as a share: wins over all equally likely outcomes. Count only the outcomes that would make the event happen, then compare that count with the full set.',
  complement:
    'Picture the whole chance as 1 full pie. If the event takes one slice, the complement is everything left after that slice is removed.',
  'and-multiply':
    'Treat each "and" condition like another filter. After the first event narrows the possibilities, the next event narrows them again.',
  'or-inclusion-exclusion':
    'Imagine highlighting outcomes that satisfy either event. Add both highlighted groups, but if an outcome got highlighted twice, count it only once.',
  conditional:
    'Start by shrinking the room to only the cases where the condition is true. Then ask what share of that smaller room also has the target event.',
  'expected-value':
    'Think of expected value as a long-run balance point. Each payoff pulls the average by its size and by how often it happens.',
  bayes:
    'Use counts instead of formulas: count the true matches, count the false alarms, then compare true matches with everyone who produced the evidence.',
};

const ACTION_NUDGE: Record<ConceptId, string> = {
  'single-event': 'Name the event, count only the outcomes that make it happen, then compare that count with the total.',
  complement: 'Check whether it is easier to count what is excluded, then subtract that share from the whole.',
  'and-multiply': 'For an "and" event, make sure every listed condition happens in the same outcome.',
  'or-inclusion-exclusion': 'For an "or" event, count outcomes that satisfy either event once, especially any overlap.',
  conditional: 'Use only the group named after "given" or "|"; everything outside that group is not in the denominator.',
  'expected-value': 'List each payoff once, weight it by how often it happens, then combine the weighted values.',
  bayes: 'Separate true positives from false positives, then compare the target group with everyone who matches the evidence.',
};

function actionableNudge(conceptId: ConceptId, answerKind: WrongAnswerKind): string {
  if (answerKind === 'sort') return 'Check one card at a time against the bucket label, not against the other cards.';
  if (answerKind === 'order') return 'Use the scale labels first, then compare neighboring cards that feel close.';
  if (answerKind === 'choice') return 'Look for the option whose claim matches the setup exactly.';
  return ACTION_NUDGE[conceptId] ?? 'Re-read the question and identify what counts before calculating.';
}

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
): Promise<WrongAnswerResult> {
  const conceptLabel = CONCEPT_LABELS[input.conceptId] ?? input.conceptId;
  const answerMode = input.answerMode ?? 'explanation';
  const answerKind = inferAnswerKind(input);
  const hintDepth = input.hintDepth ?? 1;
  const maxHintDepth = maxProductiveHintDepth(input, answerKind, answerMode);
  const hasMoreHints = answerMode === 'nudge' ? hintDepth < maxHintDepth : false;

  // Deterministic fallback, enriched with exact solver steps when possible.
  let solution: SolverResult | null = null;
  let steps: string[] = [];
  try {
    const solverParams = numericParams(input.params);
    if (answerKind === 'numeric' && Object.keys(solverParams).length > 0) {
      solution = solveConcept(input.conceptId, solverParams);
      steps = stepLines(solution);
    }
  } catch {
    steps = [];
  }
  const comparison = compareLearnerAnswer(input, answerKind, answerMode);
  const stepNudge = answerMode === 'nudge' ? '' : firstUsefulStep(steps);
  const nextMove = stepNudge || actionableNudge(input.conceptId, answerKind);
  const fallback =
    answerMode === 'nudge'
      ? progressiveNudge(input, answerKind, comparison, nextMove)
      : [
          comparison,
          `The correct answer is ${input.correctAnswer}.`,
          `This is a ${conceptLabel} problem. ${actionableNudge(input.conceptId, answerKind)}`,
        ]
          .filter(Boolean)
          .join(' ');

  const ai = await callAiGenerate('explainWrongAnswer', {
    conceptId: input.conceptId,
    prompt: input.prompt,
    learnerAnswer: input.learnerAnswer,
    correctAnswer: input.correctAnswer,
    params: input.params,
    answerMode,
    answerKind,
    hintDepth,
    maxHintDepth,
    hasMoreHints,
    choices: input.choices,
    selectedChoice: input.selectedChoice,
    correctChoice: input.correctChoice,
    incorrectFeedback: input.incorrectFeedback,
    explanation: input.explanation,
    context: input.context,
    givenFacts: input.givenFacts,
    hints: input.hints,
    previousHints: input.previousHints,
    solverHint: input.solverHint,
    solution: answerMode === 'nudge' ? undefined : (solution ?? undefined),
    answerComparison: comparison,
    groundTruthNote:
      `The correct answer is exactly ${input.correctAnswer}. Treat this as ground ` +
      `truth. Do NOT state any different answer; only explain the reasoning.` +
      (answerMode === 'nudge'
        ? ` Do not reveal the correct answer in this hint. Hint depth is ${hintDepth} of ${maxHintDepth}: higher depth may be more direct, but must still not output the answer. Earlier hints remain visible; do not repeat previous hint text, selected-answer restatements, or the same diagnosis. If no stronger productive hint exists, do not pad with repeated advice.`
        : ` Return one concise diagnostic explanation of why the learner answer is wrong. The client will append the full worked solution separately, so do not include step-by-step solution prose.`),
  });

  if (ai) {
    const additiveText = answerMode === 'nudge' ? trimRepeatedHintOpening(ai.text, input.previousHints) : ai.text;
    if (additiveText) return { explanation: additiveText, usedAI: true, hasMoreHints, maxHintDepth };
  }
  const additiveFallback = answerMode === 'nudge' ? trimRepeatedHintOpening(fallback, input.previousHints) : fallback.trim();
  return {
    explanation: (additiveFallback ?? '').trim(),
    usedAI: false,
    hasMoreHints: Boolean(additiveFallback) && hasMoreHints,
    maxHintDepth,
  };
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
  const fallback =
    CONCEPT_ANOTHER_FALLBACK[input.conceptId] ?? CONCEPT_INTUITION[input.conceptId] ?? 'Re-read the setup and identify what counts before calculating.';

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

function isGeneratedProblemShape(problem: unknown): problem is GeneratedProblem {
  if (!problem || typeof problem !== 'object') return false;
  const p = problem as Partial<GeneratedProblem>;
  return (
    typeof p.id === 'string' &&
    ALL_CONCEPTS.includes(p.conceptId as ConceptId) &&
    typeof p.prompt === 'string' &&
    typeof p.acceptedAnswer === 'string' &&
    typeof p.acceptedDecimal === 'number' &&
    typeof p.tolerance === 'number' &&
    typeof p.params === 'object' &&
    p.params !== null &&
    typeof p.solution === 'object' &&
    p.solution !== null &&
    typeof p.solution.fraction === 'string' &&
    typeof p.solution.decimal === 'number' &&
    Array.isArray(p.solution.steps)
  );
}

/**
 * Repair or reject a cached/generated problem before React sees it. Older cache
 * docs can be missing display fields; if params are still valid, recompute the
 * answer/solution and merge onto the deterministic fallback. Otherwise use the
 * fallback outright.
 */
function safeGeneratedProblem(
  candidate: unknown,
  conceptId: ConceptId,
  level: number,
  seed: number,
  fallback: GeneratedProblem,
): GeneratedProblem {
  if (!candidate || typeof candidate !== 'object') return fallback;
  const raw = candidate as Partial<GeneratedProblem>;
  if (raw.conceptId !== conceptId) return fallback;

  const params = toNumericParams(raw.params);
  const prompt = typeof raw.prompt === 'string' && raw.prompt.trim() ? raw.prompt.trim() : fallback.prompt;
  const valid = validateProblemSpec(conceptId, params, prompt);
  if (!valid.ok) return fallback;

  const solution = solveConcept(conceptId, params);
  const repaired: GeneratedProblem = {
    ...fallback,
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${conceptId}-L${level}-safe-${seed}`,
    conceptId,
    level: Number.isFinite(raw.level) ? Math.max(1, Math.round(raw.level ?? level)) : level,
    difficulty: raw.difficulty ?? fallback.difficulty,
    params,
    prompt,
    acceptedAnswer: solution.fraction,
    acceptedDecimal: solution.decimal,
    tolerance: Number.isFinite(raw.tolerance) ? raw.tolerance ?? fallback.tolerance : fallback.tolerance,
    solution,
    source: raw.source === 'ai' ? 'ai' : fallback.source,
    confidence: raw.confidence ?? (raw.source === 'ai' ? 1 : fallback.confidence),
  };

  return isGeneratedProblemShape(repaired) ? repaired : fallback;
}

/**
 * Call the `generateProblem` endpoint. Returns the raw spec on success or null
 * on ANY failure (disabled, missing endpoint, network, timeout, unparseable).
 * Never throws. Signed-out demo learners can still try the endpoint; the server
 * applies a tighter anonymous rate limit.
 */
async function callGenerateProblem(spec: GenerateProblemSpec): Promise<AiProblemSpec | null> {
  if (!isAIEnabled()) return null;
  if (!AI_ENDPOINT) return null;
  try {
    const idToken = await getIdToken();
    const payload = {
      conceptId: spec.conceptId,
      concept: CONCEPT_LABELS[spec.conceptId] ?? spec.conceptId,
      level: Math.max(1, Math.round(spec.level)),
      seed: spec.seed ?? 1,
    };
    const response = await withTimeout(
      fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: aiRequestHeaders(idToken),
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
 *   3. Deterministic fallback — `generateProblem`, used when AI is off,
 *      generation fails/times out, or validation rejects the model's payload.
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
    const problem = safeGeneratedProblem(cached, conceptId, level, seed, fallback);
    return { problem, usedAI: problem.source === 'ai' };
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
