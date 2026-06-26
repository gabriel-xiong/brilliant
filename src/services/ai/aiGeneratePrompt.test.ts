import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../../../api/aiGenerate';

describe('aiGenerate prompt builder', () => {
  it('includes full lesson context and authored hint fields for wrong-answer hints', () => {
    const prompt = buildPrompt('explainWrong', {
      concept: 'Single-event probability',
      question: 'Now you spin the wheel 600 times. About how many should land on Face 4?',
      userAnswer: '60',
      correctAnswer: '100',
      answerMode: 'nudge',
      answerKind: 'numeric',
      hintDepth: 3,
      previousHints: ['Your selected option says "8/12 is actually right; the grid is just missing one of the winning pairs."'],
      context: 'Parent question: Now answer both parts. Prior part: one specific face on a fair six-face wheel.',
      givenFacts: ['1 favorable face', '6 total faces', '600 spins'],
      hints: ['Expected count = probability x number of spins.'],
      solverHint: 'Use 1 favorable face out of 6, then multiply by 600 spins.',
    });

    expect(prompt.user).toContain('Full lesson context: Parent question');
    expect(prompt.user).toContain('Given facts visible to learner');
    expect(prompt.user).toContain('Authored hints for this question');
    expect(prompt.user).toContain('Previous visible hints, do not repeat or restate');
    expect(prompt.user).toContain('selected-answer restatement');
    expect(prompt.user).toContain('Answer-free setup hint');
    expect(prompt.user).toContain('Hint level: 3 of 3');
    expect(prompt.user).toContain('MUST name the concrete selected claim');
    expect(prompt.user).toContain("Do not use generic phrases like 'Notice the main claim it is making'");
    expect(prompt.user).toContain("'Use elimination'");
  });
});
