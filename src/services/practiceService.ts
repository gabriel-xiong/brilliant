/**
 * Adaptive difficulty helpers for the generated-problem surfaces (practice +
 * exam). Pure functions only — no React, no Firebase, no AI. Difficulty is
 * derived from the learner's mastery of the lesson that teaches a concept, then
 * nudged up/down within a session as they answer.
 */
import { ALL_CONCEPTS, conceptsForLessonId } from './ai/conceptSchemas';
import type { ConceptId, Difficulty, DifficultyBand } from './ai/types';
import type { MasterySummaryEntry, PracticeConceptStat, UserSummary } from './progressService';

type MasteryStatus = MasterySummaryEntry['status'];
export type ConceptReadinessStatus = 'needs-practice' | 'proficient' | 'mastered';

export interface ConceptPracticeSignal {
  status: ConceptReadinessStatus;
  label: 'Needs practice' | 'Proficient' | 'Mastered';
  detail: string;
  dueForReview: boolean;
  dueReason: string;
  answered: number;
  accuracy: number | null;
  bestLevel: number | null;
  lastPracticed: string | null;
  nextReviewAt: string | null;
}

export type ReviewRecommendationReason =
  | 'recent-misses'
  | 'due'
  | 'low-accuracy'
  | 'needs-evidence'
  | 'new'
  | 'keep-fresh';

export interface ReviewConceptRecommendation {
  conceptId: ConceptId;
  reason: ReviewRecommendationReason;
  detail: string;
  dueForReview: boolean;
  priorityScore: number;
  signal: ConceptPracticeSignal;
}

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
 * mastered -> challenge, proficient/completed/almost-done -> core, everything else -> intro.
 */
