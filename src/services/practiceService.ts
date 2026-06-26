/**
 * Adaptive difficulty helpers for the generated-problem surfaces (practice +
 * exam). Pure functions only — no React, no Firebase, no AI. Difficulty is
 * derived from the learner's mastery of the lesson that teaches a concept, then
 * nudged up/down within a session as they answer.
 */
import { ALL_CONCEPTS, conceptsForLessonId } from './ai/conceptSchemas';
import type { ConceptId, Difficulty, DifficultyBand } from './ai/types';
import type { MasterySummaryEntry, UserSummary } from './progressService';

type MasteryStatus = MasterySummaryEntry['status'];

/** The 7 lesson ids, in course order, so we can map a concept back to a lesson. */
const LESSON_IDS_IN_ORDER = [
  'intro-basic-probability',
  'counting-outcomes',
  'compound-events',
  'dependent-events',
  'mutually-exclusive-events',
  'expected-value',
  'bayes-updating',
];

const DIFFICULTY_ORDER: Difficulty[] = ['intro', 'core', 'challenge'];

/** Clamp a difficulty index into the valid range. */
function clampDifficultyIndex(index: number): number {
  return Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, index));
}

/**
 * Map a lesson mastery status to a starting difficulty:
 * mastered -> challenge, completed/almost-done -> core, everything else -> intro.
 */
export function difficultyForStatus(status: MasteryStatus | undefined): Difficulty {
  switch (status) {
    case 'mastered':
      return 'challenge';
    case 'completed':
    case 'almost-done':
      return 'core';
    default:
      return 'intro';
  }
}

/**
 * Find the lesson that teaches `conceptId`, read the learner's mastery of that
 * lesson from their summary, and map it to a starting difficulty. Unknown
 * concepts or signed-out learners (no summary) default to 'intro'.
 */
export function difficultyForConcept(
  conceptId: ConceptId,
  summary: UserSummary | null | undefined,
): Difficulty {
  if (!summary?.masterySummary) return 'intro';
  const lessonId = LESSON_IDS_IN_ORDER.find((id) => conceptsForLessonId(id).includes(conceptId));
  if (!lessonId) return 'intro';
  return difficultyForStatus(summary.masterySummary[lessonId]?.status);
}

/**
 * In-session adaptive stepper. After a correct streak the difficulty ratchets
 * up; after a miss it steps down one band. Pure: returns the next difficulty
 * without any persistence.
 *
 * @param current      The difficulty just used.
 * @param wasCorrect   Whether the learner got the last problem right.
 * @param streak       Count of consecutive correct answers *including* this one
 *                     (0 after a miss). A streak of 2+ bumps difficulty up.
 */
export function nextDifficulty(
  current: Difficulty,
  wasCorrect: boolean,
  streak: number,
): Difficulty {
  const index = DIFFICULTY_ORDER.indexOf(current);
  if (!wasCorrect) {
    return DIFFICULTY_ORDER[clampDifficultyIndex(index - 1)];
  }
  // Ratchet up only on a sustained streak so a single lucky answer does not
  // immediately jump a struggling learner to challenge problems.
  if (streak >= 2) {
    return DIFFICULTY_ORDER[clampDifficultyIndex(index + 1)];
  }
  return current;
}

/** Parse a difficulty from an untrusted query-string value, or null if invalid. */
export function parseDifficulty(raw: string | null | undefined): Difficulty | null {
  return DIFFICULTY_ORDER.includes(raw as Difficulty) ? (raw as Difficulty) : null;
}

// ---------------------------------------------------------------------------
// Numeric difficulty `level` (MIN_LEVEL..MAX_LEVEL).
//
// The 3-band enum above is retained for the exam + legacy URLs, but adaptive
// practice now steps a numeric level so strong learners keep getting harder
// problems (bigger sample spaces/denominators) as they progress, up to a
// sensible ceiling (MAX_LEVEL). The starting level is still seeded from mastery
// via `difficultyForConcept`.
// ---------------------------------------------------------------------------

/** Lowest difficulty level. Adaptive practice never steps below this. */
export const MIN_LEVEL = 1;

/** Highest difficulty level. Adaptive practice never steps above this. */
export const MAX_LEVEL = 10;

