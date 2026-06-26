import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLessonState } from './useLessonState';
import type { Lesson } from '../models/lesson';

/** Flush the hook's async progress-load effect (and any queued microtasks). */
const flush = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function makeLesson(lessonId: string): Lesson {
  return {
    lessonId,
    order: 1,
    contentVersion: 1,
    title: 'Reveal persistence lesson',
    summary: 'Test lesson',
    tags: [],
    estimatedMinutes: 1,
    masteryCriteria: { minFirstAttemptAccuracy: 0.8, minCompletedSteps: 1 },
    steps: [
      {
        stepId: 'fr-1',
        type: 'problem',
        format: 'free-response',
        title: 'A fractional question',
        question: 'What is the probability of heads?',
        acceptedAnswer: '1/2',
        explanation: 'Heads is one of two equally likely outcomes.',
      },
      {
        stepId: 'concept-1',
        type: 'concept',
        title: 'A wrap-up concept',
        body: 'Nicely done.',
      },
    ],
  };
}

describe('useLessonState reveal persistence', () => {
  it('gates reveal until two unsuccessful attempts', async () => {
    const lesson = makeLesson('reveal-gated');
    const { result } = renderHook(() => useLessonState(lesson));
    await flush();

    act(() => {
      result.current.revealAnswer();
    });
    expect(result.current.state.feedbackState).toBe('idle');
    expect(result.current.state.selectedChoice).toBeNull();

    act(() => {
      result.current.submitAnswer('1/3');
    });
    expect(result.current.state.feedbackState).toBe('incorrect');
    expect(result.current.state.questionView.unsuccessfulAttempts).toBe(1);

    act(() => {
      result.current.revealAnswer();
    });
    expect(result.current.state.feedbackState).toBe('incorrect');
    expect(result.current.state.selectedChoice).toBe('1/3');

    act(() => {
      result.current.submitAnswer('1/4');
    });
    expect(result.current.state.questionView.unsuccessfulAttempts).toBe(2);

    act(() => {
      result.current.revealAnswer();
    });

    expect(result.current.state.feedbackState).toBe('revealed');
    expect(result.current.state.selectedChoice).toBe('1/2');
  });

  it('unlocks reveal after the strongest hint and resets that unlock on a new wrong answer', async () => {
    const lesson = makeLesson('reveal-strongest-hint');
    const { result } = renderHook(() => useLessonState(lesson));
    await flush();

    act(() => {
      result.current.submitAnswer('1/3');
    });
    act(() => {
      result.current.markStrongestHintUsed();
    });
    expect(result.current.state.questionView.strongestHintUsed).toBe(true);
    act(() => {
      result.current.submitAnswer('1/4');
    });
    expect(result.current.state.questionView.strongestHintUsed).toBe(false);
    expect(result.current.state.selectedChoice).toBe('1/4');
  });

  it('unlocks reveal after the strongest hint is used', async () => {
    const lesson = makeLesson('reveal-strongest-hint-unlock');
    const { result } = renderHook(() => useLessonState(lesson));
    await flush();

    act(() => {
      result.current.submitAnswer('1/3');
    });
    act(() => {
      result.current.markStrongestHintUsed();
    });
    act(() => {
      result.current.revealAnswer();
    });
    expect(result.current.state.feedbackState).toBe('revealed');
    expect(result.current.state.selectedChoice).toBe('1/2');
  });

  it('restores a revealed answer when returning to the lesson (remount)', async () => {
    const lesson = makeLesson('reveal-remount');

    const first = renderHook(() => useLessonState(lesson));
    await flush();
    act(() => {
      first.result.current.submitAnswer('1/3');
    });
    act(() => {
      first.result.current.submitAnswer('1/4');
    });
    act(() => {
      first.result.current.revealAnswer();
    });
    expect(first.result.current.state.selectedChoice).toBe('1/2');
    first.unmount();

    // Returning to the lesson opens it fresh; the revealed question must come
    // back showing its answer instead of resetting to a blank prompt.
    const second = renderHook(() => useLessonState(lesson, undefined, { requestedStepIndex: 0 }));
    await flush();

    expect(second.result.current.state.currentStepIndex).toBe(0);
    expect(second.result.current.state.selectedChoice).toBe('1/2');
    expect(second.result.current.state.feedbackState).not.toBe('idle');
  });

  it('advances on Continue after revealing the answer (revealed unlocks like correct)', async () => {
    const lesson = makeLesson('reveal-continue');
    const { result } = renderHook(() => useLessonState(lesson));
    await flush();

    act(() => {
      result.current.submitAnswer('1/3');
    });
    act(() => {
      result.current.submitAnswer('1/4');
    });
    act(() => {
      result.current.revealAnswer();
    });
    expect(result.current.state.feedbackState).toBe('revealed');
    expect(result.current.state.currentStepIndex).toBe(0);

    // Continue must advance after a reveal, not be a dead no-op.
    act(() => {
      result.current.advanceStep();
    });
    expect(result.current.state.currentStepIndex).toBe(1);
    expect(result.current.state.feedbackState).toBe('idle');
  });

  it('restores an answered step when navigating back within the session', async () => {
    const lesson = makeLesson('reveal-back-nav');
    const { result } = renderHook(() => useLessonState(lesson));
    await flush();

    act(() => {
      result.current.submitAnswer('1/2');
    });
    expect(result.current.state.feedbackState).toBe('correct');

    act(() => {
      result.current.advanceStep();
    });
    expect(result.current.state.currentStepIndex).toBe(1);

    act(() => {
      result.current.goToPreviousStep();
    });
    expect(result.current.state.currentStepIndex).toBe(0);
    expect(result.current.state.feedbackState).toBe('correct');
    expect(result.current.state.selectedChoice).toBe('1/2');
  });
});
