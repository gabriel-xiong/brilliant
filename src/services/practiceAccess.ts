/**
 * Centralized gating rules for the practice + exam surfaces.
 *
 * Practice and the final exam are PROGRESSION-GATED, and this module is the
 * single place that decides what is unlocked so no component invents its own
 * rule:
 *
 *   - Per-concept practice unlocks once the learner has COMPLETED a lesson that
 *     teaches that concept (completed-or-mastered both count — see
 *     {@link isLessonCompleted}).
 *   - The final exam unlocks only once EVERY lesson on the course path is
 *     completed.
 *
 * Everything here is PURE: callers pass a `getStatus(lessonId)` resolver (built
 * from the Firestore mastery summary + local progress via
 * {@link getEffectiveStatus}), so the same logic works for signed-in learners
 * and guests with no React or Firebase coupling.
 */
import { isLessonCompleted, type MasteryStatusLike } from './lessonProgression';
import { courseGraphOrder } from './courseGraph';
import { ALL_CONCEPTS, conceptsForLessonId } from './ai/conceptSchemas';
import type { ConceptId } from './ai/types';

/** Resolves a lesson's effective mastery status (Firestore summary or local). */
export type StatusGetter = (lessonId: string) => MasteryStatusLike;

/**
 * The earliest lesson (in course order) that teaches `conceptId`, or null when
 * no lesson maps to it. Used for unlock checks and for concept-specific copy
 * ("Complete \"<lesson>\" to unlock").
 */
export function lessonIdForConcept(conceptId: ConceptId): string | null {
  return courseGraphOrder().find((lessonId) => conceptsForLessonId(lessonId).includes(conceptId)) ?? null;
}

/** Concepts a given lesson teaches (re-exported here for a single import site). */
export function conceptsForLesson(lessonId: string): ConceptId[] {
  return conceptsForLessonId(lessonId);
}

/**
 * The concept a lesson FIRST introduces: the first concept it teaches that no
 * earlier lesson on the path already taught. This is the concept whose practice
 * genuinely unlocks on completing the lesson — e.g. "Counting outcomes" teaches
 * single-event + complement, but single-event was already unlocked by the
 * intro, so its newly-unlocked concept is complement. Falls back to the lesson's
 * first concept when every concept was already introduced earlier, and null when
 * the lesson teaches nothing. Used for the "practice unlocked" notification so
 * it never announces a concept the learner already had.
 */
export function newlyUnlockedConceptForLesson(lessonId: string): ConceptId | null {
  const concepts = conceptsForLessonId(lessonId);
  if (concepts.length === 0) return null;
  const order = courseGraphOrder();
  const index = order.indexOf(lessonId);
  const earlier = new Set<ConceptId>(
    (index <= 0 ? [] : order.slice(0, index)).flatMap((id) => conceptsForLessonId(id)),
  );
  return concepts.find((concept) => !earlier.has(concept)) ?? concepts[0];
}

/**
 * Practice for a single lesson is unlocked once that lesson is completed. The
 * authoritative definition of "completed" is shared with the course map via
 * {@link isLessonCompleted}, so gating can never drift from the path.
 */
export function isPracticeUnlockedForLesson(lessonId: string, getStatus: StatusGetter): boolean {
  return isLessonCompleted(getStatus(lessonId));
}

/**
 * Practice for a concept is unlocked once ANY lesson that teaches it is
 * completed. Concepts with no teaching lesson are treated as unlocked so we can
 * never permanently hide content that has no path to completion.
 */
export function isPracticeUnlockedForConcept(conceptId: ConceptId, getStatus: StatusGetter): boolean {
  const teachingLessons = courseGraphOrder().filter((lessonId) =>
    conceptsForLessonId(lessonId).includes(conceptId)
  );
  if (teachingLessons.length === 0) return true;
  return teachingLessons.some((lessonId) => isLessonCompleted(getStatus(lessonId)));
}

/** Every concept the learner has unlocked practice for, in teaching order. */
export function unlockedConcepts(getStatus: StatusGetter): ConceptId[] {
  return ALL_CONCEPTS.filter((conceptId) => isPracticeUnlockedForConcept(conceptId, getStatus));
}

/** True once the learner has unlocked at least one concept for practice. */
export function hasAnyPracticeUnlocked(getStatus: StatusGetter): boolean {
  return ALL_CONCEPTS.some((conceptId) => isPracticeUnlockedForConcept(conceptId, getStatus));
}

/**
 * The final exam unlocks only once every lesson on the canonical course path is
 * completed. The course graph order is the authoritative full lesson set, so
 * this stays correct even on surfaces that have not loaded the lesson content.
 */
export function isExamUnlocked(getStatus: StatusGetter): boolean {
  const order = courseGraphOrder();
  if (order.length === 0) return false;
  return order.every((lessonId) => isLessonCompleted(getStatus(lessonId)));
}

/** How many course-path lessons are completed (for exam progress messaging). */
export function completedLessonCount(getStatus: StatusGetter): number {
  return courseGraphOrder().filter((lessonId) => isLessonCompleted(getStatus(lessonId))).length;
}

/** Total number of lessons on the canonical course path. */
export function totalLessonCount(): number {
  return courseGraphOrder().length;
}
