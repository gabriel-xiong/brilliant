/**
 * Well-posedness + prose-faithfulness checks for AI-authored problem specs.
 *
 * Phase 1 principle: the AI proposes a SCENARIO (prose) plus STRUCTURED PARAMS
 * for one of the 7 known concepts; the deterministic `solveConcept` computes the
 * authoritative answer. The AI never supplies the number. Before we trust an
 * AI-authored spec we verify two things here:
 *
 *   1. Well-posedness — the params are mathematically valid for the concept
 *      (denominators > 0, counts within bounds, integers where required,
 *      inclusion-exclusion overlap feasible, etc.), so `solveConcept` yields a
 *      sensible answer.
 *   2. Prose-faithfulness — every numeric value the learner needs actually
 *      appears as a token in the scenario text, so the story matches the params
 *      (and therefore matches the deterministic answer key).
 *
 * This module is PURE and framework-free. The Cloud Function runs an equivalent
 * server-side check (kept in sync with this file) as defense-in-depth, but the
 * CLIENT is authoritative: it re-validates every AI response and recomputes the
 * answer key with `solveConcept`, so a bad AI payload can only ever cause a
 * fallback to the deterministic generator — never a wrong answer.
 *
 * NOTE (Phase 2): for out-of-scope / novel problems that do not map onto one of
 * the 7 concepts, the approved plan is to allow a high-confidence LLM-consensus
 * answer (recorded on `GeneratedProblem.confidence`). That verifier is NOT built
 * here; in Phase 1 every accepted problem maps to a known concept and is solved
 * deterministically.
 */

import type { ConceptId } from './types';

/** Integer check that also rejects NaN/Infinity. */
function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/**
 * Is the (conceptId, params) pair mathematically well-posed? Mirrors the param
 * schemas consumed by `solveConcept`. Returns false (never throws) for anything
 * malformed so callers can safely fall back.
 */
export function isWellPosed(conceptId: ConceptId, params: Record<string, number>): boolean {
  try {
    switch (conceptId) {
      case 'single-event':
      case 'complement': {
        const { favorable, total } = params;
        return isInt(total) && total > 0 && isInt(favorable) && favorable >= 0 && favorable <= total;
      }
      case 'and-multiply': {
        const { favA, totA, favB, totB } = params;
        return (
          isInt(totA) && totA > 0 && isInt(favA) && favA >= 0 && favA <= totA &&
          isInt(totB) && totB > 0 && isInt(favB) && favB >= 0 && favB <= totB
        );
      }
      case 'or-inclusion-exclusion': {
        const { total, countA, countB, countBoth } = params;
        if (!(isInt(total) && total > 0)) return false;
        if (!(isInt(countA) && countA >= 0 && countA <= total)) return false;
        if (!(isInt(countB) && countB >= 0 && countB <= total)) return false;
        if (!isInt(countBoth)) return false;
        const minBoth = Math.max(0, countA + countB - total);
        const maxBoth = Math.min(countA, countB);
        return countBoth >= minBoth && countBoth <= maxBoth;
      }
      case 'conditional': {
        const { countB, countAandB } = params;
        return isInt(countB) && countB > 0 && isInt(countAandB) && countAandB >= 0 && countAandB <= countB;
      }
      case 'expected-value': {
        const { pNum, pDen, payoffWin, payoffLose } = params;
        return (
          isInt(pDen) && pDen > 0 && isInt(pNum) && pNum >= 0 && pNum <= pDen &&
          isInt(payoffWin) && isInt(payoffLose)
        );
      }
      case 'bayes': {
        // Per-1000 integer encoding: each value is an integer in [0, 1000].
        const { priorH, sensitivity, falsePositive } = params;
        if (!(isInt(priorH) && priorH > 0 && priorH < 1000)) return false;
        if (!(isInt(sensitivity) && sensitivity > 0 && sensitivity <= 1000)) return false;
        if (!(isInt(falsePositive) && falsePositive >= 0 && falsePositive <= 1000)) return false;
        // Evidence P(E) must be > 0 so the posterior is defined.
        return sensitivity > 0 || falsePositive > 0;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * The numeric values a faithful scenario MUST mention, in the form the learner
 * reads them. Most concepts show the raw param; bayes shows percentages
 * (per-1000 / 10) and expected-value shows the magnitude of the payoffs.
 */
export function displayValuesForConcept(conceptId: ConceptId, params: Record<string, number>): number[] {
  switch (conceptId) {
    case 'single-event':
    case 'complement':
      return [params.favorable, params.total];
    case 'and-multiply':
      return [params.favA, params.totA, params.favB, params.totB];
    case 'or-inclusion-exclusion':
      return [params.total, params.countA, params.countB, params.countBoth];
    case 'conditional':
      return [params.countB, params.countAandB];
    case 'expected-value':
      return [params.pNum, params.pDen, params.payoffWin, Math.abs(params.payoffLose)];
    case 'bayes':
      return [params.priorH / 10, params.sensitivity / 10, params.falsePositive / 10];
    default:
      return [];
  }
}

const NUMBER_TOKEN = /-?\d+(?:\.\d+)?/g;

/**
 * Does `prose` mention every value the learner needs? Tokenizes the text into
 * numeric tokens and requires each display value (see
 * {@link displayValuesForConcept}) to appear. This catches an AI scenario whose
 * story drifted from its params (which would make it disagree with the
 * deterministic answer key).
 */
export function proseFaithful(conceptId: ConceptId, params: Record<string, number>, prose: string): boolean {
  if (typeof prose !== 'string' || !prose.trim()) return false;
  const tokens = new Set(prose.match(NUMBER_TOKEN) ?? []);
  for (const value of displayValuesForConcept(conceptId, params)) {
    if (!Number.isFinite(value)) return false;
    // Compare as canonical numeric strings so "5.0" never sneaks past "5".
    if (!tokens.has(String(value))) return false;
  }
  return true;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Combined gate: a spec is accepted only when it is BOTH well-posed AND
 * prose-faithful. Returns a structured result so server logs / tests can report
 * which check failed. Never throws.
 */
export function validateProblemSpec(
  conceptId: ConceptId,
  params: Record<string, number>,
  prose: string,
): ValidationResult {
  if (!isWellPosed(conceptId, params)) {
    return { ok: false, reason: 'not-well-posed' };
  }
  if (!proseFaithful(conceptId, params, prose)) {
    return { ok: false, reason: 'prose-not-faithful' };
  }
  return { ok: true };
}
