import type { ConceptId } from './ai/types';
import type { LessonProgress, PracticeConceptStat, UserSummary } from './progressService';

export const masteryLabels: Record<LessonProgress['masteryStatus'], string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'almost-done': 'Almost done',
  completed: 'Needs practice',
  proficient: 'Proficient',
  mastered: 'Mastered',
};

export function getMasteryLabel(status?: LessonProgress['masteryStatus'] | string) {
  if (!status) return masteryLabels['not-started'];
  if (status === 'exploring' || status === 'building') return masteryLabels['in-progress'];
  if (status === 'practice-ready') return masteryLabels.completed;
  return masteryLabels[status as LessonProgress['masteryStatus']] ?? status;
}

export type ConceptMasterySignal = 'needs-practice' | 'proficient' | 'mastered';

export const conceptMasteryLabels: Record<ConceptMasterySignal, string> = {
  'needs-practice': 'Needs practice',
  proficient: 'Proficient',
  mastered: 'Mastered',
};

export interface ConceptReadiness {
  status: ConceptMasterySignal;
  label: string;
  accuracy: number | null;
  reason: string;
}

function accuracyForStat(stat: PracticeConceptStat | undefined): number | null {
  if (!stat || stat.answered <= 0) return null;
  return Math.max(0, Math.min(1, stat.correct / stat.answered));
}

export function getConceptReadiness(stat: PracticeConceptStat | undefined): ConceptReadiness {
  const accuracy = accuracyForStat(stat);
  const recentMisses = stat?.recentMisses ?? 0;
  const successStreak = stat?.successStreak ?? 0;

  if (!stat || stat.answered < 3) {
    return {
      status: 'needs-practice',
      label: conceptMasteryLabels['needs-practice'],
      accuracy,
      reason: 'Try at least 3 practice questions for this concept.',
    };
  }

  if (recentMisses > 0 || accuracy === null || accuracy < 0.8) {
    return {
      status: 'needs-practice',
      label: conceptMasteryLabels['needs-practice'],
      accuracy,
      reason: 'Recent misses make this a good review target.',
    };
  }

  if (accuracy >= 0.9 && successStreak >= 3) {
    return {
      status: 'mastered',
      label: conceptMasteryLabels.mastered,
      accuracy,
      reason: 'Strong accuracy with a steady correct streak.',
    };
  }

  return {
    status: 'proficient',
    label: conceptMasteryLabels.proficient,
    accuracy,
    reason: 'Solid accuracy; a few more correct reviews can lock it in.',
  };
}

export interface PracticeReadinessSummary {
  readyForExamPractice: boolean;
  label: string;
  masteredCount: number;
  proficientCount: number;
  needsPracticeCount: number;
  reviewConcepts: ConceptId[];
}

export function getPracticeReadinessSummary(
  summary: UserSummary | null | undefined,
  concepts: readonly ConceptId[],
): PracticeReadinessSummary {
  const readiness = concepts.map((conceptId) => ({
    conceptId,
    readiness: getConceptReadiness(summary?.practiceStats?.[conceptId]),
  }));
  const masteredCount = readiness.filter((entry) => entry.readiness.status === 'mastered').length;
  const proficientCount = readiness.filter((entry) => entry.readiness.status === 'proficient').length;
  const reviewConcepts = readiness
    .filter((entry) => entry.readiness.status === 'needs-practice')
    .map((entry) => entry.conceptId);
  const needsPracticeCount = reviewConcepts.length;

  return {
    readyForExamPractice: concepts.length > 0 && needsPracticeCount === 0,
    label: needsPracticeCount === 0 ? 'Ready for exam practice' : `${needsPracticeCount} concept${needsPracticeCount === 1 ? '' : 's'} to review`,
    masteredCount,
    proficientCount,
    needsPracticeCount,
    reviewConcepts,
  };
}
