import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LessonStepRenderer } from './LessonStepRenderer';
import type { ConceptStep, ProblemStep } from '../../models/lesson';
import type { QuestionView } from '../../hooks/useLessonState';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const problemStep: ProblemStep = {
  stepId: 'problem-coin-probability',
  type: 'problem',
  title: 'Expected percentage',
  question: 'About what percentage of fair coin flips should be heads?',
  choices: [
    { label: 'About 10%', value: '10%' },
    { label: 'About 50%', value: '50%' },
  ],
  answer: '50%',
  explanation: 'Heads is one successful outcome out of two possible outcomes.',
  incorrectFeedback: 'Use successful outcomes divided by total possible outcomes.',
};

const problemWithPretrieval: ProblemStep = {
  ...problemStep,
  pretrieval: {
    prompt: 'Before calculating: what should you count first?',
  },
};

describe('LessonStepRenderer', () => {
  it('submits the selected answer from a problem step', async () => {
    const user = userEvent.setup();
    const onSubmitAnswer = vi.fn();

    render(
      <LessonStepRenderer
        step={problemStep}
        feedbackState="idle"
        selectedChoice={null}
        onSubmitAnswer={onSubmitAnswer}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /check answer/i })).toBeDisabled();

    await user.click(screen.getByLabelText('About 50%'));
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(onSubmitAnswer).toHaveBeenCalledWith('50%');
  });

  it('shows incorrect feedback without revealing the answer', () => {
    render(
      <LessonStepRenderer
        step={problemStep}
        feedbackState="incorrect"
        selectedChoice="10%"
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/use successful outcomes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check answer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('shows the explanation and continue action after a correct answer', () => {
    render(
      <LessonStepRenderer
        step={problemStep}
        feedbackState="correct"
        selectedChoice="50%"
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/heads is one successful outcome/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check answer/i })).not.toBeInTheDocument();
  });
});

const coinConceptStep: ConceptStep = {
  stepId: 'concept-theoretical-probability',
  type: 'concept',
  title: 'Theoretical probability',
  body:
    "For a fair coin the two sides are equally likely: 1 heads side out of 2 → P(heads) = 1/2 = 50%. " +
    "For every 2 times we flip a coin, we'd expect 1 of them to be heads. " +
    'As your flips pile up, the observed share of heads should settle near this theoretical 50%.',
  pretrieval: {
    prompt: 'Before you flip: what share of many fair-coin flips do you expect to be heads?',
  },
};

