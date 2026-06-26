import { describe, expect, it } from 'vitest';
import {
  computeLessonStates,
  resolveContinueDestination,
  type LessonNodeState,
} from './lessonProgression';
import { courseGraphOrder, getNextLessonId } from './courseGraph';
import type { Lesson } from '../models/lesson';

function lesson(id: string, order: number): Lesson {
  return {
    lessonId: id,
    order,
    contentVersion: 1,
    title: `Lesson ${order}`,
    summary: '',
    tags: [],
    estimatedMinutes: 5,
    steps: [],
    masteryCriteria: { minFirstAttemptAccuracy: 0.8, minCompletedSteps: 1 },
  };
}

const lessons = [lesson('l1', 1), lesson('l2', 2), lesson('l3', 3)];

function statesFrom(statusById: Record<string, string>): LessonNodeState[] {
  return computeLessonStates(lessons, (id) => statusById[id] ?? 'not-started');
}

describe('resolveContinueDestination', () => {
  it('sends a brand-new learner to the first lesson at step 0', () => {
    const states = statesFrom({});
    const dest = resolveContinueDestination(states, () => 99);

    // Not-started lessons always open at step 0 regardless of any stale index.
    expect(dest).toEqual({ lessonId: 'l1', stepIndex: 0 });
  });

  it('resumes an in-progress lesson at its furthest reached step', () => {
    const states = statesFrom({ l1: 'in-progress' });
    const dest = resolveContinueDestination(states, (id) => (id === 'l1' ? 4 : 0));

    expect(dest).toEqual({ lessonId: 'l1', stepIndex: 4 });
  });

  it('points to the next unlocked lesson at its start once the current lesson is proficient', () => {
    const states = statesFrom({ l1: 'proficient' });
    const dest = resolveContinueDestination(states, () => 7);

    expect(dest).toEqual({ lessonId: 'l2', stepIndex: 0 });
  });

  it('resumes a started later lesson at its furthest step', () => {
    const states = statesFrom({ l1: 'completed', l2: 'in-progress' });
    const dest = resolveContinueDestination(states, (id) => (id === 'l2' ? 2 : 0));

    expect(dest).toEqual({ lessonId: 'l2', stepIndex: 2 });
  });

  it('offers a review of the last lesson when the whole path is complete', () => {
    const states = statesFrom({ l1: 'mastered', l2: 'completed', l3: 'mastered' });
    const dest = resolveContinueDestination(states, () => 5);

    expect(dest).toEqual({ lessonId: 'l3', stepIndex: 0 });
  });

  it('returns null when there are no lessons', () => {
    expect(resolveContinueDestination([], () => 0)).toBeNull();
  });
});

// --- Linear unlock rules over the real course graph ----------------------------
// lessonIds + orders mirror models/lesson.ts and services/courseGraph.ts:
//   intro → counting → compound → dependent → mutually-exclusive
// Each lesson's only prerequisite is the one immediately before it.
const INTRO = 'intro-basic-probability';
const COUNTING = 'counting-outcomes';
const COMPOUND = 'compound-events';
const CONDITIONAL = 'dependent-events';
const MUTEX = 'mutually-exclusive-events';
const EXPECTED = 'expected-value';
const BAYES = 'bayes-updating';

const courseLessons = [
  lesson(INTRO, 1),
  lesson(COUNTING, 2),
  lesson(COMPOUND, 3),
  lesson(CONDITIONAL, 4),
  lesson(MUTEX, 5),
];

function courseStatesFrom(statusById: Record<string, string>): LessonNodeState[] {
  return computeLessonStates(courseLessons, (id) => statusById[id] ?? 'not-started');
}

function nodeFor(states: LessonNodeState[], lessonId: string): LessonNodeState {
  const state = states.find((entry) => entry.lesson.lessonId === lessonId);
  if (!state) throw new Error(`missing state for ${lessonId}`);
  return state;
}

