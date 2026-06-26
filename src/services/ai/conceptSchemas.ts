/**
 * The "truth engine" for the probability course.
 *
 * Everything here is PURE and DETERMINISTIC. The exact answer to every problem
 * is computed with math.js exact fractions — never floating point and never the
 * AI. `solveConcept` is the single solver; `generateProblem` builds reproducible,
 * learner-facing questions and delegates answer computation back to the solver
 * so the generated `acceptedAnswer` is provably correct (round-trippable).
 *
 * No React, no Firebase, no AI calls live in this file.
 */

import {
  add,
  divide,
  fraction,
  format,
  multiply,
  number,
  subtract,
  type Fraction,
} from 'mathjs';
import type {
  ConceptId,
  Difficulty,
  GeneratedProblem,
  SolutionStep,
  SolverResult,
} from './types';

/** All concept ids, in teaching order. */
export const ALL_CONCEPTS: ConceptId[] = [
  'single-event',
  'complement',
  'and-multiply',
  'or-inclusion-exclusion',
  'conditional',
  'expected-value',
  'bayes',
];

/** Friendly, learner-facing names for each concept. */
export const CONCEPT_LABELS: Record<ConceptId, string> = {
  'single-event': 'Single-event probability',
  complement: 'Complement (probability of "not")',
  'and-multiply': 'Independent AND (multiplication)',
  'or-inclusion-exclusion': 'OR with inclusion-exclusion',
  conditional: 'Conditional probability',
  'expected-value': 'Expected value',
  bayes: "Bayes' rule (updating beliefs)",
};

// ---------------------------------------------------------------------------
// math.js helpers — all arithmetic flows through exact Fractions.
// ---------------------------------------------------------------------------

/** Build an exact Fraction from integers (denominator defaults to 1). */
function frac(n: number, d = 1): Fraction {
  return fraction(n, d) as Fraction;
}

/** Exact fraction add. */
function fAdd(a: Fraction, b: Fraction): Fraction {
  return add(a, b) as unknown as Fraction;
}

/** Exact fraction subtract. */
function fSub(a: Fraction, b: Fraction): Fraction {
  return subtract(a, b) as unknown as Fraction;
}

/** Exact fraction multiply. */
function fMul(a: Fraction, b: Fraction): Fraction {
  return multiply(a, b) as unknown as Fraction;
}

/** Exact fraction divide. Returns 0 if the denominator fraction is 0. */
function fDiv(a: Fraction, b: Fraction): Fraction {
  if (number(b) === 0) return frac(0);
  return divide(a, b) as unknown as Fraction;
}

/** Render a Fraction as its exact reduced string, e.g. "1/3" or "5". */
function fStr(f: Fraction): string {
  try {
    const ratio = format(f, { fraction: 'ratio' });
    // math.js renders whole numbers as "5/1" / "0/1"; collapse to "5" / "0".
    return ratio.endsWith('/1') ? ratio.slice(0, -2) : ratio;
  } catch {
    return String(number(f));
  }
}

/** Numeric value of a Fraction. */
function fNum(f: Fraction): number {
  return number(f);
}

/** Build a SolverResult from a final Fraction plus its steps. */
function result(final: Fraction, steps: SolutionStep[]): SolverResult {
  return { fraction: fStr(final), decimal: fNum(final), steps };
}

/** Safe fallback result (used when params are degenerate). Never throws. */
function safeZero(label = 'Result'): SolverResult {
  const zero = frac(0);
  return { fraction: fStr(zero), decimal: 0, steps: [{ label, value: '0' }] };
}

// ---------------------------------------------------------------------------
// solveConcept — the exact solver. Pure, deterministic, never throws.
// ---------------------------------------------------------------------------

