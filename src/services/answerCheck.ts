import type { QuestionStage } from '../models/lesson';

/**
 * Default tolerance for comparing numeric answers. Chosen so that common
 * rounded equivalents match (e.g. 2/6 ≈ 0.3333 vs "33%" = 0.33, a gap of
 * ~0.0033) while genuinely different answers (0.5 vs 0.4) are rejected.
 */
export const DEFAULT_NUMERIC_EPSILON = 0.02;

const PERCENT_PATTERN = /^([+-]?\d*\.?\d+)\s*%$/;
const FRACTION_PATTERN = /^([+-]?\d*\.?\d+)\s*\/\s*([+-]?\d*\.?\d+)$/;
const DECIMAL_PATTERN = /^([+-]?\d*\.?\d+)$/;

/**
 * Parse a learner-entered numeric answer that may be written as a fraction
 * ("1/2"), a decimal ("0.5", ".5"), or a percent ("50%", "50 %"). Returns the
 * value as a plain number (percents are divided by 100), or `null` when the
 * input is empty or not a recognizable numeric form.
 */
export function parseNumericValue(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const percentMatch = PERCENT_PATTERN.exec(trimmed);
  if (percentMatch) {
    const value = Number(percentMatch[1]);
    return Number.isFinite(value) ? value / 100 : null;
  }

  const fractionMatch = FRACTION_PATTERN.exec(trimmed);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }
    return numerator / denominator;
  }

  const decimalMatch = DECIMAL_PATTERN.exec(trimmed);
  if (decimalMatch) {
    const value = Number(decimalMatch[1]);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

/**
 * Returns true when the learner's input is numerically equivalent to the
 * accepted answer within `epsilon`. Both sides are parsed tolerantly so that
 * fractions, decimals, and percents are treated as equal when they represent
 * the same value. Unparseable input never matches.
 */
export function numericAnswersMatch(
  input: string,
  accepted: string,
  epsilon: number = DEFAULT_NUMERIC_EPSILON
): boolean {
  const left = parseNumericValue(input);
  const right = parseNumericValue(accepted);
  if (left === null || right === null) return false;
  return Math.abs(left - right) <= epsilon;
}

/**
 * Grade a single multi-stage question stage. Free-response stages use tolerant
 * numeric matching; multiple-choice stages compare the selected value.
 */
export function isStageCorrect(stage: QuestionStage, answer: string): boolean {
  if (stage.format === 'free-response') {
    return numericAnswersMatch(answer, stage.acceptedAnswer ?? '', stage.tolerance);
  }
  return answer === stage.answer;
}

/**
 * Serialize a `sort` placement (item id → bucket id) into the string the lesson
 * player submits as the answer. Keys are sorted so the same placement always
 * produces the same string (used for restore/reveal).
 */
export function serializeSortAnswer(assignment: Record<string, string>): string {
  const ordered: Record<string, string> = {};
  for (const key of Object.keys(assignment).sort()) {
    ordered[key] = assignment[key];
  }
  return JSON.stringify(ordered);
}

/** Serialize an `order` arrangement (list of item ids) into the submitted answer. */
export function serializeOrderAnswer(order: string[]): string {
  return JSON.stringify(order);
}

/** Parse a serialized `sort` placement back into an item id → bucket id map. */
export function parseSortAnswer(raw: string): Record<string, string> {
  return parseRecord(raw) ?? {};
}

/** Parse a serialized `order` arrangement back into a list of item ids. */
export function parseOrderAnswer(raw: string): string[] {
  return parseStringArray(raw) ?? [];
}

function parseRecord(raw: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function parseStringArray(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed as string[];
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Returns true when a `sort` placement matches the solution exactly: every item
 * in the solution is present and assigned to its correct bucket, with no extra
 * or missing items. Unparseable input never matches.
 */
export function isSortCorrect(solution: Record<string, string>, answer: string): boolean {
  const assignment = parseRecord(answer);
  if (!assignment) return false;
  const solutionKeys = Object.keys(solution);
  if (Object.keys(assignment).length !== solutionKeys.length) return false;
  return solutionKeys.every((itemId) => assignment[itemId] === solution[itemId]);
}

/**
 * Returns true when an `order` arrangement matches the solution sequence exactly
 * (same items in the same positions). Unparseable input never matches.
 */
export function isOrderCorrect(solution: string[], answer: string): boolean {
  const order = parseStringArray(answer);
  if (!order || order.length !== solution.length) return false;
  return order.every((itemId, index) => itemId === solution[index]);
}

export interface MultiStageOutcome {
  /** Per-stage correctness for the supplied answers, in order. */
  perStage: boolean[];
  /** True only when every stage is answered correctly. */
  allCorrect: boolean;
}

/**
 * Grade an ordered list of single answers (one per stage) against the stages.
 * Useful for scoring a clean first pass: `allCorrect` reflects whether the
 * learner would have completed the question with no mistakes.
 */
export function gradeMultiStage(stages: QuestionStage[], answers: string[]): MultiStageOutcome {
  const perStage = stages.map((stage, index) => isStageCorrect(stage, answers[index] ?? ''));
  return {
    perStage,
    allCorrect: perStage.length > 0 && perStage.every(Boolean),
  };
}
