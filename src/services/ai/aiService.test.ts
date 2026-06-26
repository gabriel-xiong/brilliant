import { describe, expect, it } from 'vitest';
import {
  aiExplainConceptAnother,
  aiExplainWrongAnswer,
  aiLessonRecap,
  aiRemediation,
  aiRephraseScenario,
  aiWorkedSolution,
  isAIEnabled,
} from './aiService';
import { generateProblem, solveConcept } from './conceptSchemas';

// These tests run with AI disabled (VITE_AI_ENABLED is unset under Vitest),
// so every task function must return its deterministic fallback with
// usedAI:false and must never throw.

describe('isAIEnabled', () => {
  it('is false when the env flag is not exactly "true"', () => {
    expect(isAIEnabled()).toBe(false);
  });
});

describe('AI task functions degrade gracefully when AI is disabled', () => {
  it('aiExplainWrongAnswer returns a deterministic explanation', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'Roll a die. P(even)?',
      learnerAnswer: '1/2',
      correctAnswer: '1/3',
      params: { favorable: 2, total: 6 },
    });
    expect(result.usedAI).toBe(false);
    expect(result.explanation.length).toBeGreaterThan(0);
    // References our ground-truth answer.
    expect(result.explanation).toContain('1/3');
  });

  it('aiExplainWrongAnswer tolerates a blank learner answer', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'conditional',
      prompt: 'P(rain | cloudy)?',
      learnerAnswer: '',
      correctAnswer: '2/5',
      params: { countB: 50, countAandB: 20 },
    });
    expect(result.usedAI).toBe(false);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it('aiWorkedSolution returns non-empty prose steps from the solver', async () => {
    const solution = solveConcept('and-multiply', { favA: 1, totA: 2, favB: 1, totB: 6 });
    const result = await aiWorkedSolution({
      conceptId: 'and-multiply',
      prompt: 'Coin and die.',
      solution,
    });
    expect(result.usedAI).toBe(false);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
  });

  it('aiRemediation returns a title and review', async () => {
    const result = await aiRemediation({
      conceptId: 'bayes',
      recentMistakes: ['Forgot to weight by the prior'],
    });
    expect(result.usedAI).toBe(false);
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.review.length).toBeGreaterThan(0);
  });

  it('aiRemediation works without recentMistakes', async () => {
    const result = await aiRemediation({ conceptId: 'expected-value' });
    expect(result.usedAI).toBe(false);
    expect(result.review.length).toBeGreaterThan(0);
  });

  it('aiLessonRecap returns a recap built from concepts', async () => {
    const result = await aiLessonRecap({
      lessonId: 'counting-outcomes',
      conceptIds: ['single-event', 'complement'],
      masteryLabel: 'Developing',
    });
    expect(result.usedAI).toBe(false);
    expect(result.recap.length).toBeGreaterThan(0);
  });

  it('aiExplainConceptAnother returns an alternate explanation', async () => {
    const result = await aiExplainConceptAnother({ conceptId: 'or-inclusion-exclusion' });
    expect(result.usedAI).toBe(false);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it('aiRephraseScenario falls back to the original prompt unchanged', async () => {
    const problem = generateProblem('single-event', 'core', 3);
    const result = await aiRephraseScenario(problem, 'space');
    expect(result.usedAI).toBe(false);
    expect(result.prompt).toBe(problem.prompt);
  });
});

describe('task functions never throw, even on odd input', () => {
  it('handles empty/odd params without throwing', async () => {
    await expect(
      aiExplainWrongAnswer({
        conceptId: 'single-event',
        prompt: '',
        learnerAnswer: 'xyz',
        correctAnswer: '0',
        params: { favorable: 'oops' as unknown as number, total: 0 },
      }),
    ).resolves.toMatchObject({ usedAI: false });

    await expect(
      aiLessonRecap({ lessonId: 'unknown', conceptIds: [] }),
    ).resolves.toMatchObject({ usedAI: false });
  });
});
