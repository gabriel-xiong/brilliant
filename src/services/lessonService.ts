import { doc, getDoc, collection, getDocs, setDoc, CollectionReference, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { introBasicProbabilityLesson, Lesson } from '../models/lesson';
import { getFirestoreFallbackReason } from './firebaseUtils';

export interface FetchLessonResult {
  lesson: Lesson | null;
  fallbackUsed: boolean;
  reason?: string;
}

export interface FetchAllLessonsResult {
  lessons: Lesson[];
  fallbackUsed: boolean;
  reason?: string;
}

async function parseLessonSnapshot(lessonId: string, data: any): Promise<Lesson | null> {
  if (!data) return null;
  return { ...data, lessonId } as Lesson;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`${label} timed out after ${timeoutMs}ms, falling back to local data.`);
      resolve(fallback);
    }, timeoutMs);
  });

  const result = await Promise.race([promise, timeoutPromise]);
  if (timeoutId) clearTimeout(timeoutId);
  return result;
}

function localLessonResult(lessonId: string, reason: string): FetchLessonResult {
  return {
    lesson: lessonId === introBasicProbabilityLesson.lessonId ? introBasicProbabilityLesson : null,
    fallbackUsed: true,
    reason,
  };
}

export async function fetchLesson(lessonId: string): Promise<FetchLessonResult> {
  if (db) {
    try {
      const lessonRef = doc(db, 'lessons', lessonId);
      const snapshot = await withTimeout(
        getDoc(lessonRef),
        3000,
        null as any,
        'fetchLesson'
      );
      if (snapshot && snapshot.exists()) {
        const lesson = await parseLessonSnapshot(lessonId, snapshot.data());
        return { lesson, fallbackUsed: false };
      }

      if (lessonId === introBasicProbabilityLesson.lessonId) {
        try {
          await setDoc(doc(db, 'lessons', lessonId), introBasicProbabilityLesson);
          return { lesson: introBasicProbabilityLesson, fallbackUsed: false };
        } catch (writeError) {
          console.warn('Failed to create lesson in Firestore, using local lesson fallback.', writeError);
          return {
            lesson: introBasicProbabilityLesson,
            fallbackUsed: true,
            reason: getFirestoreFallbackReason(writeError, 'Firestore lesson was unavailable, showing the local lesson.'),
          };
        }
      }
    } catch (error) {
      console.warn('Failed to read lesson from Firestore, falling back to local lesson.', error);
      return localLessonResult(
        lessonId,
        getFirestoreFallbackReason(error, 'Failed to read lesson from Firestore; using local fallback.')
      );
    }
  }

  return localLessonResult(lessonId, 'Firebase is not configured; using local fallback.');
}

export async function fetchAllLessons(): Promise<FetchAllLessonsResult> {
  if (db) {
    try {
      const lessonsCollection = collection(db, 'lessons') as CollectionReference<Lesson>;
      const snapshot = await withTimeout(
        getDocs(lessonsCollection),
        3000,
        null as any,
        'fetchAllLessons'
      );
      if (snapshot && !snapshot.empty) {
        return {
          lessons: snapshot.docs.map((docSnap: QueryDocumentSnapshot<Lesson>) => ({ ...docSnap.data(), lessonId: docSnap.id } as Lesson)),
          fallbackUsed: false,
        };
      }

      return {
        lessons: [introBasicProbabilityLesson],
        fallbackUsed: true,
        reason: 'No lessons were available from Firestore; showing the local lesson path.',
      };
    } catch (error) {
      console.warn('Failed to load lessons from Firestore, falling back to local lesson list.', error);
      return {
        lessons: [introBasicProbabilityLesson],
        fallbackUsed: true,
        reason: getFirestoreFallbackReason(error, 'Failed to load lessons from Firestore; using local fallback.'),
      };
    }
  }

  return {
    lessons: [introBasicProbabilityLesson],
    fallbackUsed: true,
    reason: 'Firebase is not configured; using local lesson path.',
  };
}