describe('LessonStepRenderer concept coin-probability line', () => {
  it('renders authored pretrieval prompts as prominent mandatory prediction callouts after content', () => {
    render(
      <LessonStepRenderer
        step={coinConceptStep}
        feedbackState="idle"
        selectedChoice={null}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const text = document.body.textContent ?? '';
    expect(text.indexOf('For a fair coin')).toBeLessThan(text.indexOf('Before you flip'));
    expect(screen.getByText(/make a prediction/i)).toBeInTheDocument();
    expect(screen.queryByText(/low stakes/i)).not.toBeInTheDocument();
    expect(screen.getByText(/what share of many fair-coin flips/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your prediction/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save prediction/i })).toBeDisabled();
  });

  it('requires the prediction before revealing a scored problem question', async () => {
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={problemWithPretrieval}
        feedbackState="idle"
        selectedChoice={null}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/before calculating/i)).toBeInTheDocument();
    expect(screen.queryByText(/about what percentage/i)).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /save prediction/i })).toBeDisabled();
    await user.type(screen.getByLabelText(/your prediction/i), 'Count the successful outcomes first');
    expect(screen.getByRole('button', { name: /save prediction/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /save prediction/i }));

    expect(screen.getByText(/prediction saved. now test it./i)).toBeInTheDocument();
    expect(screen.getByText(/about what percentage/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check answer/i })).toBeDisabled();
  });

  it('resets the prediction gate when moving to a different pretrieval step', async () => {
    const user = userEvent.setup();
    const nextPretrievalStep: ProblemStep = {
      ...problemWithPretrieval,
      stepId: 'problem-second-pretrieval',
      title: 'Expected count',
      question: 'About how many heads should appear in 100 fair coin flips?',
      pretrieval: {
        prompt: 'Before calculating: what long-run share should you use?',
      },
    };

    const { rerender } = render(
      <LessonStepRenderer
        step={problemWithPretrieval}
        feedbackState="idle"
        selectedChoice={null}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/your prediction/i), 'Count heads and tails');
    await user.click(screen.getByRole('button', { name: /save prediction/i }));
    expect(screen.getByText(/about what percentage/i)).toBeInTheDocument();

    rerender(
      <LessonStepRenderer
        step={nextPretrievalStep}
        feedbackState="idle"
        selectedChoice={null}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    expect(screen.queryByText(/about how many heads/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/your prediction/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /save prediction/i })).toBeDisabled();
  });

  it('renders the full authored line (prefix + styled formula + suffix), not a fixed string', () => {
    const { container } = render(
      <LessonStepRenderer
        step={coinConceptStep}
        feedbackState="idle"
        selectedChoice={null}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const text = container.textContent ?? '';

    // Authored prefix (before the formula) renders verbatim.
    expect(text).toContain('For a fair coin the two sides are equally likely: 1 heads side out of 2 →');
    // Authored suffix (after the formula) renders verbatim — these sentences
    // used to be dropped by the hardcoded branch.
    expect(text).toContain("For every 2 times we flip a coin, we'd expect 1 of them to be heads.");
    expect(text).toContain('As your flips pile up, the observed share of heads should settle near this theoretical 50%.');

    // The old fixed string must no longer appear.
    expect(text).not.toContain('For a coin: 1 heads side out of 2 total sides');

    // The formula keeps its styled "P(heads)" token (bold numeric span) and the
    // stacked fraction (numerator 1 / denominator 2) inside one paragraph.
    const formulaToken = screen.getByText('P(heads)');
    expect(formulaToken).toHaveClass('numeric');
    expect(text).toContain('= 50%');
  });

  it('shows concept re-explanation as a compact in-card note when AI is enabled', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={coinConceptStep}
        feedbackState="idle"
        selectedChoice={null}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.queryByText(/want a different angle/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/your prediction/i), 'About 50%');
    await user.click(screen.getByRole('button', { name: /save prediction/i }));

    expect(screen.getByText(/want a different angle/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /explain this another way/i }));

    expect(await screen.findByText(/probability as a share/i)).toBeInTheDocument();
    const note = screen.getAllByRole('note').find((entry) => entry.textContent?.includes('Another way to see it'));
    expect(note).toBeTruthy();
    expect(note).toHaveTextContent(/another way to see it/i);
    expect(note).toHaveTextContent(/probability as a share/i);
    expect(screen.queryByText('AI')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try another wording/i })).toBeInTheDocument();
  });
});

const freeResponseStep: ProblemStep = {
  stepId: 'problem-wheel-likelihood',
  type: 'problem',
  format: 'free-response',
  title: 'Probability of one face',
  question: 'What is the probability of landing on Face 4?',
  acceptedAnswer: '1/6',
  tolerance: 0.02,
  placeholder: 'e.g. 1/6, 0.17, or 17%',
  hints: ['Count the faces.', 'One target out of six.'],
  explanation: 'One face is 1 of 6, so P = 1/6.',
  incorrectFeedback: 'Compare one target face against all six.',
};

function questionView(overrides: Partial<QuestionView> = {}): QuestionView {
  return {
    revealedHints: 0,
    unsuccessfulAttempts: 0,
    strongestHintUsed: false,
    activeStageIndex: 0,
    resolvedStages: [],
    revealedStages: [],
    stageUnsuccessfulAttempts: [],
    stageStrongestHintUsed: [],
    ...overrides,
  };
}

