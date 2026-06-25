import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LessonStepRenderer } from './LessonStepRenderer';
import type { ConceptStep, ProblemStep } from '../../models/lesson';

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
};

describe('LessonStepRenderer concept coin-probability line', () => {
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

describe('LessonStepRenderer free-response reveal flow', () => {
  it('does not show hints until the learner reveals them on demand', async () => {
    const user = userEvent.setup();
    const onRevealHint = vi.fn();

    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="idle"
        selectedChoice={null}
        questionView={{ revealedHints: 0, activeStageIndex: 0, resolvedStages: [], revealedStages: [] }}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealHint={onRevealHint}
        onRevealAnswer={vi.fn()}
      />
    );

    // No hint text is visible before the learner asks for one.
    expect(screen.queryByText(/count the faces/i)).not.toBeInTheDocument();

    const revealHintButton = screen.getByRole('button', { name: /reveal a hint/i });
    await user.click(revealHintButton);
    expect(onRevealHint).toHaveBeenCalledTimes(1);
  });

  it('offers Reveal answer only after every hint is revealed', async () => {
    const user = userEvent.setup();
    const onRevealAnswer = vi.fn();

    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="incorrect"
        selectedChoice="1/2"
        questionView={{ revealedHints: 2, activeStageIndex: 0, resolvedStages: [], revealedStages: [] }}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealHint={vi.fn()}
        onRevealAnswer={onRevealAnswer}
      />
    );

    // Both hints are now visible.
    expect(screen.getByText(/count the faces/i)).toBeInTheDocument();
    expect(screen.getByText(/one target out of six/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal.*hint/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reveal answer/i }));
    expect(onRevealAnswer).toHaveBeenCalledTimes(1);
  });

  it('shows a generic non-revealing placeholder (never the accepted answer) for a fractional question', () => {
    render(
      <LessonStepRenderer
        step={freeResponseStep}
        feedbackState="idle"
        selectedChoice={null}
        questionView={{ revealedHints: 0, activeStageIndex: 0, resolvedStages: [], revealedStages: [] }}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealHint={vi.fn()}
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
        questionView={{ revealedHints: 2, activeStageIndex: 0, resolvedStages: [], revealedStages: [] }}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealHint={vi.fn()}
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
          activeStageIndex: 1,
          resolvedStages: [true, true],
          revealedStages: [true, true],
        }}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealHint={vi.fn()}
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
          activeStageIndex: 1,
          resolvedStages: [true, false],
          revealedStages: [false, false],
        }}
        onSubmitAnswer={vi.fn()}
        onAdvance={vi.fn()}
        onRevealHint={vi.fn()}
        onRevealAnswer={vi.fn()}
      />
    );

    // A genuinely correct stage keeps the green ✓ badge and no revealed marker.
    expect(screen.getByText('Part 1 ✓')).toBeInTheDocument();
    expect(screen.queryByText('Part 1 revealed')).not.toBeInTheDocument();
    expect(screen.queryByText(/answer revealed/i)).not.toBeInTheDocument();
  });
});