/**
 * Compute the EXACT answer for a concept from structured params, plus a short
 * worked-solution trace. Always returns a reduced fraction string and the
 * matching decimal. Degenerate params (e.g. zero totals) fall back to "0"
 * instead of throwing, so callers can rely on this never raising.
 *
 * Param schemas:
 * - single-event:           { favorable, total }
 * - complement:             { favorable, total }
 * - and-multiply:           { favA, totA, favB, totB }
 * - or-inclusion-exclusion: { total, countA, countB, countBoth }
 * - conditional:            { countB, countAandB }
 * - expected-value:         { pNum, pDen, payoffWin, payoffLose }
 *     p = pNum/pDen is P(win). E = p*payoffWin + (1-p)*payoffLose.
 * - bayes:                  { priorH, sensitivity, falsePositive }  (per-1000 ints)
 *     P(H)=priorH/1000, P(E|H)=sensitivity/1000, P(E|notH)=falsePositive/1000.
 *     posterior = P(H)P(E|H) / ( P(H)P(E|H) + (1-P(H))P(E|notH) ).
 */
export function solveConcept(conceptId: ConceptId, params: Record<string, number>): SolverResult {
  try {
    switch (conceptId) {
      case 'single-event': {
        const { favorable, total } = params;
        if (!Number.isFinite(total) || total <= 0) return safeZero('P');
        const p = fDiv(frac(favorable), frac(total));
        return result(p, [
          { label: 'Favorable outcomes', value: `${favorable}` },
          { label: 'Total outcomes', value: `${total}` },
          { label: 'P = favorable / total', value: fStr(p) },
        ]);
      }

      case 'complement': {
        const { favorable, total } = params;
        if (!Number.isFinite(total) || total <= 0) return safeZero('P(not E)');
        const pE = fDiv(frac(favorable), frac(total));
        const pNot = fSub(frac(1), pE);
        return result(pNot, [
          { label: 'P(E) = favorable / total', value: fStr(pE) },
          { label: 'P(not E) = 1 - P(E)', value: fStr(pNot) },
        ]);
      }

      case 'and-multiply': {
        const { favA, totA, favB, totB } = params;
        if (totA <= 0 || totB <= 0) return safeZero('P(A and B)');
        const pA = fDiv(frac(favA), frac(totA));
        const pB = fDiv(frac(favB), frac(totB));
        const both = fMul(pA, pB);
        return result(both, [
          { label: 'P(A)', value: fStr(pA) },
          { label: 'P(B)', value: fStr(pB) },
          { label: 'P(A and B) = P(A) x P(B)', value: fStr(both) },
        ]);
      }

      case 'or-inclusion-exclusion': {
        const { total, countA, countB, countBoth } = params;
        if (total <= 0) return safeZero('P(A or B)');
        const pA = fDiv(frac(countA), frac(total));
        const pB = fDiv(frac(countB), frac(total));
        const pBoth = fDiv(frac(countBoth), frac(total));
        const union = fSub(fAdd(pA, pB), pBoth);
        return result(union, [
          { label: 'P(A)', value: fStr(pA) },
          { label: 'P(B)', value: fStr(pB) },
          { label: 'P(A and B)', value: fStr(pBoth) },
          { label: 'P(A or B) = P(A) + P(B) - P(A and B)', value: fStr(union) },
        ]);
      }

      case 'conditional': {
        const { countB, countAandB } = params;
        if (countB <= 0) return safeZero('P(A | B)');
        const cond = fDiv(frac(countAandB), frac(countB));
        return result(cond, [
          { label: 'count(A and B)', value: `${countAandB}` },
          { label: 'count(B)', value: `${countB}` },
          { label: 'P(A | B) = count(A and B) / count(B)', value: fStr(cond) },
        ]);
      }

      case 'expected-value': {
        const { pNum, pDen, payoffWin, payoffLose } = params;
        if (pDen <= 0) return safeZero('E[X]');
        const p = fDiv(frac(pNum), frac(pDen));
        const q = fSub(frac(1), p);
        const ev = fAdd(fMul(p, frac(payoffWin)), fMul(q, frac(payoffLose)));
        return result(ev, [
          { label: 'P(win) = pNum / pDen', value: fStr(p) },
          { label: 'P(not win) = 1 - P(win)', value: fStr(q) },
          {
            label: 'E[X] = P(win)*payoffWin + P(not win)*payoffLose',
            value: fStr(ev),
          },
        ]);
      }

      case 'bayes': {
        const { priorH, sensitivity, falsePositive } = params;
        const denomScale = frac(1000);
        const pH = fDiv(frac(priorH), denomScale);
        const pEH = fDiv(frac(sensitivity), denomScale);
        const pEnotH = fDiv(frac(falsePositive), denomScale);
        const numer = fMul(pH, pEH);
        const evidence = fAdd(numer, fMul(fSub(frac(1), pH), pEnotH));
        if (number(evidence) === 0) return safeZero('P(H | E)');
        const post = fDiv(numer, evidence);
        return result(post, [
          { label: 'P(H)*P(E|H)', value: fStr(numer) },
          {
            label: 'P(E) = P(H)*P(E|H) + P(notH)*P(E|notH)',
            value: fStr(evidence),
          },
          { label: 'P(H | E) = P(H)*P(E|H) / P(E)', value: fStr(post) },
        ]);
      }

      default:
        return safeZero();
    }
  } catch {
    // The solver must never throw; degenerate input yields a safe zero.
    return safeZero();
  }
}

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic problem generation.
// ---------------------------------------------------------------------------