describe('computeLessonStates — linear unlocking', () => {
  it('starts a brand-new learner with only the Introduction available', () => {
    const states = courseStatesFrom({});
    expect(nodeFor(states, INTRO).unlocked).toBe(true);
    expect(nodeFor(states, COUNTING).unlocked).toBe(false);
    expect(nodeFor(states, COMPOUND).unlocked).toBe(false);
    expect(nodeFor(states, CONDITIONAL).unlocked).toBe(false);
    expect(nodeFor(states, MUTEX).unlocked).toBe(false);
    expect(states.filter((state) => state.available).map((state) => state.lesson.lessonId)).toEqual([INTRO]);
  });

  it('unlocks only the next lesson once its prerequisite is complete', () => {
    const states = courseStatesFrom({ [INTRO]: 'proficient', [COUNTING]: 'completed' });
    // Completing Counting unlocks Compound and nothing further down the chain.
    expect(nodeFor(states, COMPOUND).unlocked).toBe(true);
    expect(nodeFor(states, CONDITIONAL).unlocked).toBe(false);
    expect(nodeFor(states, MUTEX).unlocked).toBe(false);
    const available = states.filter((state) => state.available).map((state) => state.lesson.lessonId);
    expect(available).toEqual([COMPOUND]);
  });

  it('keeps each later lesson locked until its single prerequisite is complete', () => {
    const upToCompound = courseStatesFrom({
      [INTRO]: 'mastered',
      [COUNTING]: 'mastered',
      [COMPOUND]: 'completed',
    });
    // Compound done → Conditional unlocks; Mutually Exclusive is still locked
    // behind Conditional (its only prerequisite).
    expect(nodeFor(upToCompound, CONDITIONAL).unlocked).toBe(true);
    expect(nodeFor(upToCompound, MUTEX).unlocked).toBe(false);
    expect(
      nodeFor(upToCompound, MUTEX).incompletePrerequisites.map((lesson) => lesson.lessonId)
    ).toEqual([CONDITIONAL]);

    const upToConditional = courseStatesFrom({
      [INTRO]: 'mastered',
      [COUNTING]: 'mastered',
      [COMPOUND]: 'mastered',
      [CONDITIONAL]: 'mastered',
    });
    expect(nodeFor(upToConditional, MUTEX).unlocked).toBe(true);
    expect(nodeFor(upToConditional, MUTEX).incompletePrerequisites).toEqual([]);
  });

  it('recommends the in-progress lesson as the current node', () => {
    const states = courseStatesFrom({
      [INTRO]: 'mastered',
      [COUNTING]: 'completed',
      [COMPOUND]: 'in-progress',
    });
    const current = states.find((state) => state.isCurrent);
    expect(current?.lesson.lessonId).toBe(COMPOUND);
  });

  it('recommends the next unlocked lesson when none are started', () => {
    const states = courseStatesFrom({ [INTRO]: 'proficient', [COUNTING]: 'completed' });
    const current = states.find((state) => state.isCurrent);
    // The only available lesson on the linear path is Compound Events.
    expect(current?.lesson.lessonId).toBe(COMPOUND);
  });
});

describe('resolveContinueDestination — linear path', () => {
  it('resumes the in-progress lesson at its furthest reached step', () => {
    const states = courseStatesFrom({
      [INTRO]: 'mastered',
      [COUNTING]: 'completed',
      [COMPOUND]: 'in-progress',
    });
    const dest = resolveContinueDestination(states, (id) => (id === COMPOUND ? 3 : 0));
    expect(dest).toEqual({ lessonId: COMPOUND, stepIndex: 3 });
  });

  it('opens the next unlocked lesson at step 0 when none are started', () => {
    const states = courseStatesFrom({ [INTRO]: 'proficient', [COUNTING]: 'completed' });
    const dest = resolveContinueDestination(states, () => 9);
    expect(dest).toEqual({ lessonId: COMPOUND, stepIndex: 0 });
  });

  it('reviews the last completed lesson once the whole path is finished', () => {
    const states = courseStatesFrom({
      [INTRO]: 'mastered',
      [COUNTING]: 'mastered',
      [COMPOUND]: 'mastered',
      [CONDITIONAL]: 'mastered',
      [MUTEX]: 'completed',
    });
    expect(states.every((state) => state.completed)).toBe(true);
    const dest = resolveContinueDestination(states, () => 4);
    expect(dest).toEqual({ lessonId: MUTEX, stepIndex: 0 });
  });
});

describe('getNextLessonId — sequential course-graph order', () => {
  it('lists every lesson in column order', () => {
    expect(courseGraphOrder()).toEqual([INTRO, COUNTING, COMPOUND, CONDITIONAL, MUTEX, EXPECTED, BAYES]);
  });

  it('returns the next sequential lesson regardless of progress state', () => {
    expect(getNextLessonId(INTRO)).toBe(COUNTING);
    expect(getNextLessonId(COUNTING)).toBe(COMPOUND);
    expect(getNextLessonId(COMPOUND)).toBe(CONDITIONAL);
    expect(getNextLessonId(CONDITIONAL)).toBe(MUTEX);
    // The chain now continues past Mutually Exclusive into the two new lessons.
    expect(getNextLessonId(MUTEX)).toBe(EXPECTED);
    expect(getNextLessonId(EXPECTED)).toBe(BAYES);
  });

  it('returns null on the final lesson', () => {
    expect(getNextLessonId(BAYES)).toBeNull();
  });

  it('returns null for a lesson that is not part of the course graph', () => {
    expect(getNextLessonId('unknown-lesson')).toBeNull();
  });
});