describe('LessonStepRenderer free-response reveal flow', () => {
  it('hides Reveal answer before any unsuccessful attempt', () => {
    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="idle"
        selectedChoice={null}
        questionView={questionView()}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={vi.fn()}
      />
    );

    expect(screen.queryByText(/count the faces/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal.*hint/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal answer/i })).not.toBeInTheDocument();
  });

  it('keeps Reveal answer hidden after one unsuccessful attempt without exposing the gate', () => {
    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="incorrect"
        selectedChoice="1/2"
        questionView={questionView({ unsuccessfulAttempts: 1 })}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /reveal answer/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock reveal answer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/try once more/i)).not.toBeInTheDocument();
  });

  it('offers Reveal answer after two unsuccessful attempts', async () => {
    const user = userEvent.setup();
    const onRevealAnswer = vi.fn();

    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="incorrect"
        selectedChoice="1/2"
        questionView={questionView({ unsuccessfulAttempts: 2 })}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={onRevealAnswer}
      />
    );

    expect(screen.queryByText(/count the faces/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/one target out of six/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal.*hint/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reveal answer/i }));
    expect(onRevealAnswer).toHaveBeenCalledTimes(1);
  });

  it('offers Reveal answer after the strongest hint is used', async () => {
    const user = userEvent.setup();
    const onRevealAnswer = vi.fn();

    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="incorrect"
        selectedChoice="1/2"
        questionView={questionView({ strongestHintUsed: true })}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={onRevealAnswer}
      />
    );

    await user.click(screen.getByRole('button', { name: /reveal answer/i }));
    expect(onRevealAnswer).toHaveBeenCalledTimes(1);
  });

  it('keeps stronger hints visible as a stacked history', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="incorrect"
        selectedChoice="1/2"
        questionView={questionView({ unsuccessfulAttempts: 1 })}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /get a hint on your answer/i }));
    expect(await screen.findByText('Hint 1')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /give me a stronger hint/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /give me a stronger hint/i }));
    expect(await screen.findByText('Hint 2')).toBeInTheDocument();
    expect(screen.getByText('Hint 1')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /give me a stronger hint/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /give me a stronger hint/i }));
    expect(await screen.findByText('Hint 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /give me a stronger hint/i })).not.toBeInTheDocument();
  });

  it('shows a generic non-revealing placeholder (never the accepted answer) for a fractional question', () => {
    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="idle"
        selectedChoice={null}
        questionView={questionView()}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Your answer');
    // Generic format hint, not derived from this question's accepted answer.
    expect(input).toHaveAttribute('placeholder', 'e.g. 1/3, 0.33, or 33%');
    // The accepted answer (1/6) must never leak through the placeholder.
    expect(screen.queryByPlaceholderText(/1\/6/)).not.toBeInTheDocument();
  });

  it('shows the accepted answer and a continue action once revealed', () => {
    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="revealed"
        selectedChoice="1/6"
        questionView={questionView({ revealedHints: 2, unsuccessfulAttempts: 2 })}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={vi.fn()}
      />
    );

    expect(screen.getByText(/answer revealed/i)).toBeInTheDocument();
    expect(screen.getByText(/the accepted answer is/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    // Revealing does not surface a Reveal answer button again.
    expect(screen.queryByRole('button', { name: /reveal answer/i })).not.toBeInTheDocument();
  });
});

const multiStageStep: ProblemStep = {
  stepId: 'problem-dice-parts',
  type: 'problem',
  format: 'multi-stage',
  title: 'From sides to probability',
  question: 'Work through both parts.',
  stages: [
    {
      stageId: 'stage-count',
      format: 'free-response',
      prompt: 'How many sides are 5 or 6?',
      acceptedAnswer: '2',
      explanation: 'The successful sides are 5 and 6.',
      hints: ['Count the high faces.'],
    },
    {
      stageId: 'stage-probability',
      format: 'free-response',
      prompt: 'What is the probability?',
      acceptedAnswer: '2/6',
      explanation: 'Two of the six faces succeed.',
      hints: ['Two out of six.'],
    },
  ],
};

