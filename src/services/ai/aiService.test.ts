import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const GENERIC_HINT_PHRASES =
  /notice the main claim|compare .* with|look for where it adds|read each option as a claim|use elimination|look directly at|that phrase is the constraint|name the event|rule in the prompt/i;

// Force AI off so every task function exercises its deterministic fallback and
// never depends on a deployed endpoint during unit tests.

beforeEach(() => {
  vi.stubEnv('VITE_AI_ENABLED', 'false');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

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
    expect(result.explanation).toContain('The correct answer is 1/3');
    expect(result.explanation).not.toContain('Walk through it');
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

  it('aiExplainWrongAnswer nudge mode reacts to different submitted answers without revealing', async () => {
    const low = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'A spinner has 2 gold slices out of 8. P(gold)?',
      learnerAnswer: '1/8',
      correctAnswer: '1/4',
      params: { favorable: 2, total: 8 },
      answerMode: 'nudge',
    });
    const high = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'A spinner has 2 gold slices out of 8. P(gold)?',
      learnerAnswer: '1/2',
      correctAnswer: '1/4',
      params: { favorable: 2, total: 8 },
      answerMode: 'nudge',
    });

    expect(low.usedAI).toBe(false);
    expect(high.usedAI).toBe(false);
    expect(low.explanation).toContain('too small');
    expect(high.explanation).toContain('too large');
    expect(low.explanation).not.toContain('1/4');
    expect(high.explanation).not.toContain('1/4');
    expect(low.explanation).not.toContain('The correct answer is');
    expect(high.explanation).not.toContain('The correct answer is');
    expect(low.explanation).not.toContain('Walk through it');
    expect(high.explanation).not.toContain('Walk through it');
  });

  it('aiExplainWrongAnswer nudge mode stays specific without solver params', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'A spinner has 2 gold slices out of 8. P(gold)?',
      learnerAnswer: '1/2',
      correctAnswer: '1/4',
      params: {},
      answerMode: 'nudge',
      answerKind: 'numeric',
    });

    expect(result.usedAI).toBe(false);
    expect(result.explanation).toContain('too large');
    expect(result.explanation).not.toContain('1/4');
    expect(result.explanation).not.toContain('P: 0');
    expect(result.explanation).not.toContain('For Single-event probability');
  });

  it('aiExplainWrongAnswer Hint 3 gives answer-free numeric walkthrough steps', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'A spinner has 2 gold slices out of 8. About how many gold spins should you expect out of 600?',
      learnerAnswer: '150',
      correctAnswer: '150',
      params: { favorable: 2, total: 8 },
      answerMode: 'nudge',
      answerKind: 'numeric',
      hintDepth: 3,
    });

    expect(result.usedAI).toBe(false);
    expect(result.explanation).toContain('one-trial probability');
    expect(result.explanation).toContain('2 favorable outcomes');
    expect(result.explanation).toContain('8 total equally likely outcomes');
    expect(result.explanation).toContain('600 trials/spins');
    expect(result.explanation).toContain('then multiply by 600');
    expect(result.explanation).not.toMatch(/percent|convert/i);
    expect(result.explanation).not.toContain('150');
    expect(result.explanation).not.toContain('The correct answer is');
  });

  it('aiExplainWrongAnswer Hint 3 extracts one-face/six-face givens without params', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'On a single spin of the fair six-face wheel, what is the probability of landing on one specific face, like Face 4?',
      learnerAnswer: '1/2',
      correctAnswer: '1/6',
      params: {},
      answerMode: 'nudge',
      answerKind: 'numeric',
      hintDepth: 3,
    });

    expect(result.usedAI).toBe(false);
    expect(result.explanation).toContain('1 favorable face');
    expect(result.explanation).toContain('6 total equally likely faces');
    expect(result.explanation).not.toMatch(/percent|convert/i);
    expect(result.explanation).not.toContain('1/6');
    expect(result.explanation).not.toContain('The correct answer is');
  });

  it('aiExplainWrongAnswer Hint 3 uses prior/context numbers for expected-count prompts', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'Now you spin the wheel 600 times. About how many of those spins should land on Face 4?',
      learnerAnswer: '60',
      correctAnswer: '100',
      params: {},
      answerMode: 'nudge',
      answerKind: 'numeric',
      hintDepth: 3,
      context:
        'Setup shown before question: The wheel has 6 equal slices. Prior part: On a single spin of the fair six-face wheel, what is the probability of landing on one specific face, like Face 4?',
      hints: ['You just found that each spin lands on Face 4 with probability 1/6.', 'Expected count = probability x number of spins.'],
    });

    expect(result.usedAI).toBe(false);
    expect(result.explanation).toContain('1 favorable face');
    expect(result.explanation).toContain('6');
    expect(result.explanation).toContain('600 spins');
    expect(result.explanation).not.toMatch(/percent|convert/i);
    expect(result.explanation).not.toContain('100');
    expect(result.explanation).not.toContain('The correct answer is');
    expect(result.maxHintDepth).toBe(3);
    expect(result.hasMoreHints).toBe(false);
  });

  it('aiExplainWrongAnswer ignores part labels when extracting expected-count totals', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'Part 2. Now you spin the wheel 600 times. About how many of those spins should land on Face 4? Enter a whole number.',
      learnerAnswer: '60',
      correctAnswer: '100',
      params: {},
      answerMode: 'nudge',
      answerKind: 'numeric',
      hintDepth: 3,
      context:
        'Part 1. On a single spin of the fair six-face wheel, what is the probability of landing on one specific face, like Face 4?',
      hints: ['Expected count = probability x number of spins.'],
    });

    expect(result.usedAI).toBe(false);
    expect(result.explanation).toContain('Face 4');
    expect(result.explanation).toContain('1 favorable face out of 6 total faces');
    expect(result.explanation).toContain('600 spins');
    expect(result.explanation).not.toContain('out of 2');
    expect(result.explanation).not.toContain('100');
    expect(result.explanation).not.toMatch(GENERIC_HINT_PHRASES);
  });

  it('aiExplainWrongAnswer keeps numeric expected-count hints open through Hint 3', async () => {
    const base = {
      conceptId: 'single-event' as const,
      prompt: 'Part 2. Now you spin the wheel 600 times. About how many of those spins should land on Face 4? Enter a whole number.',
      learnerAnswer: '60',
      correctAnswer: '100',
      params: {},
      answerMode: 'nudge' as const,
      answerKind: 'numeric' as const,
      context:
        'Part 1. On a single spin of the fair six-face wheel, what is the probability of landing on one specific face, like Face 4?',
      hints: ['Expected count = probability x number of spins.'],
    };

    const hint2 = await aiExplainWrongAnswer({ ...base, hintDepth: 2 });
    const hint3 = await aiExplainWrongAnswer({ ...base, hintDepth: 3 });

    expect(hint2.maxHintDepth).toBe(3);
    expect(hint2.hasMoreHints).toBe(true);
    expect(hint3.maxHintDepth).toBe(3);
    expect(hint3.hasMoreHints).toBe(false);
    expect(hint3.explanation).toContain('Then multiply by 600 spins');
    expect(hint3.explanation).not.toContain('100');
  });

  it('aiExplainWrongAnswer Hint 3 keeps complement walkthrough format-neutral', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'complement',
      prompt: 'A bag has 3 red balls out of 10. What is P(not red)?',
      learnerAnswer: '3/10',
      correctAnswer: '7/10',
      params: { favorable: 3, total: 10 },
      answerMode: 'nudge',
      answerKind: 'numeric',
      hintDepth: 3,
    });

    expect(result.usedAI).toBe(false);
    expect(result.explanation).toContain('subtract that probability from 1');
    expect(result.explanation).not.toMatch(/percent|convert/i);
    expect(result.explanation).not.toContain('7/10');
    expect(result.explanation).not.toContain('The correct answer is');
  });

  it('aiExplainWrongAnswer Hint 3 gives concrete count guidance for named die-side events', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'For the event "5 or 6," how many of the six die sides are successful outcomes? Enter a whole number.',
      learnerAnswer: '1',
      correctAnswer: '2',
      params: {},
      answerMode: 'nudge',
      answerKind: 'numeric',
      hintDepth: 3,
    });

    expect(result.usedAI).toBe(false);
    expect(result.explanation).toContain('5 and 6');
    expect(result.explanation).toContain('Count the named successful die sides');
    expect(result.explanation).not.toMatch(/expected count|percent|probability/i);
    expect(result.explanation).not.toMatch(GENERIC_HINT_PHRASES);
    expect(result.explanation).not.toContain('The correct answer is');
  });

  it('aiExplainWrongAnswer Hint 2 gives concrete probability givens for named die-side events', async () => {
    const result = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'Using that count, what is the probability of rolling a 5 or 6? Enter a fraction, decimal, or percent.',
      learnerAnswer: '1/6',
      correctAnswer: '2/6',
      params: {},
      answerMode: 'nudge',
      answerKind: 'numeric',
      hintDepth: 2,
      context: 'Setup shown before question: the total stays 6. Prior part: For the event "5 or 6," how many of the six die sides are successful outcomes?',
    });

    expect(result.usedAI).toBe(false);
    expect(result.explanation).toContain('rolling either 5 or 6');
    expect(result.explanation).toContain('successful sides are 5 and 6');
    expect(result.explanation).toContain('total equally likely sides are 1 through 6');
    expect(result.explanation).not.toMatch(GENERIC_HINT_PHRASES);
    expect(result.explanation).not.toContain('2/6');
  });

  it('aiExplainWrongAnswer gives concrete sort hints for even-but-not-six bucket mistakes', async () => {
    const base = {
      conceptId: 'single-event' as const,
      prompt: 'Drag each face into "Even, but NOT a 6" or "Everything else."',
      learnerAnswer: '2 -> Even, but NOT a 6; 3 -> Even, but NOT a 6; 6 -> Even, but NOT a 6; 1 -> Everything else; 4 -> Everything else; 5 -> Everything else',
      correctAnswer: '1 -> Everything else; 2 -> Even, but NOT a 6; 3 -> Everything else; 4 -> Even, but NOT a 6; 5 -> Everything else; 6 -> Everything else',
      params: {},
      answerMode: 'nudge' as const,
      answerKind: 'sort' as const,
    };
    const hint2 = await aiExplainWrongAnswer({ ...base, hintDepth: 2 });
    const hint3 = await aiExplainWrongAnswer({ ...base, hintDepth: 3 });

    expect(hint2.usedAI).toBe(false);
    expect(hint3.usedAI).toBe(false);
    expect(hint2.explanation).toContain('3 is not even');
    expect(hint2.explanation).toContain('Everything else');
    expect(hint3.explanation).toContain('is it even, and is it not 6');
    expect(hint3.explanation).toContain('6 is even, but "not a 6" excludes it');
    expect(hint3.explanation).toContain('4 is even and not 6');
    expect(`${hint2.explanation} ${hint3.explanation}`).not.toMatch(GENERIC_HINT_PHRASES);
  });

  it('aiExplainWrongAnswer uses nonnumeric sort/order feedback without probability-value parsing', async () => {
    const sort = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'Sort each event.',
      learnerAnswer: 'Flip heads -> Impossible; Roll a 7 on a six-face die -> Possible',
      correctAnswer: 'Flip heads -> Possible; Roll a 7 on a six-face die -> Impossible',
      params: {},
      answerMode: 'nudge',
      answerKind: 'sort',
    });
    const order = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'Order least likely to most likely.',
      learnerAnswer: '1. The sun rises tomorrow; 2. A random day is a weekend; 3. Being struck by lightning',
      correctAnswer: '1. Being struck by lightning; 2. A random day is a weekend; 3. The sun rises tomorrow',
      params: {},
      answerMode: 'nudge',
      answerKind: 'order',
    });

    expect(sort.explanation).not.toContain('does not read like a probability value');
    expect(order.explanation).not.toContain('does not read like a probability value');
    expect(sort.explanation).toContain('Re-check');
    expect(order.explanation).toContain('relative order');
  });

  it('aiExplainWrongAnswer uses selected choice misconceptions for distinct MCQ nudges', async () => {
    const choices = [
      { label: 'It is impossible for a fair wheel to land low after 60 spins.', value: 'impossible' },
      { label: 'The wheel must be unfair or broken.', value: 'unfair' },
      { label: 'Small samples can wobble, so spin more before judging.', value: 'wobble' },
    ];
    const impossible = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'After 60 spins, Face 4 lands fewer times than expected. **Which interpretation of this gap is best**?',
      learnerAnswer: choices[0].label,
      correctAnswer: choices[2].label,
      params: {},
      answerMode: 'nudge',
      answerKind: 'choice',
      hintDepth: 2,
      choices,
      selectedChoice: choices[0],
      correctChoice: choices[2],
    });
    const unfair = await aiExplainWrongAnswer({
      conceptId: 'single-event',
      prompt: 'After 60 spins, Face 4 lands fewer times than expected. **Which interpretation of this gap is best**?',
      learnerAnswer: choices[1].label,
      correctAnswer: choices[2].label,
      params: {},
      answerMode: 'nudge',
      answerKind: 'choice',
      hintDepth: 2,
      choices,
      selectedChoice: choices[1],
      correctChoice: choices[2],
    });

    expect(impossible.usedAI).toBe(false);
    expect(unfair.usedAI).toBe(false);
    expect(impossible.explanation).toContain('cannot happen');
    expect(impossible.explanation).toContain('possible outcomes');
    expect(unfair.explanation).toContain('limited evidence');
    expect(unfair.explanation).toContain('die or wheel changed');
    expect(impossible.explanation).not.toBe(unfair.explanation);
    expect(impossible.explanation).not.toContain(choices[2].label);
    expect(unfair.explanation).not.toContain(choices[2].label);
    expect(`${impossible.explanation} ${unfair.explanation}`).not.toMatch(GENERIC_HINT_PHRASES);
  });

  it('aiExplainWrongAnswer gives concrete MCQ hints for empty-event wrong claims', async () => {
    const choices = [
      { label: 'Because side 6 is counted in both A and B.', value: 'double-count-six' },
      { label: 'Because even numbers are impossible.', value: 'even-impossible' },
      { label: 'Because greater than 4 has no outcomes.', value: 'no-high' },
      { label: 'Because "or" always means exactly one event.', value: 'exactly-one' },
    ];
    const base = {
      conceptId: 'or-inclusion-exclusion' as const,
      prompt: 'On one fair die, A = even numbers and B = numbers greater than 4. Why is P(A or B) not 5/6?',
      learnerAnswer: choices[2].label,
      correctAnswer: choices[0].label,
      params: {},
      answerMode: 'nudge' as const,
      answerKind: 'choice' as const,
      choices,
      selectedChoice: choices[2],
      correctChoice: choices[0],
    };
    const hint1 = await aiExplainWrongAnswer({ ...base, hintDepth: 1 });
    const hint3 = await aiExplainWrongAnswer({ ...base, hintDepth: 3 });

    expect(hint1.usedAI).toBe(false);
    expect(hint3.usedAI).toBe(false);
    expect(hint1.explanation).toContain('Greater than 4 does have outcomes');
    expect(hint1.explanation).toContain('5 and 6');
    expect(hint1.explanation).toContain('removes outcomes');
    expect(hint3.explanation).toContain('For A or B');
    expect(hint3.explanation).toContain('greater than 4 means 5 or 6');
    expect(`${hint1.explanation} ${hint3.explanation}`).not.toMatch(GENERIC_HINT_PHRASES);
    expect(hint3.explanation).not.toContain(choices[0].label);
  });

  it('aiExplainWrongAnswer gives substantially different MCQ Hint 3 guidance by wrong claim', async () => {
    const choices = [
      { label: 'It is impossible for a fair wheel to land on Face 4 only 6 times in 60 spins.', value: 'impossible' },
      { label: 'The wheel must be unfair or broken.', value: 'unfair' },
      { label: 'Face 4\'s true probability has permanently changed to 6/60.', value: 'changed' },
      { label: 'It is unlikely but not impossible — small samples wobble around 1/6, so spin many more times before judging.', value: 'wobble' },
    ];
    const base = {
      conceptId: 'single-event' as const,
      prompt: 'Face 4 lands only 6 times in 60 spins. Which interpretation of this gap is best?',
      correctAnswer: choices[3].label,
      params: {},
      answerMode: 'nudge' as const,
      answerKind: 'choice' as const,
      hintDepth: 3 as const,
      choices,
      correctChoice: choices[3],
      explanation: 'Observed frequencies wobble around the theoretical 1/6, especially for small samples.',
    };

    const impossible = await aiExplainWrongAnswer({
      ...base,
      learnerAnswer: choices[0].label,
      selectedChoice: choices[0],
    });
    const unfair = await aiExplainWrongAnswer({
      ...base,
      learnerAnswer: choices[1].label,
      selectedChoice: choices[1],
    });
    const changed = await aiExplainWrongAnswer({
      ...base,
      learnerAnswer: choices[2].label,
      selectedChoice: choices[2],
    });

    expect(impossible.explanation).toContain('cannot happen');
    expect(impossible.explanation).toContain('possible outcomes');
    expect(unfair.explanation).toContain('limited evidence');
    expect(unfair.explanation).toContain('die or wheel changed');
    expect(changed.explanation).toContain('observed result');
    expect(changed.explanation).toContain('new true probability');
    expect(new Set([impossible.explanation, unfair.explanation, changed.explanation]).size).toBe(3);
    expect(impossible.explanation).not.toContain(choices[3].label);
    expect(unfair.explanation).not.toContain(choices[3].label);
    expect(changed.explanation).not.toContain(choices[3].label);
    expect(`${impossible.explanation} ${unfair.explanation} ${changed.explanation}`).not.toMatch(GENERIC_HINT_PHRASES);
  });

  it('aiExplainWrongAnswer makes simple MCQ hints additive without repeating the selected claim', async () => {
    const selectedClaim = '8/12 is actually right; the grid is just missing one of the winning pairs.';
    const choices = [
      { label: selectedClaim, value: 'missing-pair' },
      { label: '6/12 is right because there are six winning pairs in the visible grid.', value: 'six-visible' },
      { label: 'The grid cannot be used for this problem.', value: 'ignore-grid' },
    ];
    const base = {
      conceptId: 'or-inclusion-exclusion' as const,
      prompt: 'The grid shows 12 equally likely pairs. Which option best checks the probability claim?',
      learnerAnswer: selectedClaim,
      correctAnswer: choices[1].label,
      params: {},
      answerMode: 'nudge' as const,
      answerKind: 'choice' as const,
      choices,
      selectedChoice: choices[0],
      correctChoice: choices[1],
      incorrectFeedback: 'Check the concrete count of winning pairs in the grid before trusting that fraction.',
    };

    const hint1 = await aiExplainWrongAnswer({ ...base, hintDepth: 1 });
    const hint2 = await aiExplainWrongAnswer({ ...base, hintDepth: 2, previousHints: [hint1.explanation] });
    const hint3 = await aiExplainWrongAnswer({ ...base, hintDepth: 3, previousHints: [hint1.explanation, hint2.explanation] });

    expect(hint1.explanation).toContain(selectedClaim);
    expect(hint2.explanation).not.toContain(selectedClaim);
    expect(hint3.explanation).not.toContain(selectedClaim);
    expect(hint2.explanation).not.toContain('Your selected option says');
    expect(hint3.explanation).not.toContain('Your selected option says');
    expect(`${hint1.explanation} ${hint2.explanation} ${hint3.explanation}`.match(new RegExp(selectedClaim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(1);
    expect(hint1.hasMoreHints).toBe(true);
    expect(hint2.hasMoreHints).toBe(true);
    expect(hint3.hasMoreHints).toBe(false);
  });

  it('aiExplainWrongAnswer caps simple limited-evidence MCQ hints before a repetitive third hint', async () => {
    const choices = [
      { label: 'The wheel must be unfair or broken.', value: 'unfair' },
      { label: 'Small samples can wobble, so collect more evidence before judging.', value: 'wobble' },
    ];
    const base = {
      conceptId: 'single-event' as const,
      prompt: 'Face 4 lands only 6 times in 60 spins. Which interpretation of this gap is best?',
      learnerAnswer: choices[0].label,
      correctAnswer: choices[1].label,
      params: {},
      answerMode: 'nudge' as const,
      answerKind: 'choice' as const,
      choices,
      selectedChoice: choices[0],
      correctChoice: choices[1],
    };

    const hint1 = await aiExplainWrongAnswer({ ...base, hintDepth: 1 });
    const hint2 = await aiExplainWrongAnswer({ ...base, hintDepth: 2 });

    expect(hint1.maxHintDepth).toBe(2);
    expect(hint1.hasMoreHints).toBe(true);
    expect(hint2.maxHintDepth).toBe(2);
    expect(hint2.hasMoreHints).toBe(false);
    expect(hint1.explanation).toContain('limited evidence');
    expect(hint2.explanation).toContain('limited evidence');
    expect(hint2.explanation).toContain('die or wheel changed');
    expect(hint2.explanation).not.toBe(hint1.explanation);
    expect(hint2.explanation).not.toContain(choices[1].label);
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
