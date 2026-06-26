import { describe, expect, it } from 'vitest';
import {
  completedLessonCount,
  hasAnyPracticeUnlocked,
  isExamUnlocked,
  isPracticeUnlockedForConcept,
  isPracticeUnlockedForLesson,
  lessonIdForConcept,
  newlyUnlockedConceptForLesson,
  totalLessonCount,
  unlockedConcepts,
  type StatusGetter,
} from './practiceAccess';

const INTRO = 'intro-basic-probability';
const COUNTING = 'counting-outcomes';
const COMPOUND = 'compound-events';
const CONDITIONAL = 'dependent-events';
const MUTEX = 'mutually-exclusive-events';
const EXPECTED = 'expected-value';
const BAYES = 'bayes-updating';

function statusFrom(map: Record<string, string>): StatusGetter {
  return (lessonId: string) => map[lessonId] ?? 'not-started';
}

describe('isPracticeUnlockedForLesson', () => {
  it('locks practice until the lesson is completed', () => {
    expect(isPracticeUnlockedForLesson(COMPOUND, statusFrom({}))).toBe(false);
    expect(isPracticeUnlockedForLesson(COMPOUND, statusFrom({ [COMPOUND]: 'in-progress' }))).toBe(false);
    expect(isPracticeUnlockedForLesson(COMPOUND, statusFrom({ [COMPOUND]: 'completed' }))).toBe(true);
    expect(isPracticeUnlockedForLesson(COMPOUND, statusFrom({ [COMPOUND]: 'mastered' }))).toBe(true);
  });
});

describe('isPracticeUnlockedForConcept', () => {
  it('unlocks a concept once its teaching lesson is completed', () => {
    expect(isPracticeUnlockedForConcept('and-multiply', statusFrom({}))).toBe(false);
    expect(isPracticeUnlockedForConcept('and-multiply', statusFrom({ [COMPOUND]: 'completed' }))).toBe(true);
  });

  it('unlocks a concept taught by multiple lessons when ANY is completed', () => {
    expect(isPracticeUnlockedForConcept('single-event', statusFrom({}))).toBe(false);
    expect(isPracticeUnlockedForConcept('single-event', statusFrom({ [INTRO]: 'completed' }))).toBe(true);
    expect(isPracticeUnlockedForConcept('single-event', statusFrom({ [COUNTING]: 'mastered' }))).toBe(true);
  });

  it('maps each concept back to its earliest teaching lesson', () => {
    expect(lessonIdForConcept('single-event')).toBe(INTRO);
    expect(lessonIdForConcept('and-multiply')).toBe(COMPOUND);
    expect(lessonIdForConcept('bayes')).toBe(BAYES);
  });
});

describe('unlockedConcepts / hasAnyPracticeUnlocked', () => {
  it('reports nothing unlocked for a brand-new learner', () => {
    expect(unlockedConcepts(statusFrom({}))).toEqual([]);
    expect(hasAnyPracticeUnlocked(statusFrom({}))).toBe(false);
  });

  it('reports the concepts whose lessons are complete', () => {
    const getStatus = statusFrom({ [INTRO]: 'mastered', [COMPOUND]: 'completed' });
    expect(unlockedConcepts(getStatus)).toEqual(['single-event', 'and-multiply']);
    expect(hasAnyPracticeUnlocked(getStatus)).toBe(true);
  });
});

describe('isExamUnlocked', () => {
  it('stays locked until every lesson on the path is completed', () => {
    expect(isExamUnlocked(statusFrom({}))).toBe(false);

    const allButOne = statusFrom({
      [INTRO]: 'mastered',
      [COUNTING]: 'mastered',
      [COMPOUND]: 'completed',
      [CONDITIONAL]: 'mastered',
      [MUTEX]: 'completed',
      [EXPECTED]: 'mastered',
    });
    expect(isExamUnlocked(allButOne)).toBe(false);
  });

  it('unlocks once all lessons are complete (completed or mastered both count)', () => {
    const allDone = statusFrom({
      [INTRO]: 'completed',
      [COUNTING]: 'mastered',
      [COMPOUND]: 'completed',
      [CONDITIONAL]: 'mastered',
      [MUTEX]: 'completed',
      [EXPECTED]: 'mastered',
      [BAYES]: 'completed',
    });
    expect(isExamUnlocked(allDone)).toBe(true);
  });
});

describe('newlyUnlockedConceptForLesson', () => {
  it('returns the single concept for single-concept lessons', () => {
    expect(newlyUnlockedConceptForLesson(INTRO)).toBe('single-event');
    expect(newlyUnlockedConceptForLesson(COMPOUND)).toBe('and-multiply');
    expect(newlyUnlockedConceptForLesson(BAYES)).toBe('bayes');
  });

  it('skips a concept an earlier lesson already unlocked', () => {
    // Counting outcomes teaches single-event (already from intro) + complement,
    // so the concept it actually newly unlocks is complement.
    expect(newlyUnlockedConceptForLesson(COUNTING)).toBe('complement');
  });

  it('returns null for an unknown lesson', () => {
    expect(newlyUnlockedConceptForLesson('does-not-exist')).toBeNull();
  });
});

describe('completedLessonCount / totalLessonCount', () => {
  it('counts completed lessons against the full course path', () => {
    expect(totalLessonCount()).toBe(7);
    expect(completedLessonCount(statusFrom({}))).toBe(0);
    expect(
      completedLessonCount(statusFrom({ [INTRO]: 'mastered', [COUNTING]: 'completed', [COMPOUND]: 'in-progress' }))
    ).toBe(2);
  });
});
