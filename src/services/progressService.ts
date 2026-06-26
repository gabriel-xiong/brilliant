import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Lesson } from '../models/lesson';
import { db } from '../firebase';

export interface StepProgress {
  attempts: number;
  correctFirstAttempt: boolean;
  lastResult: 'correct' | 'incorrect' | 'unanswered';
}

export interface LessonProgress {
  lessonId: string;
  contentVersion?: number;
  lastStepIndex: number;
  completed: boolean;
  score: number;
  masteryStatus: 'not-started' | 'in-progress' | 'almost-done' | 'completed' | 'mastered';
  stepAttempts: Record<string, StepProgress>;
  updatedAt: string;
}

export interface MasterySummaryEntry {
  score: number;
  status: 'not-started' | 'in-progress' | 'almost-done' | 'completed' | 'mastered';
  lastUpdated: string;
}

/**
 * Rolling per-concept practice/exam performance, keyed by ConceptId. This is the
 * source of truth for the dashboard's accuracy/level stats and for seeding the
 * adaptive practice level to where the learner actually left off (rather than
 * only their lesson mastery).
 */
export interface PracticeConceptStat {
  /** Total problems answered for this concept across all sessions. */
  answered: number;
  /** Total answered correctly (first attempt). */
  correct: number;
  /** Highest difficulty level ever reached. */
  bestLevel: number;
  /** Most recent level reached (used to resume adaptive difficulty). */
  lastLevel: number;
  /** ISO timestamp of the last practiced session. */
  lastPracticed: string;
}

export interface UserSummary {
  displayName?: string | null;
  email?: string | null;
  createdAt?: string;
  lastLoginAt?: string;
  lastActiveDate: string;
  currentStreak: number;
  longestStreak: number;
  masterySummary: Record<string, MasterySummaryEntry>;
  /** Per-concept practice/exam stats (absent until the learner practices). */
  practiceStats?: Record<string, PracticeConceptStat>;
}

const progressStorageKeyPrefix = 'brilliant-progress-';

/**
 * Anonymous/guest progress is kept in memory for the lifetime of the page only.
 * It deliberately survives in-session navigation (the module instance is shared
 * across route changes) but is wiped by a hard refresh (the module is
 * re-evaluated), so a signed-out reload always starts from the initial state.
 * Signed-in progress is never stored here — it uses Firestore plus a
 * user-scoped localStorage cache.
 */
const guestProgressStore = new Map<string, LessonProgress>();

/**
 * Wipe any guest progress so a signed-out session starts clean. Clears the
 * in-memory session store and removes any *legacy* guest records that older
 * builds persisted to localStorage. Only keys that exactly match the
 * non-user-scoped guest format (`<prefix><lessonId>`) are removed, so a
 * returning signed-in user's user-scoped cache is never touched. Safe to call
 * on startup once auth has resolved to signed-out.
 */
export function clearGuestProgress(): void {
  guestProgressStore.clear();

  if (typeof localStorage === 'undefined') return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(progressStorageKeyPrefix)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as LessonProgress;
      // A guest key is exactly `<prefix><lessonId>`; a user key carries the uid
      // as an extra segment, so this comparison never matches a user record.
      if (parsed?.lessonId && key === `${progressStorageKeyPrefix}${parsed.lessonId}`) {
        keysToRemove.push(key);
      }
    } catch {
      // Unparseable value: leave it alone rather than risk removing user data.
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

type MasteryStatus = LessonProgress['masteryStatus'];

/**
 * Monotonic ordering for mastery progression. A higher rank must never be
 * downgraded by a later, lower-scoring attempt. `locked` is included for
 * completeness even though it is not a persisted `masteryStatus` value.
 */
const masteryStatusRank: Record<string, number> = {
  locked: -1,
  'not-started': 0,
  'in-progress': 1,
  'almost-done': 2,
  completed: 3,
  mastered: 4,
};

function masteryRank(status: string | null | undefined): number {
  if (!status) return 0;
  return masteryStatusRank[status] ?? 0;
}

/**
 * Returns whichever status sits higher on the mastery ladder, so callers can
 * keep the best status a learner has ever reached. Tolerant of unknown/legacy
 * strings (treated as the floor) to avoid accidentally clobbering real values.
 */
export function maxMasteryStatus(a: MasteryStatus, b: MasteryStatus): MasteryStatus {
  return masteryRank(a) >= masteryRank(b) ? a : b;
}

/**
 * Merge a freshly computed progress record with the learner's previously stored
 * record so mastery is sticky: status can only ever move up the ladder, the
 * completed flag latches on, and the recorded score keeps its peak value.
 */
export function applyStickyMastery(
  next: LessonProgress,
  previous: LessonProgress | null | undefined
): LessonProgress {
  if (!previous) return next;
  return {
    ...next,
    masteryStatus: maxMasteryStatus(next.masteryStatus, previous.masteryStatus),
    completed: next.completed || previous.completed,
    score: Math.max(next.score ?? 0, previous.score ?? 0),
  };
}

export const localDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function previousLocalDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return localDateString(date);
}

