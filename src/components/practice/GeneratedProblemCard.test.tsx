import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeneratedProblemCard from './GeneratedProblemCard';
import type { GeneratedProblem } from '../../services/ai/types';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GeneratedProblemCard', () => {
  it('shows the concept chip by default for single-topic practice', () => {
    const problem = {
      id: 'practice-single-event-label',
      conceptId: 'single-event',
      difficulty: 'intro',
      level: 2,
      params: { favorable: 2, total: 8 },
      prompt: 'A spinner has 8 equal slices; 2 are gold. What is P(gold)?',
      acceptedAnswer: '1/4',
      acceptedDecimal: 0.25,
      tolerance: 0.02,
      source: 'deterministic',
    } as unknown as GeneratedProblem;

    render(<GeneratedProblemCard problem={problem} />);

    expect(screen.getByText('Single-event probability')).toBeInTheDocument();
    expect(screen.getByText('Warm-up · Lv 2')).toBeInTheDocument();
  });

  it('hides the concept chip when an interleaved practice session requests it', () => {
    const problem = {
      id: 'practice-single-event-hidden-label',
      conceptId: 'single-event',
      difficulty: 'intro',
      level: 2,
      params: { favorable: 2, total: 8 },
      prompt: 'A spinner has 8 equal slices; 2 are gold. What is P(gold)?',
      acceptedAnswer: '1/4',
      acceptedDecimal: 0.25,
      tolerance: 0.02,
      source: 'deterministic',
    } as unknown as GeneratedProblem;

    render(<GeneratedProblemCard problem={problem} hideConceptLabel />);

    expect(screen.queryByText('Single-event probability')).not.toBeInTheDocument();
    expect(screen.getByText('Warm-up · Lv 2')).toBeInTheDocument();
  });

  it('keeps retrieval as an optional preceding planning step', async () => {
    const user = userEvent.setup();
    const problem = {
      id: 'practice-single-event',
      conceptId: 'single-event',
      difficulty: 'intro',
      level: 2,
      params: { favorable: 2, total: 8 },
      prompt: 'A spinner has 8 equal slices; 2 are gold. What is P(gold)?',
      retrievalPrompt: 'What should you count before calculating?',
      retrievalFocus: 'favorable-outcomes',
      scaffold: {
        practiceLevel: 2,
        level: 'guided',
        cue: 'Count favorable slices first, then compare them to all slices.',
      },
      acceptedAnswer: '1/4',
      acceptedDecimal: 0.25,
      tolerance: 0.02,
      source: 'deterministic',
    } as unknown as GeneratedProblem;

    render(<GeneratedProblemCard problem={problem} />);

    expect(screen.getByRole('button', { name: /try first: plan your approach/i })).toBeInTheDocument();
    expect(screen.queryByText(/what should you count before calculating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/helpful cue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/count favorable slices first/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try first: plan your approach/i }));

    expect(screen.getByText(/before solving/i)).toBeInTheDocument();
    expect(screen.getByText(/what should you count before calculating/i)).toBeInTheDocument();
    expect(screen.queryByText(/helpful cue/i)).not.toBeInTheDocument();
  });

  it('strips old embedded planning and cue text from stale cached prompts', () => {
    const staleProblem = {
      id: 'practice-single-event-stale',
      conceptId: 'single-event',
      difficulty: 'intro',
      level: 1,
      params: { favorable: 4, total: 11 },
      prompt:
        'Before calculating, identify the favorable outcomes and the total outcomes. Cue: Use favorable outcomes over total equally likely outcomes. Then solve: A shelf has 11 sealed boxes and 4 of them contain a toy. Picking one box at random, what is the probability it has a toy?',
      retrievalPrompt: 'Before calculating, identify the favorable outcomes and the total outcomes.',
      acceptedAnswer: '4/11',
      acceptedDecimal: 4 / 11,
      tolerance: 0.02,
      source: 'deterministic',
    } as unknown as GeneratedProblem;

    render(<GeneratedProblemCard problem={staleProblem} />);

    expect(screen.getByText(/a shelf has 11 sealed boxes/i)).toBeInTheDocument();
    expect(screen.queryByText(/cue:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/helpful cue/i)).not.toBeInTheDocument();
  });

  it('shows combined revealing feedback after a wrong practice answer', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'false');
    const user = userEvent.setup();
    const problem = {
      id: 'practice-single-event',
      conceptId: 'single-event',
      difficulty: 'core',
      level: 4,
      params: { favorable: 2, total: 8 },
      prompt: 'A spinner has 8 equal slices; 2 are gold. What is P(gold)?',
      acceptedAnswer: '1/4',
      acceptedDecimal: 0.25,
      tolerance: 0.02,
      source: 'deterministic',
    } as unknown as GeneratedProblem;

    render(<GeneratedProblemCard problem={problem} />);

    await user.type(screen.getByLabelText(/your answer/i), '1/2');
    await user.click(screen.getByRole('button', { name: /check answer/i }));

    expect(screen.queryByRole('button', { name: /explain my answer/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /why was my answer wrong\?/i }));

    const advice = await screen.findByRole('note');
    expect(advice).toHaveTextContent(/your answer was wrong because/i);
    expect(advice).toHaveTextContent(/too large/i);
    expect(advice).toHaveTextContent(/full solution/i);
    expect(advice).toHaveTextContent('1/4');
    expect(advice).toHaveTextContent(/favorable outcomes/i);
    expect(screen.queryByRole('button', { name: /show worked solution/i })).not.toBeInTheDocument();
  });

  it('does not crash when an older cached problem is missing a solution', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'false');
    const user = userEvent.setup();
    const staleProblem = {
      id: 'stale-single-event',
      conceptId: 'single-event',
      difficulty: 'core',
      level: 4,
      params: { favorable: 2, total: 8 },
      prompt: 'A spinner has 8 equal slices; 2 are gold. What is P(gold)?',
      acceptedAnswer: '1/4',
      acceptedDecimal: 0.25,
      tolerance: 0.02,
      source: 'ai',
    } as unknown as GeneratedProblem;

    render(<GeneratedProblemCard problem={staleProblem} />);

    await user.type(screen.getByLabelText(/your answer/i), '1/2');
    await user.click(screen.getByRole('button', { name: /check answer/i }));
    await user.click(screen.getByRole('button', { name: /why was my answer wrong\?/i }));

    expect(await screen.findByRole('note')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/full solution/i);
    expect(screen.getByText(/favorable outcomes/i)).toBeInTheDocument();
  });
});