/** Tiny, fast, deterministic PRNG. Same seed -> same stream. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive integer in [min, max] from a 0..1 rng. */
function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const PROB_PLACEHOLDER = 'e.g. 1/3 or 0.33';

// ---------------------------------------------------------------------------
// Difficulty: open-ended numeric `level` (>= 1, NO upper clamp).
//
// The course used to ship a 3-band ceiling (intro/core/challenge). The number
// ranges below now scale CONTINUOUSLY from a numeric `level`, so deterministic
// problems keep getting harder (bigger sample spaces / denominators) without
// bound. `solveConcept` stays exact at any magnitude, so the answer key never
// degrades. Legacy band callers still work: a band maps to a representative
// level for magnitude while the human-facing id keeps the band token.
// ---------------------------------------------------------------------------

/** Representative level for each legacy band (matches `difficultyForConcept`). */
const BAND_LEVEL: Record<Difficulty, number> = { intro: 1, core: 4, challenge: 8 };

/** Collapse a numeric level back to a legacy 3-band label for the `difficulty` field. */
function levelToLegacyBand(level: number): Difficulty {
  if (level <= 2) return 'intro';
  if (level <= 5) return 'core';
  return 'challenge';
}

/**
 * Spread `[lo, hi]` widening with `level`. `base` is the level-1 low end and
 * `growth` is how fast both ends climb per level. Guarantees `hi > lo`.
 */
function scaledRange(level: number, base: number, growth: number): [number, number] {
  const lo = Math.max(base, Math.round(base + (level - 1) * growth));
  const hi = lo + Math.round(growth) + Math.max(2, Math.round(level * (growth / 2)));
  return [lo, hi];
}

/**
 * Pick a "favorable" count out of `total` whose difficulty scales with `level`.
 * Easy levels allow simple/extreme counts (including 1, e.g. "1 of 6"); from
 * level 3 up we draw from an inner band so the fraction is never trivial
 * (no "1 of N" or "N-1 of N") and takes real work to reduce.
 */
function scaledFavorable(rng: () => number, total: number, level: number): number {
  if (total <= 2) return 1;
  if (level <= 2) return randInt(rng, 1, total - 1);
  const margin = Math.min(Math.floor((total - 1) / 2), Math.max(1, Math.round(level / 2)));
  const lo = Math.max(1, margin);
  const hi = Math.min(total - 1, total - 1 - margin);
  return lo <= hi ? randInt(rng, lo, hi) : randInt(rng, 1, total - 1);
}

