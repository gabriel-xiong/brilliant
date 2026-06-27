import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyStickyMastery,
  calculateLessonProgress,
  clearGuestProgress,
  initializeProgress,
  loadProgress,
  localDateString,
  maxMasteryStatus,
  mergePracticeConceptStat,
  saveLessonProgress,
  saveProgress,
  type StepProgress,
} from './progressService';
import { introBasicProbabilityLesson, type Lesson } from '../models/lesson';

const problemSteps = introBasicProbabilityLesson.steps.filter((step) => step.type === 'problem');

function attemptsForCorrectFirstTry(count: number): Record<string, StepProgress> {
  return Object.fromEntries(
    problemSteps.slice(0, count).map((step) => [
      step.stepId,
      {
        attempts: 1,
        correctFirstAttempt: true,
        lastResult: 'correct' as const,
      },
    ])
  );
}

describe('progressService', () => {
  beforeEach(() => {
    localStorage.clear();
    // The guest store is module-level in-memory state; reset it between tests so
    // anonymous progress never leaks across cases.
    clearGuestProgress();
  });

  it('initializes progress with the lesson version', () => {
    const progress = initializeProgress('intro-basic-probability', 10);

    expect(progress).toMatchObject({
      lessonId: 'intro-basic-probability',
      contentVersion: 10,
      lastStepIndex: 0,
      completed: false,
      score: 0,
      masteryStatus: 'not-started',
      stepAttempts: {},
    });
  });

  it('marks a completed lesson mastered above the configured first-try threshold', () => {
    const attempts = attemptsForCorrectFirstTry(4);
    const progress = calculateLessonProgress(
      introBasicProbabilityLesson,
      attempts,
      introBasicProbabilityLesson.steps.length - 1,
      true
    );

    expect(progress.score).toBe(1);
    expect(progress.masteryStatus).toBe('mastered');
  });

  it('marks completed lessons proficient at the configured first-try threshold', () => {
    const lesson = {
      ...introBasicProbabilityLesson,
      masteryCriteria: { ...introBasicProbabilityLesson.masteryCriteria, minFirstAttemptAccuracy: 0.6 },
    } satisfies Lesson;
    const attempts = attemptsForCorrectFirstTry(2);
    const progress = calculateLessonProgress(
      lesson,
      attempts,
      lesson.steps.length - 1,
      true
    );

    expect(progress.score).toBeCloseTo(2 / 3);
    expect(progress.masteryStatus).toBe('proficient');
  });

  it('marks completed lessons below the first-try threshold as needs practice', () => {
    // Two first-try-correct checks lands below the 0.8 proficiency threshold.
    const attempts = attemptsForCorrectFirstTry(2);
    const progress = calculateLessonProgress(
      introBasicProbabilityLesson,
      attempts,
      introBasicProbabilityLesson.steps.length - 1,
      true
    );

    expect(progress.score).toBeCloseTo(2 / 3);
    expect(progress.masteryStatus).toBe('completed');
  });

  it('uses lesson movement and answered problems to classify in-progress work', () => {
    const lesson = {
      ...introBasicProbabilityLesson,
      steps: introBasicProbabilityLesson.steps.slice(0, 6),
    } satisfies Lesson;
    const attempts = attemptsForCorrectFirstTry(1);

    const progress = calculateLessonProgress(lesson, attempts, 4, false);

    expect(progress.masteryStatus).toBe('almost-done');
    expect(progress.completed).toBe(false);
  });

  it('stores anonymous and signed-in progress separately in local storage', () => {
    const anonymousProgress = initializeProgress('intro-basic-probability', 10);
    const userProgress = {
      ...anonymousProgress,
      lastStepIndex: 3,
      masteryStatus: 'in-progress' as const,
    };

    saveProgress(anonymousProgress);
    saveProgress(userProgress, 'user-123');

    expect(loadProgress('intro-basic-probability')).toMatchObject({ lastStepIndex: 0 });
    expect(loadProgress('intro-basic-probability', 'user-123')).toMatchObject({ lastStepIndex: 3 });
  });

  it('formats local dates as YYYY-MM-DD', () => {
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  describe('sticky mastery', () => {
    it('orders mastery statuses monotonically', () => {
      expect(maxMasteryStatus('mastered', 'completed')).toBe('mastered');
      expect(maxMasteryStatus('proficient', 'completed')).toBe('proficient');
      expect(maxMasteryStatus('mastered', 'proficient')).toBe('mastered');
      expect(maxMasteryStatus('completed', 'mastered')).toBe('mastered');
      expect(maxMasteryStatus('in-progress', 'almost-done')).toBe('almost-done');
      expect(maxMasteryStatus('not-started', 'in-progress')).toBe('in-progress');
    });

    it('keeps a mastered lesson mastered when replayed below the threshold', () => {
      const lowScoreReplay = attemptsForCorrectFirstTry(3);
      const replayProgress = calculateLessonProgress(
        introBasicProbabilityLesson,
        lowScoreReplay,
        introBasicProbabilityLesson.steps.length - 1,
        true,
        'mastered'
      );

      expect(replayProgress.masteryStatus).toBe('mastered');
    });

    it('still awards mastery on the first qualifying attempt without a prior status', () => {
      const attempts = attemptsForCorrectFirstTry(4);
      const progress = calculateLessonProgress(
        introBasicProbabilityLesson,
        attempts,
        introBasicProbabilityLesson.steps.length - 1,
        true
      );

      expect(progress.masteryStatus).toBe('mastered');
    });

    it('does not downgrade through applyStickyMastery and latches completion', () => {
      const previous = {
        ...initializeProgress('intro-basic-probability', 10),
        completed: true,
        score: 1,
        masteryStatus: 'mastered' as const,
      };
      const downgraded = {
        ...initializeProgress('intro-basic-probability', 10),
        completed: true,
        score: 0.5,
        masteryStatus: 'completed' as const,
      };

      const merged = applyStickyMastery(downgraded, previous);

      expect(merged.masteryStatus).toBe('mastered');
      expect(merged.completed).toBe(true);
      expect(merged.score).toBe(1);
    });

    it('persists a mastered status even when a later save tries to lower it', async () => {
      // Anonymous learner keeps everything in local storage, so this exercises
      // the sticky-save clamp without touching Firestore.
      const mastered = calculateLessonProgress(
        introBasicProbabilityLesson,
        attemptsForCorrectFirstTry(4),
        introBasicProbabilityLesson.steps.length - 1,
        true
      );
      expect(mastered.masteryStatus).toBe('mastered');
      await saveLessonProgress('', mastered);

      // Simulate a replay that resets in-memory state then completes below threshold.
      const reviewAttempt = calculateLessonProgress(
        introBasicProbabilityLesson,
        attemptsForCorrectFirstTry(2),
        introBasicProbabilityLesson.steps.length - 1,
        true
      );
      expect(reviewAttempt.masteryStatus).toBe('completed');
      await saveLessonProgress('', reviewAttempt);

      expect(loadProgress('intro-basic-probability')?.masteryStatus).toBe('mastered');
    });
  });

  describe('practice stat review fields', () => {
    it('tracks recent misses and resets the success streak after a mixed session', () => {
      const merged = mergePracticeConceptStat(
        {
          answered: 4,
          correct: 4,
          bestLevel: 5,
          lastLevel: 5,
          lastPracticed: '2026-06-01T00:00:00.000Z',
          successStreak: 4,
          recentMisses: 0,
        },
        { answered: 3, correct: 2, levelReached: 6 },
        '2026-06-02T00:00:00.000Z',
      );

      expect(merged).toMatchObject({
        answered: 7,
        correct: 6,
        bestLevel: 6,
        lastLevel: 6,
        lastPracticed: '2026-06-02T00:00:00.000Z',
        lastReviewed: '2026-06-02T00:00:00.000Z',
        successStreak: 0,
        recentMisses: 1,
      });
    });

    it('extends the success streak and cools recent misses after a perfect session', () => {
      const merged = mergePracticeConceptStat(
        {
          answered: 5,
          correct: 4,
          bestLevel: 4,
          lastLevel: 4,
          lastPracticed: '2026-06-01T00:00:00.000Z',
          successStreak: 1,
          recentMisses: 2,
        },
        { answered: 2, correct: 2, levelReached: 3 },
        '2026-06-03T00:00:00.000Z',
      );

      expect(merged.successStreak).toBe(3);
      expect(merged.recentMisses).toBe(0);
      expect(merged.bestLevel).toBe(4);
    });
  });

  describe('guest progress is session-only', () => {
    it('drops guest progress on a simulated reload but keeps signed-in progress', async () => {
      // Guest (anonymous) progress: no userId -> in-memory session store. Goes
      // through the sticky save path, which stays offline for empty userId.
      const guest = {
        ...initializeProgress('intro-basic-probability', 10),
        lastStepIndex: 4,
        masteryStatus: 'almost-done' as const,
      };
      await saveLessonProgress('', guest);

      // Signed-in progress: user-scoped persisted (local cache of the
      // Firestore-backed record). saveProgress is the offline persistence path
      // that signed-in saves also write to.
      const member = {
        ...initializeProgress('intro-basic-probability', 10),
        lastStepIndex: 6,
        completed: true,
        score: 1,
        masteryStatus: 'mastered' as const,
      };
      saveProgress(member, 'user-9');

      // Both are visible within the live session.
      expect(loadProgress('intro-basic-probability')?.lastStepIndex).toBe(4);
      expect(loadProgress('intro-basic-probability', 'user-9')?.lastStepIndex).toBe(6);

      // Simulate a hard refresh while signed out (module reset + startup cleanup).
      clearGuestProgress();

      // Guest progress is gone; the signed-in record survives.
      expect(loadProgress('intro-basic-probability')).toBeNull();
      expect(loadProgress('intro-basic-probability', 'user-9')?.lastStepIndex).toBe(6);
      expect(loadProgress('intro-basic-probability', 'user-9')?.masteryStatus).toBe('mastered');
    });

    it('purges legacy persisted guest cache without touching user-scoped keys', () => {
      // Older builds wrote guest progress straight to localStorage.
      const legacyGuest = {
        ...initializeProgress('intro-basic-probability', 10),
        lastStepIndex: 2,
      };
      localStorage.setItem('brilliant-progress-intro-basic-probability', JSON.stringify(legacyGuest));

      const userRecord = {
        ...initializeProgress('intro-basic-probability', 10),
        lastStepIndex: 5,
      };
      localStorage.setItem('brilliant-progress-user-7-intro-basic-probability', JSON.stringify(userRecord));

      clearGuestProgress();

      expect(localStorage.getItem('brilliant-progress-intro-basic-probability')).toBeNull();
      expect(localStorage.getItem('brilliant-progress-user-7-intro-basic-probability')).not.toBeNull();
    });
  });
});
