import { Lesson } from '../models/lesson';
import { loadProgress, UserSummary } from './progressService';
import { getPrerequisites } from './courseGraph';

export type MasteryStatusLike = string | null | undefined;

/**
 * A lesson counts as a satisfied prerequisite once the learner has finished it.
 * "completed" means finished-but-below-mastery; "mastered" means finished at the
 * mastery threshold. Both are enough to unlock the next lesson on the path.
 */
export function isLessonCompleted(status: MasteryStatusLike): boolean {
  return status === 'completed' || status === 'mastered';
}

/**
 * Resolve the effective mastery status for a lesson, preferring the synced
 * Firestore summary and falling back to locally stored progress.
 */
export function getEffectiveStatus(
  lessonId: string,
  userSummary: UserSummary | null | undefined,
  userId?: string
): string {
  return (
    userSummary?.masterySummary?.[lessonId]?.status ??
    loadProgress(lessonId, userId)?.masteryStatus ??
    'not-started'
  );
}

export interface LessonNodeState {
  lesson: Lesson;
  index: number;
  status: string;
  completed: boolean;
  /** The lesson is playable: it has no prerequisites, or ALL of them are completed. */
  unlocked: boolean;
  /** Unlocked but not yet completed — i.e. a node the learner can choose to play next. */
  available: boolean;
  /**
   * The single "recommended next" node. With a branching path several lessons
   * can be {@link available} at once, so exactly one of them is flagged
   * `isCurrent`: an in-progress lesson is preferred, otherwise the first
   * available, not-yet-completed lesson by display order.
   */
  isCurrent: boolean;
  /**
   * A representative prerequisite that still needs completing before this lesson
   * unlocks (only set while locked). Kept singular for backwards compatibility
   * with the lesson-player gate; see {@link prerequisites} for the full list.
   */
  prerequisite?: Lesson;
  /** Every prerequisite lesson for this node (empty for a root lesson). */
  prerequisites: Lesson[];
  /** The prerequisite lessons that are not yet completed (drives lock messaging). */
  incompletePrerequisites: Lesson[];
}

export interface ContinueDestination {
  lessonId: string;
  /** Step index the player should open at (0-based). */
  stepIndex: number;
}

/**
 * Decide where the "Continue learning" entry point should send the learner.
 * With a branching path several lessons can be available at once, so the
 * destination follows a stable priority:
 *
 * - Prefer an in-progress lesson and resume it at the furthest step reached.
 * - Otherwise the first available, not-yet-completed lesson (by display order),
 *   opened at its first step. For a brand-new learner this is the Introduction,
 *   since it is the only lesson with no prerequisites.
 * - When every unlocked lesson is complete (the whole path is finished), send
 *   the learner back to the last completed lesson to review from its start.
 *
 * The chosen "recommended" node is exactly the one {@link computeLessonStates}
 * flags as `isCurrent`, so the map highlight and the continue button agree.
 *
 * `getLastStepIndex` resolves the stored furthest step for a given lesson
 * (signed-in: Firestore/user cache; guest: in-memory session store). It is only
 * consulted for an already-started lesson so a not-started lesson always opens
 * at step 0.
 */
export function resolveContinueDestination(
  states: LessonNodeState[],
  getLastStepIndex: (lessonId: string) => number
): ContinueDestination | null {
  if (states.length === 0) return null;

  const current = states.find((state) => state.isCurrent);
  if (current) {
    const started = current.status !== 'not-started';
    const stepIndex = started ? Math.max(0, getLastStepIndex(current.lesson.lessonId)) : 0;
    return { lessonId: current.lesson.lessonId, stepIndex };
  }

  // No "current" node means every unlocked lesson is complete: offer a review of
  // the last finished lesson (by display order) from its beginning.
  const lastCompleted = [...states].reverse().find((state) => state.completed);
  const target = lastCompleted ?? states[0];
  return { lessonId: target.lesson.lessonId, stepIndex: 0 };
}

/**
 * Decide which lessons are unlocked using the course DAG: a lesson is unlocked
 * only once ALL of its prerequisites (from `courseGraph`) are completed.
 * Multiple lessons can therefore be available at the same time (parallel
 * branches), and a reconverging lesson stays locked until every branch that
 * feeds it is done.
 *
 * Lessons are processed in display order (`order`) so the resulting array — and
 * the per-node `index` — is stable for the map and for "first available"
 * tie-breaking. Prerequisites that are not present in `lessons` are ignored
 * (treated as satisfied) so a partially-loaded lesson set can never permanently
 * lock the rest of the path.
 */
export function computeLessonStates(
  lessons: Lesson[],
  getStatus: (lessonId: string) => MasteryStatusLike
): LessonNodeState[] {
  const sorted = [...lessons].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const byId = new Map(sorted.map((lesson) => [lesson.lessonId, lesson]));
  const isCompleted = (lessonId: string) => isLessonCompleted(getStatus(lessonId));

  const states: LessonNodeState[] = sorted.map((lesson, index) => {
    const status = getStatus(lesson.lessonId) || 'not-started';
    const completed = isLessonCompleted(status);

    // Only consider prerequisites that actually exist in the loaded set.
    const prerequisiteIds = getPrerequisites(lesson.lessonId).filter((id) => byId.has(id));
    const prerequisites = prerequisiteIds.map((id) => byId.get(id)!);
    const incompletePrerequisites = prerequisites.filter((prereq) => !isCompleted(prereq.lessonId));
    const unlocked = incompletePrerequisites.length === 0;

    return {
      lesson,
      index,
      status,
      completed,
      unlocked,
      available: unlocked && !completed,
      isCurrent: false,
      prerequisite: unlocked ? undefined : incompletePrerequisites[0] ?? prerequisites[0],
      prerequisites,
      incompletePrerequisites,
    };
  });

  // Flag the single recommended node: prefer an in-progress (started but not
  // finished) available lesson, otherwise the first available, incomplete
  // lesson by display order. Brand-new learners land on the Introduction
  // because it is the only initially-available lesson.
  const available = states.filter((state) => state.available);
  const recommended = available.find((state) => state.status !== 'not-started') ?? available[0];
  if (recommended) recommended.isCurrent = true;

  return states;
}