/** Cover stories for single-event so practice is not always the same spinner. */
const SINGLE_EVENT_SCENARIOS: Array<(favorable: number, total: number) => string> = [
  (f, t) => `A spinner has ${t} equal slices; ${f} of them are gold. What is the probability the spinner lands on gold?`,
  (f, t) => `A raffle drum holds ${t} tickets and ${f} of them win a prize. If you draw one ticket at random, what is the probability it wins?`,
  (f, t) => `A bag holds ${t} marbles; ${f} of them are red. Drawing one marble at random, what is the probability it is red?`,
  (f, t) => `A shelf has ${t} sealed boxes and ${f} of them contain a toy. Picking one box at random, what is the probability it has a toy?`,
];

function singleEventPrompt(seed: number, favorable: number, total: number): string {
  const pick = SINGLE_EVENT_SCENARIOS[Math.abs(seed) % SINGLE_EVENT_SCENARIOS.length];
  return pick(favorable, total);
}

// ---------------------------------------------------------------------------
// generateProblem — deterministic, gradable problems per (concept, difficulty, seed).
// ---------------------------------------------------------------------------

/**
 * Build a reproducible, learner-facing problem. Given the same
 * (conceptId, difficulty, seed) it always returns an identical problem. The
 * answer is computed by `solveConcept`, so `acceptedAnswer === solution.fraction`
 * and `solveConcept(params)` round-trips to the same value.
 *
 * This is the ALWAYS-AVAILABLE fallback for the AI-authored path: when AI is
 * off, the learner is signed out, or generation fails, the practice surface
 * serves this instead, so the experience never hangs or goes wrong.
 *
 * @param conceptId  Which concept to drill.
 * @param difficulty Either a legacy band ('intro'|'core'|'challenge') OR an
 *                   open-ended numeric `level` (>= 1). Number ranges scale with
 *                   the level; there is no upper ceiling.
 * @param seed       Optional PRNG seed; defaults to 1 for a stable canonical problem.
 */
