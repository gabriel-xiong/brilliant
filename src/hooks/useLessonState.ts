import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lesson, LessonStep, ProblemStep } from '../models/lesson';
import {
  calculateLessonProgress,
  initializeProgress,
  loadProgress,
  loadLessonProgress,
  saveMasterySummary,
  saveLessonProgress,
  updateUserStreak,
} from '../services/progressService';

export type FeedbackState = 'idle' | 'correct' | 'incorrect';

export interface LessonState {
  currentStepIndex: number;
  currentStep: LessonStep | null;
  feedbackState: FeedbackState;
  selectedChoice: string | null;
  progress: ReturnType<typeof initializeProgress>;
}

function applyVariant(step: LessonStep, variantIndices: Record<string, number>): LessonStep {
  if (step.type !== 'problem') return step;
  const idx = variantIndices[step.stepId];
  if (idx === undefined) return step;
  const variant = (step as ProblemStep).variants?.[idx];
  if (!variant) return step;
  return { ...step, ...variant };
}

export function useLessonState(lesson: Lesson | null, userId?: string) {
  const [progress, setProgress] = useState(() => initializeProgress('pending-lesson'));
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [variantIndices, setVariantIndices] = useState<Record<string, number>>({});

  const rawCurrentStep = lesson ? lesson.steps[currentStepIndex] : null;

  const effectiveStep = useMemo<LessonStep | null>(() => {
    if (!rawCurrentStep || Object.keys(variantIndices).length === 0) return rawCurrentStep;
    return applyVariant(rawCurrentStep, variantIndices);
  }, [rawCurrentStep, variantIndices]);

  useEffect(() => {
    let cancelled = false;
    if (!lesson) return;

    const progressPromise = userId
      ? loadLessonProgress(userId, lesson.lessonId)
      : Promise.resolve(loadProgress(lesson.lessonId));

    progressPromise
      .then((loaded) => {
        if (cancelled) return;
        const versionMismatch = loaded && loaded.contentVersion !== lesson.contentVersion;
        const nextProgress = !loaded || versionMismatch ? initializeProgress(lesson.lessonId, lesson.contentVersion) : loaded;
        const safeIndex = Math.min(nextProgress.lastStepIndex, lesson.steps.length - 1);
        setProgress({ ...nextProgress, lastStepIndex: safeIndex });
        setCurrentStepIndex(safeIndex);
        setFeedbackState('idle');
        setSelectedChoice(null);
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
      if (userId) {
        saveLessonProgress(userId, nextProgress).catch((error) => {
          console.warn('Failed to save lesson progress to Firestore, saved locally instead.', error);
        });
        if (nextProgress.completed) {
          saveMasterySummary(userId, nextProgress);
          updateUserStreak(userId);
        }
      } else {
        saveLessonProgress('', nextProgress);
      }
    },
    [userId]
  );

  const submitAnswer = useCallback(
    (choice: string) => {
      if (!lesson || !effectiveStep || effectiveStep.type !== 'problem') return;
      setSelectedChoice(choice);
      const correct = choice === effectiveStep.answer;
      setFeedbackState(correct ? 'correct' : 'incorrect');

      const priorAttempt = progress.stepAttempts[effectiveStep.stepId];
      const firstAttemptCorrect = priorAttempt ? priorAttempt.correctFirstAttempt : correct;

      const newAttempts: Record<string, { attempts: number; correctFirstAttempt: boolean; lastResult: 'correct' | 'incorrect' | 'unanswered' }> = {
        ...progress.stepAttempts,
        [effectiveStep.stepId]: {
          attempts: priorAttempt ? priorAttempt.attempts + 1 : 1,
          correctFirstAttempt: firstAttemptCorrect,
          lastResult: correct ? 'correct' : 'incorrect',
        },
      };

      const isFinalStep = currentStepIndex === lesson.steps.length - 1;
      const completed = correct && isFinalStep;
      const newProgress = calculateLessonProgress(lesson, newAttempts, currentStepIndex, completed);

      updateProgress(newProgress);
    },
    [effectiveStep, currentStepIndex, lesson, progress, updateProgress]
  );

  const advanceStep = useCallback(() => {
    if (!lesson) return;
    if (progress.completed) return;

    if (rawCurrentStep?.type === 'problem' && feedbackState !== 'correct') {
      return;
    }

    const nextIndex = Math.min(currentStepIndex + 1, lesson.steps.length - 1);
    const completed = currentStepIndex === lesson.steps.length - 1;
    const nextProgress = calculateLessonProgress(lesson, progress.stepAttempts, nextIndex, completed);
    updateProgress(nextProgress);
    setCurrentStepIndex(nextIndex);
    setFeedbackState('idle');
    setSelectedChoice(null);
  }, [rawCurrentStep, currentStepIndex, feedbackState, lesson, progress, updateProgress]);

  const restartLesson = useCallback(() => {
    if (!lesson) return;
    const freshProgress = initializeProgress(lesson.lessonId, lesson.contentVersion);
    updateProgress(freshProgress);
    setCurrentStepIndex(0);
    setFeedbackState('idle');
    setSelectedChoice(null);

    const newVariantIndices: Record<string, number> = {};
    for (const step of lesson.steps) {
      if (step.type === 'problem' && (step as ProblemStep).variants?.length) {
        const variants = (step as ProblemStep).variants!;
        newVariantIndices[step.stepId] = Math.floor(Math.random() * variants.length);
      }
    }
    setVariantIndices(newVariantIndices);
  }, [lesson, updateProgress]);

  const goToPreviousStep = useCallback(() => {
    if (currentStepIndex <= 0 || !lesson) return;
    const prevIndex = currentStepIndex - 1;
    const prevRawStep = lesson.steps[prevIndex];
    setCurrentStepIndex(prevIndex);

    if (prevRawStep.type === 'problem') {
      const attempt = progress.stepAttempts[prevRawStep.stepId];
      if (attempt?.lastResult === 'correct') {
        const prevEffective = applyVariant(prevRawStep, variantIndices);
        setFeedbackState('correct');
        setSelectedChoice((prevEffective as ProblemStep).answer);
      } else {
        setFeedbackState('idle');
        setSelectedChoice(null);
      }
    } else {
      setFeedbackState('idle');
      setSelectedChoice(null);
    }
  }, [currentStepIndex, lesson, progress.stepAttempts, variantIndices]);

  const runSimulation = useCallback((result: string) => {
    setFeedbackState(result === 'expected' ? 'correct' : 'idle');
  }, []);

  const state = useMemo(
    () => ({
      currentStepIndex,
      currentStep: effectiveStep,
      feedbackState,
      selectedChoice,
      progress,
    }),
    [effectiveStep, currentStepIndex, feedbackState, progress, selectedChoice]
  );

  return {
    state,
    submitAnswer,
    advanceStep,
    goToPreviousStep,
    restartLesson,
    setSelectedChoice,
    setFeedbackState,
    runSimulation,
  };
}
