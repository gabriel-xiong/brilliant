import { describe, expect, it } from 'vitest';
import { introBasicProbabilityLesson } from '../src/models/lesson';

describe('seed-firestore lesson loader', () => {
  it('loads the canonical intro lesson from the app model', async () => {
    const { loadIntroLesson } = await import('./seed-firestore.mjs');
    const lesson = loadIntroLesson();

    expect(lesson.lessonId).toBe(introBasicProbabilityLesson.lessonId);
    expect(lesson.contentVersion).toBe(introBasicProbabilityLesson.contentVersion);
    expect(lesson.steps.map((step: { stepId: string }) => step.stepId)).toEqual(
      introBasicProbabilityLesson.steps.map((step) => step.stepId)
    );
  });
});