/** Representative starting level for each mastery-derived band. */
const BAND_LEVEL: Record<Difficulty, number> = { intro: 1, core: 4, challenge: 8 };

/** Map a mastery-derived band to its starting numeric level (intro≈1, core≈4, challenge≈8). */
export function bandToLevel(band: Difficulty): number {
  return BAND_LEVEL[band];
}

/**
 * Friendly display band for an open-ended level. Extends past the legacy
 * `challenge` ceiling so high levels still read sensibly (advanced/expert).
 * Display only — it never feeds back into generation or grading.
 */
export function levelToBand(level: number): DifficultyBand {
  if (level <= 2) return 'intro';
  if (level <= 5) return 'core';
  if (level <= 8) return 'challenge';
  if (level <= 9) return 'advanced';
  return 'expert';
}

/** Friendly label for each display band. */
export const BAND_LABEL: Record<DifficultyBand, string> = {
  intro: 'Warm-up',
  core: 'Core',
  challenge: 'Challenge',
  advanced: 'Advanced',
  expert: 'Expert',
};

/** MUI Chip color for each display band. */
export const BAND_COLOR: Record<DifficultyBand, 'success' | 'primary' | 'warning' | 'secondary' | 'error'> = {
  intro: 'success',
  core: 'primary',
  challenge: 'warning',
  advanced: 'secondary',
  expert: 'error',
};

/**
 * Seed a learner's starting practice level. If they have practiced this concept
 * before, resume at the level they last reached (clamped) so progress carries
 * across sessions; otherwise fall back to the mastery-derived band
 * (intro≈1, core≈4, challenge≈8).
 */
export function levelForConcept(
  conceptId: ConceptId,
  summary: UserSummary | null | undefined,
): number {
  const stat = summary?.practiceStats?.[conceptId];
  if (stat && stat.answered > 0 && Number.isFinite(stat.lastLevel) && stat.lastLevel >= MIN_LEVEL) {
    return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(stat.lastLevel)));
  }
  return bandToLevel(difficultyForConcept(conceptId, summary));
}

/**
 * In-session adaptive stepper on the numeric level. A sustained streak ratchets
 * the level UP (with a bigger jump on longer streaks); a miss steps it DOWN one.
 * Floored at {@link MIN_LEVEL} and capped at {@link MAX_LEVEL}. Pure: returns the
 * next level only.
 *
 * @param level      The level just used.
 * @param wasCorrect Whether the learner got the last problem right.
 * @param streak     Consecutive correct answers *including* this one (0 after a
 *                   miss). A streak of 2+ steps up; 4+ jumps by 2; 6+ by 3.
 */
export function nextLevel(level: number, wasCorrect: boolean, streak: number): number {
  const current = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)));
  if (!wasCorrect) {
    return Math.max(MIN_LEVEL, current - 1);
  }
  if (streak >= 2) {
    const jump = streak >= 6 ? 3 : streak >= 4 ? 2 : 1;
    return Math.min(MAX_LEVEL, current + jump);
  }
  return current;
}

/** Parse a concept id from an untrusted query-string value, or null if invalid. */
export function parseConceptId(raw: string | null | undefined): ConceptId | null {
  return ALL_CONCEPTS.includes(raw as ConceptId) ? (raw as ConceptId) : null;
}

/**
 * The learner's weakest concept — the one whose teaching lesson has the lowest
 * mastery rank. Used to default the practice surface to where help is most
 * useful. Falls back to the first concept for signed-out/empty learners.
 */
export function weakestConcept(summary: UserSummary | null | undefined): ConceptId {
  const rank: Record<string, number> = {
    'not-started': 0,
    'in-progress': 1,
    'almost-done': 2,
    completed: 3,
    mastered: 4,
  };
  let weakest: ConceptId = ALL_CONCEPTS[0];
  let weakestScore = Infinity;
  for (const conceptId of ALL_CONCEPTS) {
    const lessonId = LESSON_IDS_IN_ORDER.find((id) => conceptsForLessonId(id).includes(conceptId));
    const status = lessonId ? summary?.masterySummary?.[lessonId]?.status : undefined;
    const masteryScore = rank[status ?? 'not-started'] ?? 0;
    // Within the same mastery tier, a concept the learner practices with low
    // accuracy is "weaker". Unpracticed concepts assume full accuracy so they
    // are not flagged as weak purely for lack of data.
    const stat = summary?.practiceStats?.[conceptId];
    const accuracy = stat && stat.answered > 0 ? stat.correct / stat.answered : 1;
    const score = masteryScore * 1000 + Math.round(accuracy * 100);
    if (score < weakestScore) {
      weakestScore = score;
      weakest = conceptId;
    }
  }
  return weakest;
}

