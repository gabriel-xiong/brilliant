/**
 * Canonical type contract for the "Phase 2: AI Features" foundation layer.
 *
 * This module is intentionally framework-free (no React, no Firebase). It only
 * declares the shared shapes that the deterministic solver, the AI client, and
 * the React UI all agree on. Keeping these in one place lets parallel agents
 * depend on a single source of truth.
 */

/**
 * The probability concepts the course can solve and generate problems for.
 * Each id maps to one deterministic solver branch in `conceptSchemas.ts`.
 */
export type ConceptId =
  | 'single-event' // P = favorable/total (dice/coin)
  | 'complement' // P(not E) = 1 - P(E)
  | 'and-multiply' // independent AND: P(A and B) = P(A)*P(B)
  | 'or-inclusion-exclusion' // P(A or B) = P(A)+P(B)-P(A and B)
  | 'conditional' // P(A|B) = count(A and B)/count(B)
  | 'expected-value' // E[X] = sum x*p(x)
  | 'bayes'; // P(H|E) = P(E|H)P(H) / P(E)

/**
 * Legacy difficulty band that controls how clean/large generated numbers are.
 * Retained for backwards compatibility (the exam + URL params still speak in
 * bands). New code should prefer the open-ended numeric `level` below.
 */
export type Difficulty = 'intro' | 'core' | 'challenge';

/**
 * Display-only difficulty band, extended past the legacy 3-band ceiling so an
 * unbounded numeric `level` always has a friendly label. `levelToBand` (in
 * practiceService) maps a level to one of these.
 */
export type DifficultyBand = 'intro' | 'core' | 'challenge' | 'advanced' | 'expert';

/**
 * An open-ended difficulty descriptor. `level` is the single source of truth
 * (>= 1, NO upper bound); everything else is derived from it for display and
 * for scaling the magnitude of generated numbers.
 */
export interface DifficultySpec {
  /** Adaptive difficulty level, an integer >= 1 with no upper clamp. */
  level: number;
  /** Friendly band label derived from `level` (display only). */
  band: DifficultyBand;
  /** Magnitude multiplier derived from `level`; bigger = larger numbers. */
  magnitude: number;
}

/**
 * One human-readable line of a worked solution. `value` is always an EXACT
 * string produced by math.js (e.g. "2", "1/3"), never a rounded float.
 */
export interface SolutionStep {
  label: string;
  value: string;
}

/** The deterministic solver's output: the single source of truth for answers. */
export interface SolverResult {
  /** Exact reduced fraction/integer string, e.g. "1/3", "5", "0". */
  fraction: string;
  /** Numeric value of the answer (for tolerant grading and display). */
  decimal: number;
  /** 2-4 clear, ordered steps for the worked-solution feature. */
  steps: SolutionStep[];
}

/**
 * A fully-specified, gradable problem. The solver computes the answer; the
 * prompt is deterministically templated. The AI never produces any of these
 * numbers — it may only re-skin the prose later.
 */
export interface GeneratedProblem {
  /** Stable identity: `${conceptId}-${difficulty|level}-${seed}`. */
  id: string;
  conceptId: ConceptId;
  /** Legacy band label (display); always populated even for level-based problems. */
  difficulty: Difficulty;
  /** Open-ended numeric difficulty level (>= 1). Present on all new problems. */
  level?: number;
  /** Structured params the solver consumed (also used for round-trip checks). */
  params: Record<string, number>;
  /** Deterministic, learner-facing question text. */
  prompt: string;
  /** === solution.fraction. */
  acceptedAnswer: string;
  /** === solution.decimal. */
  acceptedDecimal: number;
  /** Numeric grading tolerance (e.g. 0.02 for probabilities). */
  tolerance: number;
  /** Optional unit hint shown near the answer field (e.g. "$"). */
  unit?: string;
  /** Optional input placeholder (e.g. "e.g. 1/3 or 0.33"). */
  placeholder?: string;
  /** Exact worked solution, mirrors what the solver computed. */
  solution: SolverResult;
  /**
   * Where the SCENARIO PROSE came from. The answer key is ALWAYS deterministic
   * (computed by `solveConcept`) regardless of this value — only the story text
   * differs. `'ai'` means the model authored the prose + structured params.
   */
  source?: 'deterministic' | 'ai';
  /**
   * Reserved for Phase 2. For out-of-scope/novel problems we will allow
   * high-confidence LLM-consensus answers; this would carry that confidence
   * score. UNUSED in Phase 1 (every answer here is deterministic, i.e. 1.0).
   */
  confidence?: number;
}