function progressLocalKey(lessonId: string, userId?: string) {
  return userId
    ? `${progressStorageKeyPrefix}${userId}-${lessonId}`
    : `${progressStorageKeyPrefix}${lessonId}`;
}

export function loadProgress(lessonId: string, userId?: string): LessonProgress | null {
  // Guests read from the in-memory session store so nothing persists across a
  // reload; signed-in learners use their user-scoped localStorage cache.
  if (!userId) {
    return guestProgressStore.get(lessonId) ?? null;
  }
  const raw = localStorage.getItem(progressLocalKey(lessonId, userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LessonProgress;
  } catch {
    return null;
  }
}

export function saveProgress(progress: LessonProgress, userId?: string) {
  // Guest progress is session-only (in memory); signed-in progress is cached in
  // localStorage alongside the Firestore record.
  if (!userId) {
    guestProgressStore.set(progress.lessonId, progress);
    return;
  }
  localStorage.setItem(progressLocalKey(progress.lessonId, userId), JSON.stringify(progress));
}

export function initializeProgress(lessonId: string, contentVersion?: number): LessonProgress {
  return {
    lessonId,
    contentVersion,
    lastStepIndex: 0,
    completed: false,
    score: 0,
    masteryStatus: 'not-started',
    stepAttempts: {},
    updatedAt: new Date().toISOString(),
  };
}

export function calculateLessonProgress(
  lesson: Lesson,
  stepAttempts: Record<string, StepProgress>,
  lastStepIndex: number,
  completed: boolean,
  previousStatus?: MasteryStatus
): LessonProgress {
  const problemSteps = lesson.steps.filter((step) => step.type === 'problem');
  const correctFirstAttemptCount = problemSteps.filter(
    (step) => stepAttempts[step.stepId]?.correctFirstAttempt
  ).length;
  const firstAttemptAccuracy = problemSteps.length > 0 ? correctFirstAttemptCount / problemSteps.length : 0;
  const answeredProblemCount = problemSteps.filter((step) => stepAttempts[step.stepId]?.lastResult === 'correct').length;
  const lessonProgressRatio = Math.max(lastStepIndex / Math.max(lesson.steps.length - 1, 1), answeredProblemCount / Math.max(problemSteps.length, 1));
  const computedStatus: MasteryStatus = completed
    ? firstAttemptAccuracy >= lesson.masteryCriteria.minFirstAttemptAccuracy
      ? 'mastered'
      : 'completed'
    : lessonProgressRatio >= 0.66
      ? 'almost-done'
      : lessonProgressRatio > 0
        ? 'in-progress'
        : 'not-started';
  // Mastery is sticky: never let a later review downgrade an earned status.
  const masteryStatus = previousStatus
    ? maxMasteryStatus(computedStatus, previousStatus)
    : computedStatus;

  return {
    lessonId: lesson.lessonId,
    contentVersion: lesson.contentVersion,
    lastStepIndex,
    completed,
    score: firstAttemptAccuracy,
    masteryStatus,
    stepAttempts,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadLessonProgress(userId: string, lessonId: string): Promise<LessonProgress | null> {
  if (db) {
    try {
      const progressRef = doc(db, 'users', userId, 'progress', lessonId);
      const snapshot = await getDoc(progressRef);
      if (snapshot.exists()) {
        return snapshot.data() as LessonProgress;
      }
    } catch (error) {
      console.warn('Failed to load lesson progress from Firestore, falling back to local storage.', error);
    }
  }

  return loadProgress(lessonId, userId);
}
export async function saveLessonProgress(userId: string, progress: LessonProgress) {
  // Establish the learner's previously stored high-water mark so a replay can
  // never persist a downgraded mastery status. Local storage is always kept in
  // sync; for signed-in learners we also consult the Firestore record so a
  // mastery earned on another device is respected.
  let existing: LessonProgress | null = loadProgress(progress.lessonId, userId || undefined);

  if (db && userId) {
    try {
      const progressRef = doc(db, 'users', userId, 'progress', progress.lessonId);
      const snapshot = await getDoc(progressRef);
      if (snapshot.exists()) {
        const remote = snapshot.data() as LessonProgress;
        existing = existing ? applyStickyMastery(existing, remote) : remote;
      }
    } catch (error) {
      console.warn('Failed to read existing lesson progress before saving, using local copy.', error);
    }
  }

  const sticky = applyStickyMastery(progress, existing);

  if (db && userId) {
    try {
      const progressRef = doc(db, 'users', userId, 'progress', sticky.lessonId);
      await setDoc(progressRef, { ...sticky, updatedAt: new Date().toISOString() });
    } catch (error) {
      console.warn('Failed to save lesson progress to Firestore, saving locally instead.', error);
    }
  }

  saveProgress(sticky, userId || undefined);
}

export async function saveMasterySummary(userId: string, progress: LessonProgress) {
  if (!db || !progress.completed) return;

  try {
    const userRef = doc(db, 'users', userId);

    // Keep the course-map summary sticky too: clamp against any existing entry
    // so reviewing a mastered lesson can never lower its course-map status.
    let status = progress.masteryStatus;
    let score = progress.score;
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      const existing = (snapshot.data() as UserSummary).masterySummary?.[progress.lessonId];
      if (existing) {
        status = maxMasteryStatus(progress.masteryStatus, existing.status);
        score = Math.max(progress.score ?? 0, existing.score ?? 0);
      }
    }

    await setDoc(
      userRef,
      {
        masterySummary: {
          [progress.lessonId]: {
            score,
            status,
            lastUpdated: new Date().toISOString(),
          },
        },
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Failed to save mastery summary in Firestore.', error);
  }
}

/**
 * Accumulate a practice/exam result for one concept into the user summary:
 * adds to the answered/correct totals, keeps the highest level ever reached,
 * records the most recent level (so adaptive difficulty resumes there), and
 * stamps the time. No-op for guests or when Firestore is unavailable, since
 * guest summaries are not persisted.
 */
export async function recordPracticeResult(
  userId: string,
  conceptId: string,
  result: { answered: number; correct: number; levelReached: number },
): Promise<void> {
  if (!db || !userId || result.answered <= 0) return;
  try {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);
    const existing = snapshot.exists()
      ? (snapshot.data() as UserSummary).practiceStats?.[conceptId]
      : undefined;
    const merged: PracticeConceptStat = {
      answered: (existing?.answered ?? 0) + result.answered,
      correct: (existing?.correct ?? 0) + result.correct,
      bestLevel: Math.max(existing?.bestLevel ?? 0, result.levelReached),
      lastLevel: result.levelReached,
      lastPracticed: new Date().toISOString(),
    };
    await setDoc(userRef, { practiceStats: { [conceptId]: merged } }, { merge: true });
  } catch (error) {
    console.warn('Failed to record practice result in Firestore.', error);
  }
}

export async function loadUserSummary(userId: string): Promise<UserSummary | null> {
  if (!db) return null;
  try {
    const userRef = doc(db, 'users', userId);
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
      return snapshot.data() as UserSummary;
    }
  } catch (error) {
    console.warn('Failed to load user summary from Firestore.', error);
  }
  return null;
}

export async function updateUserStreak(userId: string, activeDate: string = localDateString()): Promise<UserSummary | null> {
  if (!db) return null;

  const userRef = doc(db, 'users', userId);
  try {
    const snapshot = await getDoc(userRef);
    let summary: UserSummary;

    if (!snapshot.exists()) {
      summary = {
        lastActiveDate: activeDate,
        currentStreak: 1,
        longestStreak: 1,
        masterySummary: {},
      };
    } else {
      const existing = snapshot.data() as UserSummary;
      const previousDate = existing.lastActiveDate;
      let currentStreak = existing.currentStreak ?? 0;
      let longestStreak = existing.longestStreak ?? 0;

      if (previousDate === activeDate) {
        // no change
      } else {
        const yesterday = previousLocalDateString(activeDate);
        if (previousDate === yesterday) {
          currentStreak += 1;
        } else {
          currentStreak = 1;
        }
        longestStreak = Math.max(longestStreak, currentStreak);
      }

      summary = {
        ...existing,
        lastActiveDate: activeDate,
        currentStreak,
        longestStreak,
      };
    }

    await setDoc(userRef, {
      ...summary,
      lastLoginAt: serverTimestamp(),
    }, { merge: true });

    return summary;
  } catch (error) {
    console.warn('Failed to update user streak in Firestore.', error);
    return null;
  }
}