/** Clamp any number into the valid difficulty range [MIN_LEVEL, MAX_LEVEL]. */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)));
}

// ---------------------------------------------------------------------------
// Learner-configurable sessions (practice + exam).
//
// A session is described by how MANY questions to serve and at what DIFFICULTY.
// Difficulty is either 'adaptive' (seed from mastery, then step with nextLevel)
// or a fixed numeric level the learner pins. Practice additionally supports an
// 'unlimited' length; the graded exam is always finite.
// ---------------------------------------------------------------------------

/** How a session chooses difficulty: auto-adapt, or hold a fixed level. */
export type DifficultyMode = 'adaptive' | number;

/** Suggested question-count presets for the picker UI. */
export const PRACTICE_COUNT_PRESETS = [5, 10, 20] as const;
export const EXAM_COUNT_PRESETS = [5, 7, 10, 15] as const;

/** A configured practice session: a length (or unlimited) + a difficulty mode. */
export interface PracticeConfig {
  /** Number of questions to serve, or 'unlimited' to keep going indefinitely. */
  questionCount: number | 'unlimited';
  /** 'adaptive' auto-adjusts difficulty; a number pins a fixed level. */
  difficultyMode: DifficultyMode;
}

export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  questionCount: 'unlimited',
  difficultyMode: 'adaptive',
};

/** A configured exam: a finite length + a difficulty mode (no 'unlimited'). */
export interface ExamConfig {
  /** Number of questions on the paper (>= 1). Defaults to the 7-concept set. */
  questionCount: number;
  /** 'adaptive' pitches each slot to mastery; a number pins a fixed level. */
  difficultyMode: DifficultyMode;
}

export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  questionCount: ALL_CONCEPTS.length,
  difficultyMode: 'adaptive',
};

/**
 * The next difficulty for an in-session step, honoring the chosen mode. In
 * 'adaptive' mode this is {@link nextLevel}; with a pinned level it stays put.
 */
export function nextLevelForMode(
  mode: DifficultyMode,
  level: number,
  wasCorrect: boolean,
  streak: number,
): number {
  if (mode === 'adaptive') return nextLevel(level, wasCorrect, streak);
  return clampLevel(mode);
}

/** The starting level for a concept under a given difficulty mode. */
export function startLevelForMode(
  mode: DifficultyMode,
  conceptId: ConceptId,
  summary: UserSummary | null | undefined,
): number {
  return mode === 'adaptive' ? levelForConcept(conceptId, summary) : clampLevel(mode);
}

/** A single exam question slot: a concept paired with its chosen difficulty. */
export interface ExamSlot {
  conceptId: ConceptId;
  /** A mastery-derived band, or a fixed numeric level — both feed generateProblem. */
  difficulty: Difficulty | number;
  seed: number;
}

/**
 * Build an exam paper of `config.questionCount` slots. With the default config
 * (7 questions, adaptive) this is one problem per concept pitched to mastery —
 * identical to the original behavior. Larger/smaller counts round-robin across
 * the 7 concepts; a pinned `difficultyMode` fixes every slot's level. Always
 * deterministic for a given (summary, baseSeed, config) so a re-render never
 * reshuffles the paper.
 */
export function buildExamSlots(
  summary: UserSummary | null | undefined,
  baseSeed = 1,
  config: ExamConfig = DEFAULT_EXAM_CONFIG,
): ExamSlot[] {
  const count = Math.max(1, Math.round(config.questionCount));
  const mode = config.difficultyMode;
  return Array.from({ length: count }, (_unused, index) => {
    const conceptId = ALL_CONCEPTS[index % ALL_CONCEPTS.length];
    const difficulty: Difficulty | number =
      mode === 'adaptive' ? difficultyForConcept(conceptId, summary) : clampLevel(mode);
    return { conceptId, difficulty, seed: baseSeed + index * 101 };
  });
}
