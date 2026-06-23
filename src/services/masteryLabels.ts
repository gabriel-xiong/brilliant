import { LessonProgress } from './progressService';

export const masteryLabels: Record<LessonProgress['masteryStatus'], string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  'almost-done': 'Almost done',
  completed: 'Needs practice',
  mastered: 'Mastered',
};

export function getMasteryLabel(status?: LessonProgress['masteryStatus'] | string) {
  if (!status) return masteryLabels['not-started'];
  if (status === 'exploring' || status === 'building') return masteryLabels['in-progress'];
  if (status === 'proficient') return masteryLabels['almost-done'];
  if (status === 'practice-ready') return masteryLabels.completed;
  return masteryLabels[status as LessonProgress['masteryStatus']] ?? status;
}