export function generateProblem(
  conceptId: ConceptId,
  difficulty: Difficulty | number,
  seed = 1,
): GeneratedProblem {
  const rng = mulberry32(seed >>> 0);
  const level = typeof difficulty === 'number' ? Math.max(1, Math.round(difficulty)) : BAND_LEVEL[difficulty];
  const band = typeof difficulty === 'number' ? levelToLegacyBand(level) : difficulty;
  const idTag = typeof difficulty === 'number' ? `L${level}` : difficulty;
  const id = `${conceptId}-${idTag}-${seed}`;

  let params: Record<string, number> = {};
  let prompt = '';
  let tolerance = 0.02;
  let unit: string | undefined;
  let placeholder: string | undefined = PROB_PLACEHOLDER;

  switch (conceptId) {
    case 'single-event': {
      const [lo, hi] = scaledRange(level, 6, 4);
      const total = randInt(rng, lo, hi);
      const favorable = scaledFavorable(rng, total, level);
      params = { favorable, total };
      prompt = singleEventPrompt(seed, favorable, total);
      break;
    }

    case 'complement': {
      const [lo, hi] = scaledRange(level, 6, 4);
      const total = randInt(rng, lo, hi);
      const favorable = scaledFavorable(rng, total, level);
      params = { favorable, total };
      prompt = `A weather model says rain happens on ${favorable} of the next ${total} days. What is the probability a randomly chosen day is dry (no rain)?`;
      break;
    }

    case 'and-multiply': {
      const [lo, hi] = scaledRange(level, 3, 2);
      const totA = randInt(rng, lo, hi);
      const favA = scaledFavorable(rng, totA, level);
      const totB = randInt(rng, lo, hi);
      const favB = scaledFavorable(rng, totB, level);
      params = { favA, totA, favB, totB };
      prompt = `Machine A passes a part with probability ${favA}/${totA}; machine B passes independently with probability ${favB}/${totB}. What is the probability a part passes BOTH machines?`;
      break;
    }

    case 'or-inclusion-exclusion': {
      const [lo, hi] = scaledRange(level, 6, 4);
      const total = randInt(rng, lo, hi);
      const countA = scaledFavorable(rng, total, level);
      const countB = scaledFavorable(rng, total, level);
      const minBoth = Math.max(0, countA + countB - total);
      const maxBoth = Math.min(countA, countB);
      const countBoth = randInt(rng, minBoth, maxBoth);
      params = { total, countA, countB, countBoth };
      prompt = `In a class of ${total} students, ${countA} play soccer, ${countB} play tennis, and ${countBoth} play both. If you pick a student at random, what is the probability they play soccer OR tennis?`;
      break;
    }

    case 'conditional': {
      const [lo, hi] = scaledRange(level, 6, 4);
      const countB = randInt(rng, lo, hi);
      const countAandB = scaledFavorable(rng, countB, level);
      params = { countB, countAandB };
      prompt = `Over the last ${countB} cloudy days, it rained on ${countAandB} of them. Given that a day is cloudy, what is the probability it rains? (P(rain | cloudy))`;
      break;
    }

    case 'expected-value': {
      tolerance = 0.05;
      unit = '$';
      placeholder = 'e.g. 2.5';
      const pDen = randInt(rng, 2, 3 + level);
      const pNum = randInt(rng, 1, pDen - 1);
      const payoffWin = randInt(rng, 2 + level, 5 + 3 * level);
      const payoffLose = -randInt(rng, 0, 2 + level);
      params = { pNum, pDen, payoffWin, payoffLose };
      const winText = `win $${payoffWin}`;
      const loseText = payoffLose >= 0 ? `win $${payoffLose}` : `lose $${-payoffLose}`;
      prompt = `A game spinner lands on "win" with probability ${pNum}/${pDen}. If it wins you ${winText}; otherwise you ${loseText}. What is the expected payout (in dollars) per play?`;
      break;
    }

    case 'bayes': {
      // Per-1000 integer encoding keeps every value integer-keyed; divide by 10
      // to display as a percentage (e.g. 500 -> 50%). Higher levels make the
      // disease rarer (lower prior), which makes the posterior more surprising.
      const phHi = Math.max(20, 500 - 40 * level);
      const phLo = Math.max(5, phHi - 150);
      const priorH = randInt(rng, phLo, phHi);
      const sensitivity = randInt(rng, 80, 99) * 10; // 800..990 (80%..99%)
      const falsePositive = randInt(rng, 2, 20) * 10; // 20..200 (2%..20%)
      params = { priorH, sensitivity, falsePositive };
      prompt = `A disease affects ${priorH / 10}% of people. A test correctly flags it ${sensitivity / 10}% of the time when present, but also gives a false positive ${falsePositive / 10}% of the time when absent. If someone tests positive, what is the probability they actually have the disease?`;
      break;
    }

    default:
      params = {};
      prompt = 'Solve for the probability.';
  }

  const solution = solveConcept(conceptId, params);
  return {
    id,
    conceptId,
    difficulty: band,
    level,
    params,
    prompt,
    acceptedAnswer: solution.fraction,
    acceptedDecimal: solution.decimal,
    tolerance,
    unit,
    placeholder,
    solution,
    source: 'deterministic',
  };
}

// ---------------------------------------------------------------------------
// Lesson -> concept mapping.
// ---------------------------------------------------------------------------

const LESSON_CONCEPTS: Record<string, ConceptId[]> = {
  'intro-basic-probability': ['single-event'],
  'counting-outcomes': ['single-event', 'complement'],
  'compound-events': ['and-multiply'],
  'dependent-events': ['conditional'],
  'mutually-exclusive-events': ['or-inclusion-exclusion'],
  // New lessons (authored by another agent in Phase 2):
  'expected-value': ['expected-value'],
  'bayes-updating': ['bayes'],
};

/**
 * Map a lesson id to the concept(s) it teaches. Unknown lesson ids return an
 * empty array so callers can degrade gracefully.
 */
export function conceptsForLessonId(lessonId: string): ConceptId[] {
  return LESSON_CONCEPTS[lessonId] ?? [];
}