describe('LessonStepRenderer multi-stage reveal status', () => {
  it('gates Reveal answer per active stage until that stage has two unsuccessful attempts', async () => {
    const user = userEvent.setup();
    const onRevealAnswer = vi.fn();
    const { rerender } = render(
      <LessonStepRenderer
        step={multiStageStep}
        feedbackState="incorrect"
        selectedChoice="1"
        questionView={questionView({ stageUnsuccessfulAttempts: [1] })}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={onRevealAnswer}
      />
    );

    expect(screen.queryByRole('button', { name: /reveal answer/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock reveal answer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/try once more/i)).not.toBeInTheDocument();

    rerender(
      <LessonStepRenderer
        step={multiStageStep}
        feedbackState="incorrect"
        selectedChoice="3"
        questionView={questionView({ stageUnsuccessfulAttempts: [2] })}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={onRevealAnswer}
      />
    );

    await user.click(screen.getByRole('button', { name: /reveal answer/i }));
    expect(onRevealAnswer).toHaveBeenCalledTimes(1);
  });

  it('renders a revealed stage as revealed, never as correct', () => {
    // Part 1 was revealed (resolved + revealed) and is now locked behind the
    // active Part 2, which was also revealed.
    render(
      <LessonStepRenderer
        step={multiStageStep}
        feedbackState="revealed"
        selectedChoice="2/6"
        questionView={{
          revealedHints: 0,
          unsuccessfulAttempts: 0,
          strongestHintUsed: false,
          activeStageIndex: 1,
          resolvedStages: [true, true],
          revealedStages: [true, true],
          stageUnsuccessfulAttempts: [2, 2],
          stageStrongestHintUsed: [false, false],
        }}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={vi.fn()}
      />
    );

    // The locked Part 1 must NOT show the green correct ✓ badge...
    expect(screen.queryByText('Part 1 ✓')).not.toBeInTheDocument();
    // ...it shows the distinct revealed badge instead.
    expect(screen.getByText('Part 1 revealed')).toBeInTheDocument();
    // Both stages carry the distinct "Answer revealed" treatment.
    expect(screen.getAllByText(/answer revealed/i).length).toBeGreaterThanOrEqual(2);
    // The revealed-and-locked Part 1 still surfaces its explanation.
    expect(screen.getByText(/the successful sides are 5 and 6/i)).toBeInTheDocument();
  });

  it('shows a correctly answered stage with the correct ✓ badge (not revealed)', () => {
    render(
      <LessonStepRenderer
        step={multiStageStep}
        feedbackState="idle"
        selectedChoice={null}
        questionView={{
          revealedHints: 0,
          unsuccessfulAttempts: 0,
          strongestHintUsed: false,
          activeStageIndex: 1,
          resolvedStages: [true, false],
          revealedStages: [false, false],
          stageUnsuccessfulAttempts: [0, 0],
          stageStrongestHintUsed: [false, false],
        }}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealAnswer={vi.fn()}
      />
    );

    // A genuinely correct stage keeps the green ✓ badge and no revealed marker.
    expect(screen.getByText('Part 1 ✓')).toBeInTheDocument();
    expect(screen.queryByText('Part 1 revealed')).not.toBeInTheDocument();
    expect(screen.queryByText(/answer revealed/i)).not.toBeInTheDocument();
  });
});

const sortStep: ProblemStep = {
  stepId: 'problem-sort-events',
  type: 'problem',
  format: 'sort',
  title: 'Sort the events',
  question: 'Place each event in the best bucket.',
  sortItems: [
    { id: 'heads', label: 'Flip heads' },
    { id: 'seven', label: 'Roll a 7 on a six-face die' },
  ],
  sortBuckets: [
    { id: 'possible', label: 'Possible' },
    { id: 'impossible', label: 'Impossible' },
  ],
  sortSolution: { heads: 'possible', seven: 'impossible' },
};

const orderStep: ProblemStep = {
  stepId: 'problem-order-events',
  type: 'problem',
  format: 'order',
  title: 'Order the events',
  question: 'Order these from least likely to most likely.',
  orderItems: [
    { id: 'rare', label: 'Being struck by lightning' },
    { id: 'weekend', label: 'A random day is a weekend' },
    { id: 'sunrise', label: 'The sun rises tomorrow' },
  ],
  orderSolution: ['rare', 'weekend', 'sunrise'],
};

const duplicateFactChoiceStep: ProblemStep = {
  stepId: 'problem-even-impossible',
  type: 'problem',
  title: 'Check the claim',
  question: 'On one fair die, A = even numbers. Which claim is wrong?',
  choices: [
    { label: 'Because even numbers are impossible.', value: 'even-impossible' },
    { label: 'Because even numbers are 2, 4, and 6.', value: 'even-possible' },
  ],
  answer: 'even-possible',
  explanation: 'Even numbers are possible on a six-sided die.',
  incorrectFeedback: 'Check the actual die faces.',
};

const limitedEvidenceChoiceStep: ProblemStep = {
  stepId: 'problem-limited-evidence',
  type: 'problem',
  title: 'Judge the evidence',
  question: 'Face 4 lands only 6 times in 60 spins. Which interpretation of this gap is best?',
  choices: [
    { label: 'The wheel must be unfair or broken.', value: 'unfair' },
    { label: 'Small samples can wobble, so collect more evidence before judging.', value: 'wobble' },
  ],
  answer: 'wobble',
  explanation: 'Small samples can land away from the expected count without proving the wheel changed.',
  incorrectFeedback: 'A short run is limited evidence.',
};

const selectedClaim = '8/12 is actually right; the grid is just missing one of the winning pairs.';

const additiveChoiceStep: ProblemStep = {
  stepId: 'problem-additive-mcq-hints',
  type: 'problem',
  title: 'Check the count',
  question: 'The grid shows 12 equally likely pairs. Which option best checks the probability claim?',
  choices: [
    { label: selectedClaim, value: 'missing-pair' },
    { label: '6/12 is right because there are six winning pairs in the visible grid.', value: 'six-visible' },
    { label: 'The grid cannot be used for this problem.', value: 'ignore-grid' },
  ],
  answer: 'six-visible',
  explanation: 'The visible grid count is the evidence for the fraction.',
  incorrectFeedback: 'Check the concrete count of winning pairs in the grid before trusting that fraction.',
};

describe('LessonStepRenderer AI feedback for interaction questions', () => {
  it('does not offer a stronger MCQ hint when the next hint would repeat the same fact', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={duplicateFactChoiceStep}
        feedbackState="incorrect"
        selectedChoice="even-impossible"
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /get a hint on your answer/i }));

    expect(await screen.findByText('Hint 1')).toBeInTheDocument();
    expect(await screen.findByText(/even numbers are possible/i)).toBeInTheDocument();
    expect(screen.queryByText('Hint 2')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /give me a stronger hint/i })).not.toBeInTheDocument();
  });

  it('caps limited-evidence MCQ hints at Hint 2 instead of padding to Hint 3', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={limitedEvidenceChoiceStep}
        feedbackState="incorrect"
        selectedChoice="unfair"
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /get a hint on your answer/i }));
    expect(await screen.findByText('Hint 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /give me a stronger hint/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /give me a stronger hint/i }));
    expect(await screen.findByText('Hint 2')).toBeInTheDocument();
    expect(screen.queryByText('Hint 3')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /give me a stronger hint/i })).not.toBeInTheDocument();
  });

  it('renders MCQ stronger hints without repeating the selected-option claim', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={additiveChoiceStep}
        feedbackState="incorrect"
        selectedChoice="missing-pair"
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /get a hint on your answer/i }));
    await screen.findByText('Hint 1');
    const hint1Note = screen.getAllByRole('note').find((note) => note.textContent?.includes('Hint 1'));
    expect(hint1Note).toBeDefined();
    expect(hint1Note!).toHaveTextContent(selectedClaim);

    await user.click(screen.getByRole('button', { name: /give me a stronger hint/i }));
    await screen.findByText('Hint 2');
    const hint2Note = screen.getAllByRole('note').find((note) => note.textContent?.includes('Hint 2'));
    expect(hint2Note).toBeDefined();
    expect(hint2Note!).toHaveTextContent(/exact outcome or count/i);
    expect(hint2Note!).not.toHaveTextContent(selectedClaim);
    expect(hint2Note!).not.toHaveTextContent(/your selected option says/i);

    await user.click(screen.getByRole('button', { name: /give me a stronger hint/i }));
    await screen.findByText('Hint 3');
    const hint3Note = screen.getAllByRole('note').find((note) => note.textContent?.includes('Hint 3'));
    expect(hint3Note).toBeDefined();
    expect(hint3Note!).toHaveTextContent(/use this test/i);
    expect(hint3Note!).not.toHaveTextContent(selectedClaim);
    expect(hint3Note!).not.toHaveTextContent(/your selected option says/i);

    const visibleHintText = screen.getAllByRole('note').map((note) => note.textContent ?? '').join(' ');
    expect(visibleHintText.match(new RegExp(selectedClaim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(1);
  });

  it('offers answer-aware AI feedback after an incorrect sort interaction', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={sortStep}
        feedbackState="incorrect"
        selectedChoice='{"heads":"impossible","seven":"possible"}'
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /get a hint on your answer/i }));

    expect(await screen.findByText(/re-check "flip heads"/i)).toBeInTheDocument();
    expect(screen.queryByText(/does not read like a probability value/i)).not.toBeInTheDocument();
  });

  it('clears an old AI nudge when the submitted sort answer changes', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    const { rerender } = render(
      <LessonStepRenderer
        step={sortStep}
        feedbackState="incorrect"
        selectedChoice='{"heads":"impossible","seven":"possible"}'
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /get a hint on your answer/i }));
    expect(await screen.findByText(/re-check "flip heads"/i)).toBeInTheDocument();

    rerender(
      <LessonStepRenderer
        step={sortStep}
        feedbackState="incorrect"
        selectedChoice='{"heads":"possible","seven":"possible"}'
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /get a hint on your answer/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/re-check "flip heads"/i)).not.toBeInTheDocument();
  });

  it('offers answer-aware AI feedback after an incorrect order interaction', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={orderStep}
        feedbackState="incorrect"
        selectedChoice='["sunrise","weekend","rare"]'
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /get a hint on your answer/i }));

    expect(await screen.findByText(/relative order of "the sun rises tomorrow" and "a random day is a weekend"/i)).toBeInTheDocument();
    expect(screen.queryByText(/does not read like a probability value/i)).not.toBeInTheDocument();
  });

  it('renders stronger order hints as additive guidance instead of repeating prior hints', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();

    render(
      <LessonStepRenderer
        step={orderStep}
        feedbackState="incorrect"
        selectedChoice='["sunrise","weekend","rare"]'
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /get a hint on your answer/i }));
    const hint1 = await screen.findByText(/relative order of "the sun rises tomorrow" and "a random day is a weekend"/i);
    const hint1Text = hint1.textContent ?? '';

    await user.click(screen.getByRole('button', { name: /give me a stronger hint/i }));
    await screen.findByText(/scale labels/i);

    const hint2Note = screen.getAllByRole('note').find((note) => note.textContent?.includes('Hint 2'));
    expect(hint2Note).toBeDefined();
    expect(hint2Note).toHaveTextContent(/scale labels/i);
    expect(hint2Note?.textContent).not.toContain(hint1Text);
    const hint2Text = hint2Note?.textContent ?? '';

    await user.click(screen.getByRole('button', { name: /give me a stronger hint/i }));
    await screen.findByText(/lower-chance event left/i);

    const hint3Note = screen.getAllByRole('note').find((note) => note.textContent?.includes('Hint 3'));
    expect(hint3Note).toBeDefined();
    expect(hint3Note).toHaveTextContent(/compare neighboring events/i);
    expect(hint3Note).toHaveTextContent(/sweep through the list/i);
    expect(hint3Note?.textContent).not.toContain(hint1Text);
    expect(hint3Note?.textContent).not.toContain(hint2Text);
  });
});

