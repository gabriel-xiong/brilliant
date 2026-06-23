import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { isFirestorePermissionError } from './firebaseUtils';

export interface StepProgress {
  attempts: number;
  correctFirstAttempt: boolean;
  lastResult: 'correct' | 'incorrect' | 'unanswered';
}

export interface LessonProgress {
  lessonId: string;
  lastStepIndex: number;
  completed: boolean;
  score: number;
  masteryStatus: 'not-started' | 'in-progress' | 'mastered';
  stepAttempts: Record<string, StepProgress>;
  updatedAt: string;
}

export interface MasterySummaryEntry {
  score: number;
  status: 'not-started' | 'in-progress' | 'mastered';
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

const todayString = () => new Date().toISOString().slice(0, 10);

export function loadProgress(lessonId: string): LessonProgress | null {
  const raw = localStorage.getItem(progressStorageKeyPrefix + lessonId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LessonProgress;
  } catch {
    return null;
  }
}

export function saveProgress(progress: LessonProgress) {
  localStorage.setItem(progressStorageKeyPrefix + progress.lessonId, JSON.stringify(progress));
}

export function initializeProgress(lessonId: string): LessonProgress {
  return {
    lessonId,
    lastStepIndex: 0,
    completed: false,
    score: 0,
    masteryStatus: 'not-started',
    stepAttempts: {},
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

  return loadProgress(lessonId);
}

export function getProgressFallbackReason(error: unknown, defaultReason: string) {
  if (isFirestorePermissionError(error)) {
    return 'Firestore permission denied while loading progress. Ensure Cloud Firestore rules allow reads for authenticated users.';
  }
  return defaultReason;
}

export async function saveLessonProgress(userId: string, progress: LessonProgress) {
  if (db) {
    try {
      const progressRef = doc(db, 'users', userId, 'progress', progress.lessonId);
      await setDoc(progressRef, { ...progress, updatedAt: new Date().toISOString() });
    } catch (error) {
      console.warn('Failed to save lesson progress to Firestore, saving locally instead.', error);
    }
  }

  saveProgress(progress);
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

export async function updateUserStreak(userId: string, activeDate: string = todayString()): Promise<UserSummary | null> {
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
        const yesterday = new Date(new Date(activeDate).getTime() - 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
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
