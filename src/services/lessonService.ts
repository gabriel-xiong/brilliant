import { doc, getDoc, collection, getDocs, setDoc, CollectionReference, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { allLessons, Lesson } from '../models/lesson';
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

const localLessonsById = new Map(allLessons.map((lesson) => [lesson.lessonId, lesson]));

function normalizeLesson(lesson: Lesson): Lesson {
  const localLesson = localLessonsById.get(lesson.lessonId);
  if (!localLesson) return lesson;

  return {
    ...lesson,
    order: localLesson.order,
  };
}

function sortLessons(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort((a, b) => {
    const aOrder = a.order ?? localLessonsById.get(a.lessonId)?.order ?? 999;
    const bOrder = b.order ?? localLessonsById.get(b.lessonId)?.order ?? 999;
    return aOrder - bOrder;
  });
}

async function maybeRefreshLocalLesson(lessonId: string, lesson: Lesson): Promise<FetchLessonResult | null> {
  const localLesson = localLessonsById.get(lessonId);
  if (!localLesson) return null;

  const savedVersion = lesson.contentVersion ?? 1;
  if (savedVersion >= localLesson.contentVersion) return null;

  if (db) {
    withTimeout(
      setDoc(doc(db, 'lessons', lessonId), localLesson, { merge: true }),
      3000,
      undefined,
      'maybeRefreshLocalLesson:write'
    ).catch((error) => {
      console.warn('Firestore has an older lesson; using local upgraded lesson for this session.', error);
    });
  }

  return {
    lesson: localLesson,
    fallbackUsed: true,
    reason: 'Showing the upgraded local lesson because Firestore still has an older version. Re-run npm run seed:firestore to update the stored lesson.',
  };
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
    lesson: localLessonsById.get(lessonId) ?? null,
    fallbackUsed: true,
    reason,
  };
}

export async function fetchLesson(lessonId: string): Promise<FetchLessonResult> {
  if (!localLessonsById.has(lessonId)) {
    return {
      lesson: null,
      fallbackUsed: true,
      reason: 'This lesson is no longer part of the local course path.',
    };
  }

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
        if (lesson) {
          const upgradedLocalLesson = await maybeRefreshLocalLesson(lessonId, lesson);
          if (upgradedLocalLesson) return upgradedLocalLesson;
          return { lesson: normalizeLesson(lesson), fallbackUsed: false };
        }
        return { lesson: null, fallbackUsed: false };
      }

      const localLesson = localLessonsById.get(lessonId);
      if (localLesson) {
        withTimeout(
          setDoc(doc(db, 'lessons', lessonId), localLesson),
          3000,
          undefined,
          'fetchLesson:write'
        ).catch((writeError) => {
          console.warn('Failed to create lesson in Firestore, will use local lesson.', writeError);
        });
        return { lesson: localLesson, fallbackUsed: true, reason: 'Firestore lesson not found; using local lesson.' };
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
        const lessonsById = new Map<string, Lesson>();
        snapshot.docs.forEach((docSnap: QueryDocumentSnapshot<Lesson>) => {
          const lesson = { ...docSnap.data(), lessonId: docSnap.id } as Lesson;
          const localLesson = localLessonsById.get(lesson.lessonId);
          if (!localLesson) return;
          lessonsById.set(
            lesson.lessonId,
            normalizeLesson(localLesson && (lesson.contentVersion ?? 1) < localLesson.contentVersion ? localLesson : lesson)
          );
        });
        allLessons.forEach((lesson) => {
          if (!lessonsById.has(lesson.lessonId)) lessonsById.set(lesson.lessonId, lesson);
        });

        return {
          lessons: sortLessons(Array.from(lessonsById.values())),
          fallbackUsed: false,
        };
      }

      return {
        lessons: sortLessons(allLessons),
        fallbackUsed: true,
        reason: 'No lessons were available from Firestore; showing the local lesson path.',
      };
    } catch (error) {
      console.warn('Failed to load lessons from Firestore, falling back to local lesson list.', error);
      return {
        lessons: sortLessons(allLessons),
        fallbackUsed: true,
        reason: getFirestoreFallbackReason(error, 'Failed to load lessons from Firestore; using local fallback.'),
      };
    }
  }

  return {
    lessons: sortLessons(allLessons),
    fallbackUsed: true,
    reason: 'Firebase is not configured; using local lesson path.',
  };
}