export function difficultyForStatus(status: MasteryStatus | undefined): Difficulty {
  switch (status) {
    case 'mastered':
      return 'challenge';
    case 'proficient':
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

function lessonIdForPracticeConcept(conceptId: ConceptId): string | null {
  return LESSON_IDS_IN_ORDER.find((id) => conceptsForLessonId(id).includes(conceptId)) ?? null;
}

function statusFromPractice(
  masteryStatus: string | null | undefined,
  answered: number,
  accuracy: number | null,
  bestLevel: number,
): ConceptReadinessStatus {
  if (masteryStatus === 'mastered' || (answered >= 5 && (accuracy ?? 0) >= 0.9 && bestLevel >= 8)) {
    return 'mastered';
  }
  if (
    masteryStatus === 'proficient' ||
    masteryStatus === 'completed' ||
    (answered >= 3 && (accuracy ?? 0) >= 0.75)
  ) {
    return 'proficient';
  }
  return 'needs-practice';
}

/**
 * Compact Phase 3 signal for practice UI. It combines lesson mastery with
 * rolling concept practice stats, then applies a simple spaced-review cadence:
 * missed/low-sample concepts are due now, accurate concepts come back later.
 */
export function conceptPracticeSignal(
  conceptId: ConceptId,
  summary: UserSummary | null | undefined,
  now = new Date(),
  masteryStatusOverride?: string | null,
): ConceptPracticeSignal {
  const reviewState = conceptReviewState(conceptId, summary, now);
  const stat = summary?.practiceStats?.[conceptId];
  const answered = reviewState.answered;
  const accuracy = reviewState.accuracy;
  const bestLevel = stat?.bestLevel ?? 0;
  const lessonId = lessonIdForPracticeConcept(conceptId);
  const masteryStatus =
    masteryStatusOverride ?? (lessonId ? summary?.masterySummary?.[lessonId]?.status : undefined);
  const status = statusFromPractice(masteryStatus, answered, accuracy, bestLevel);
  const lastPracticed = reviewState.lastPracticed ?? null;
  const dueForReview = reviewState.isDue || reviewState.recentMisses > 0;
  const label =
    status === 'mastered' ? 'Mastered' : status === 'proficient' ? 'Proficient' : 'Needs practice';
  const nextReviewAt = dueForReview ? null : reviewState.nextDueAt;

  let detail = 'Try a few recall-first problems to build the signal.';
  if (status === 'mastered') {
    detail = 'Strong accuracy at harder levels. Keep it fresh with spaced review.';
  } else if (status === 'proficient') {
    detail = 'Ready for mixed practice. A short review keeps it from fading.';
  } else if (answered > 0 && accuracy != null) {
    detail = `${Math.round(accuracy * 100)}% recent practice accuracy. Review this soon.`;
  }

  let dueReason = 'Ready for first review';
  if (reviewState.reason === 'missed-recently' || reviewState.recentMisses > 0) {
    dueReason = 'Review after recent misses';
  } else if (lastPracticed && dueForReview) {
    dueReason = 'Spaced review is due';
  } else if (nextReviewAt) {
    dueReason = 'Review later';
  }

  return {
    status,
    label,
    detail,
    dueForReview,
    dueReason,
    answered,
    accuracy,
    bestLevel: bestLevel > 0 ? bestLevel : null,
    lastPracticed,
    nextReviewAt,
  };
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

/** Return only valid ConceptIds from untrusted input, keeping order and removing duplicates. */
export function parseConceptIds(raw: unknown): ConceptId[] {
  const values =
    typeof raw === 'string'
      ? raw.split(',')
      : Array.isArray(raw)
        ? raw.flatMap((value) => (typeof value === 'string' ? value.split(',') : [value]))
        : [];
  const seen = new Set<ConceptId>();
  const concepts: ConceptId[] = [];
  values.forEach((value) => {
    const concept = typeof value === 'string' ? parseConceptId(value) : null;
    if (concept && !seen.has(concept)) {
      seen.add(concept);
      concepts.push(concept);
    }
  });
  return concepts;
}

/**
 * Normalize the multi-topic practice selection against the concepts currently
 * unlocked for the learner. At least one concept is always returned when
 * `unlocked` is non-empty, preserving the old single-topic behavior.
 */
export function normalizePracticeConceptSelection(
  requested: readonly ConceptId[],
  unlocked: readonly ConceptId[],
  fallback: ConceptId,
): ConceptId[] {
  const unlockedSet = new Set(unlocked);
  const filtered = requested.filter((concept, index) =>
    unlockedSet.has(concept) && requested.indexOf(concept) === index
  );
  if (filtered.length > 0) return filtered;
  if (unlockedSet.has(fallback)) return [fallback];
  return unlocked[0] ? [unlocked[0]] : [];
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
  /** Optional saved topic set. Older configs omit this and default from the route. */
  selectedConcepts?: ConceptId[];
}

export const DEFAULT_PRACTICE_CONFIG: PracticeConfig = {
  questionCount: 'unlimited',
  difficultyMode: 'adaptive',
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ReviewReason = 'new' | 'missed-recently' | 'due' | 'weak' | 'steady';

export interface ConceptReviewState {
  conceptId: ConceptId;
  answered: number;
  correct: number;
  accuracy: number | null;
  lastPracticed?: string;
  lastReviewed?: string;
  recentMisses: number;
  successStreak: number;
  nextDueAt: string;
  isDue: boolean;
  priorityScore: number;
  reason: ReviewReason;
}

export interface PracticeSlot {
  conceptId: ConceptId;
  level: number;
  seed: number;
  reviewState: ConceptReviewState;
}

function timeMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function boundedAccuracy(stat: PracticeConceptStat | undefined): number | null {
  if (!stat || stat.answered <= 0) return null;
  return Math.max(0, Math.min(1, stat.correct / stat.answered));
}

function estimatedRecentMisses(stat: PracticeConceptStat | undefined): number {
  if (!stat || stat.answered <= 0) return 0;
  if (Number.isFinite(stat.recentMisses)) return Math.max(0, Math.round(stat.recentMisses ?? 0));
  return Math.min(5, Math.max(0, stat.answered - stat.correct));
}

function estimatedSuccessStreak(stat: PracticeConceptStat | undefined, accuracy: number | null): number {
  if (!stat || stat.answered <= 0) return 0;
  if (Number.isFinite(stat.successStreak)) return Math.max(0, Math.round(stat.successStreak ?? 0));
  if (accuracy === null) return 0;
  if (accuracy >= 0.9) return Math.min(3, stat.correct);
  if (accuracy >= 0.75) return 1;
  return 0;
}

export function reviewDelayMs(recentMisses: number, successStreak: number): number {
  const misses = Math.max(0, Math.round(recentMisses));
  const streak = Math.max(0, Math.round(successStreak));
  if (misses >= 3) return 2 * HOUR_MS;
  if (misses === 2) return 6 * HOUR_MS;
  if (misses === 1) return 12 * HOUR_MS;
  if (streak >= 6) return 14 * DAY_MS;
  if (streak >= 4) return 7 * DAY_MS;
  if (streak >= 2) return 3 * DAY_MS;
  if (streak >= 1) return DAY_MS;
  return 12 * HOUR_MS;
}

export function conceptReviewState(
  conceptId: ConceptId,
  summary: UserSummary | null | undefined,
  now = new Date(),
): ConceptReviewState {
  const stat = summary?.practiceStats?.[conceptId];
  const answered = Math.max(0, stat?.answered ?? 0);
  const correct = Math.max(0, stat?.correct ?? 0);
  const accuracy = boundedAccuracy(stat);
  const recentMisses = estimatedRecentMisses(stat);
  const successStreak = estimatedSuccessStreak(stat, accuracy);
  const lastReviewed = stat?.lastReviewed ?? stat?.lastPracticed;
  const anchorMs = timeMs(lastReviewed);
  const nowMs = now.getTime();
  const nextDueMs = anchorMs === null ? nowMs : anchorMs + reviewDelayMs(recentMisses, successStreak);
  const isDue = nextDueMs <= nowMs;
  const weakness = accuracy === null ? 0.5 : 1 - accuracy;
  const ageDays = anchorMs === null ? 7 : Math.max(0, (nowMs - anchorMs) / DAY_MS);
  const priorityScore =
    (isDue ? (answered === 0 ? 80 : 1000) : 0) +
    recentMisses * 140 +
    weakness * 220 +
    Math.min(ageDays, 14) * 8 -
    Math.min(successStreak, 8) * 18;
  const reason: ReviewReason =
    answered === 0
      ? 'new'
      : recentMisses > 0
        ? 'missed-recently'
        : isDue
          ? 'due'
          : accuracy !== null && accuracy < 0.8
            ? 'weak'
            : 'steady';

  return {
    conceptId,
    answered,
    correct,
    accuracy,
    lastPracticed: stat?.lastPracticed,
    lastReviewed,
    recentMisses,
    successStreak,
    nextDueAt: new Date(nextDueMs).toISOString(),
    isDue,
    priorityScore,
    reason,
  };
}

export function reviewStatesForConcepts(
  concepts: readonly ConceptId[],
  summary: UserSummary | null | undefined,
  now = new Date(),
): ConceptReviewState[] {
  return concepts.map((conceptId) => conceptReviewState(conceptId, summary, now));
}

export function dueReviewConcepts(
  concepts: readonly ConceptId[],
  summary: UserSummary | null | undefined,
  now = new Date(),
): ConceptId[] {
  return reviewStatesForConcepts(concepts, summary, now)
    .filter((state) => state.isDue || state.recentMisses > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((state) => state.conceptId);
}

function recommendationRank(reason: ReviewRecommendationReason): number {
  switch (reason) {
    case 'recent-misses':
    case 'due':
      return 0;
    case 'low-accuracy':
    case 'needs-evidence':
      return 1;
    case 'new':
      return 2;
    case 'keep-fresh':
      return 3;
  }
}

function recommendationForState(
  state: ConceptReviewState,
  signal: ConceptPracticeSignal,
): ReviewConceptRecommendation {
  if (state.recentMisses > 0) {
    return {
      conceptId: state.conceptId,
      reason: 'recent-misses',
      detail: 'Recommended because recent misses make this worth reviewing now.',
      dueForReview: true,
      priorityScore: state.priorityScore,
      signal,
    };
  }
  if (state.isDue && state.answered > 0) {
    return {
      conceptId: state.conceptId,
      reason: 'due',
      detail: 'Recommended because spaced review is due.',
      dueForReview: true,
      priorityScore: state.priorityScore,
      signal,
    };
  }
  if (state.accuracy !== null && state.accuracy < 0.8) {
    return {
      conceptId: state.conceptId,
      reason: 'low-accuracy',
      detail: 'Recommended because recent accuracy is below the mastery goal.',
      dueForReview: false,
      priorityScore: state.priorityScore,
      signal,
    };
  }
  if (state.answered > 0 && state.answered < 3) {
    return {
      conceptId: state.conceptId,
      reason: 'needs-evidence',
      detail: 'Recommended because a few more questions will give a clearer signal.',
      dueForReview: false,
      priorityScore: state.priorityScore,
      signal,
    };
  }
  if (state.answered === 0) {
    return {
      conceptId: state.conceptId,
      reason: 'new',
      detail: 'Recommended because this unlocked topic needs first practice.',
      dueForReview: false,
      priorityScore: state.priorityScore,
      signal,
    };
  }
  return {
    conceptId: state.conceptId,
    reason: 'keep-fresh',
    detail: 'Recommended to keep this skill fresh.',
    dueForReview: false,
    priorityScore: state.priorityScore,
    signal,
  };
}

export function recommendedReviewConcepts(
  concepts: readonly ConceptId[],
  summary: UserSummary | null | undefined,
  now = new Date(),
  masteryStatusForConcept: (conceptId: ConceptId) => string | null | undefined = () => undefined,
  maxCount = 3,
): ReviewConceptRecommendation[] {
  return reviewStatesForConcepts(concepts, summary, now)
    .map((state) =>
      recommendationForState(
        state,
        conceptPracticeSignal(state.conceptId, summary, now, masteryStatusForConcept(state.conceptId)),
      ),
    )
    .sort((a, b) => {
      const rankDiff = recommendationRank(a.reason) - recommendationRank(b.reason);
      if (rankDiff !== 0) return rankDiff;
      return b.priorityScore - a.priorityScore;
    })
    .slice(0, Math.max(1, Math.round(maxCount)));
}

export function orderPracticeConceptsForSession(
  concepts: readonly ConceptId[],
  summary: UserSummary | null | undefined,
  now = new Date(),
): ConceptId[] {
  return reviewStatesForConcepts(concepts, summary, now)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .map((state) => state.conceptId);
}

function slotWeight(state: ConceptReviewState): number {
  if (state.answered === 0) return 1;
  if (state.recentMisses > 0 || state.isDue) return 3;
  if (state.accuracy !== null && state.accuracy < 0.8) return 2;
  return 1;
}

export function buildPracticeSessionSlots(
  concepts: readonly ConceptId[],
  summary: UserSummary | null | undefined,
  baseSeed = 1,
  config: PracticeConfig = DEFAULT_PRACTICE_CONFIG,
  now = new Date(),
): PracticeSlot[] {
  const states = reviewStatesForConcepts(concepts, summary, now).sort((a, b) => b.priorityScore - a.priorityScore);
  if (states.length === 0) return [];

  const targetCount =
    config.questionCount === 'unlimited'
      ? states.length
      : Math.max(1, Math.round(config.questionCount));
  const used = new Map<ConceptId, number>();
  const slots: PracticeSlot[] = [];

  for (let index = 0; index < targetCount; index += 1) {
    const previous = slots[index - 1]?.conceptId;
    const pick =
      states
        .filter((state) => states.length === 1 || state.conceptId !== previous)
        .sort((a, b) => {
          const aUse = used.get(a.conceptId) ?? 0;
          const bUse = used.get(b.conceptId) ?? 0;
          const aRatio = aUse / slotWeight(a);
          const bRatio = bUse / slotWeight(b);
          if (aRatio !== bRatio) return aRatio - bRatio;
          return b.priorityScore - a.priorityScore;
        })[0] ?? states[0];

    used.set(pick.conceptId, (used.get(pick.conceptId) ?? 0) + 1);
    slots.push({
      conceptId: pick.conceptId,
      level: startLevelForMode(config.difficultyMode, pick.conceptId, summary),
      seed: baseSeed + index,
      reviewState: pick,
    });
  }

  return slots;
}

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
