import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lesson, LessonStep } from '../models/lesson';
import {
  initializeProgress,
  loadProgress,
  saveProgress,
  loadLessonProgress,
  saveLessonProgress,
} from '../services/progressService';

export type FeedbackState = 'idle' | 'correct' | 'incorrect';

export interface LessonState {
  currentStepIndex: number;
  currentStep: LessonStep | null;
  feedbackState: FeedbackState;
  selectedChoice: string | null;
  progress: ReturnType<typeof initializeProgress>;
}

export function useLessonState(lesson: Lesson | null, userId?: string) {
  const [progress, setProgress] = useState(() => {
    if (!lesson) return initializeProgress('pending-lesson');
    const loaded = loadProgress(lesson.lessonId);
    return loaded ?? initializeProgress(lesson.lessonId);
  });
  const [currentStepIndex, setCurrentStepIndex] = useState(progress.lastStepIndex);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);

  const currentStep = lesson ? lesson.steps[currentStepIndex] : null;

  useEffect(() => {
    let cancelled = false;
    if (!lesson || !userId) return;

    loadLessonProgress(userId, lesson.lessonId)
      .then((loaded) => {
        if (cancelled || !loaded) return;
        setProgress(loaded);
        setCurrentStepIndex(loaded.lastStepIndex);
      })
      .catch((error) => {
        console.warn('Failed to load lesson progress from Firestore, keeping local progress.', error);
      });

    return () => {
      cancelled = true;
    };
  }, [lesson, userId]);

  useEffect(() => {
    if (!lesson) {
      setCurrentStepIndex(0);
      return;
    }
    setCurrentStepIndex(progress.lastStepIndex);
  }, [progress.lastStepIndex, lesson]);

  const updateProgress = useCallback(
    (nextProgress: typeof progress) => {
      setProgress(nextProgress);
      saveProgress(nextProgress);
      if (userId) {
        saveLessonProgress(userId, nextProgress).catch((error) => {
          console.warn('Failed to save lesson progress to Firestore, saved locally instead.', error);
        });
      }
    },
    [userId]
  );

  const submitAnswer = useCallback(
    (choice: string) => {
      if (!lesson || !currentStep || currentStep.type !== 'problem') return;
      setSelectedChoice(choice);
      const correct = choice === currentStep.answer;
      setFeedbackState(correct ? 'correct' : 'incorrect');

      const priorAttempt = progress.stepAttempts[currentStep.stepId];
      const firstAttemptCorrect = priorAttempt
        ? priorAttempt.correctFirstAttempt || correct
        : correct;

      const newAttempts: Record<string, { attempts: number; correctFirstAttempt: boolean; lastResult: 'correct' | 'incorrect' | 'unanswered' }> = {
        ...progress.stepAttempts,
        [currentStep.stepId]: {
          attempts: priorAttempt ? priorAttempt.attempts + 1 : 1,
          correctFirstAttempt: firstAttemptCorrect,
          lastResult: correct ? 'correct' : 'incorrect',
        },
      };

      const nextIndex = lesson ? Math.min(currentStepIndex + 1, lesson.steps.length - 1) : currentStepIndex;
      const newProgress = {
        ...progress,
        lastStepIndex: nextIndex,
        completed: lesson ? nextIndex === lesson.steps.length - 1 : false,
        score: Object.values(newAttempts).filter((step) => step.correctFirstAttempt).length,
        masteryStatus: 'in-progress' as const,
        stepAttempts: newAttempts,
        updatedAt: new Date().toISOString(),
      };

      updateProgress(newProgress);
    },
    [currentStep, currentStepIndex, lesson, progress, updateProgress]
  );

  const advanceStep = useCallback(() => {
    if (!lesson) return;
    const nextIndex = Math.min(currentStepIndex + 1, lesson.steps.length - 1);
    const nextProgress = {
      ...progress,
      lastStepIndex: nextIndex,
      completed: nextIndex === lesson.steps.length - 1,
      updatedAt: new Date().toISOString(),
    };
    updateProgress(nextProgress);
    setCurrentStepIndex(nextIndex);
    setFeedbackState('idle');
    setSelectedChoice(null);
  }, [currentStepIndex, lesson, progress, updateProgress]);

  const runSimulation = useCallback((result: string) => {
    setFeedbackState(result === 'expected' ? 'correct' : 'idle');
  }, []);

  const state = useMemo(
    () => ({
      currentStepIndex,
      currentStep,
      feedbackState,
      selectedChoice,
      progress,
    }),
    [currentStep, currentStepIndex, feedbackState, progress, selectedChoice]
  );

  return {
    state,
    submitAnswer,
    advanceStep,
    setSelectedChoice,
    setFeedbackState,
    runSimulation,
  };
}
