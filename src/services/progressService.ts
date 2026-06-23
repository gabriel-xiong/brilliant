import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Lesson } from '../models/lesson';
import { db } from '../firebase';
import { isFirestorePermissionError } from './firebaseUtils';

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

export interface UserSummary {
  displayName?: string | null;
  email?: string | null;
  createdAt?: string;
  lastLoginAt?: string;
  lastActiveDate: string;
  currentStreak: number;
  longestStreak: number;
  masterySummary: Record<string, MasterySummaryEntry>;
}

const progressStorageKeyPrefix = 'brilliant-progress-';

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
  const raw = localStorage.getItem(progressLocalKey(lessonId, userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LessonProgress;
  } catch {
    return null;
  }
}

export function saveProgress(progress: LessonProgress, userId?: string) {
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
  completed: boolean
): LessonProgress {
  const problemSteps = lesson.steps.filter((step) => step.type === 'problem');
  const correctFirstAttemptCount = problemSteps.filter(
    (step) => stepAttempts[step.stepId]?.correctFirstAttempt
  ).length;
  const firstAttemptAccuracy = problemSteps.length > 0 ? correctFirstAttemptCount / problemSteps.length : 0;
  const answeredProblemCount = problemSteps.filter((step) => stepAttempts[step.stepId]?.lastResult === 'correct').length;
  const lessonProgressRatio = Math.max(lastStepIndex / Math.max(lesson.steps.length - 1, 1), answeredProblemCount / Math.max(problemSteps.length, 1));
  const masteryStatus = completed
    ? firstAttemptAccuracy >= lesson.masteryCriteria.minFirstAttemptAccuracy
      ? 'mastered'
      : 'completed'
    : lessonProgressRatio >= 0.66
      ? 'almost-done'
      : lessonProgressRatio > 0
        ? 'in-progress'
        : 'not-started';

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

export function getProgressFallbackReason(error: unknown, defaultReason: string) {
  if (isFirestorePermissionError(error)) {
    return 'Firestore permission denied while loading progress. Ensure Cloud Firestore rules allow reads for authenticated users.';
  }
  return defaultReason;
}

export async function saveLessonProgress(userId: string, progress: LessonProgress) {
  if (db && userId) {
    try {
      const progressRef = doc(db, 'users', userId, 'progress', progress.lessonId);
      await setDoc(progressRef, { ...progress, updatedAt: new Date().toISOString() });
    } catch (error) {
      console.warn('Failed to save lesson progress to Firestore, saving locally instead.', error);
    }
  }

  saveProgress(progress, userId || undefined);
}

export async function saveMasterySummary(userId: string, progress: LessonProgress) {
  if (!db || !progress.completed) return;

  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      {
        masterySummary: {
          [progress.lessonId]: {
            score: progress.score,
            status: progress.masteryStatus,
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
