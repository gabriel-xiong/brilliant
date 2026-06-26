import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GeneratedProblemCard from './GeneratedProblemCard';
import type { GeneratedProblem } from '../../services/ai/types';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GeneratedProblemCard', () => {
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
