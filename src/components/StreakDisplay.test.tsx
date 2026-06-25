import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StreakDisplay from './StreakDisplay';

describe('StreakDisplay', () => {
  it('shows the current streak count and label when active', () => {
    render(<StreakDisplay currentStreak={5} longestStreak={9} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('day streak')).toBeInTheDocument();
    expect(screen.getByLabelText('Current streak: 5 days')).toBeInTheDocument();
  });

  it('renders a friendly zero state when there is no streak', () => {
    render(<StreakDisplay currentStreak={0} />);
    expect(screen.getByText('Start your streak today')).toBeInTheDocument();
    expect(screen.getByLabelText('No active streak yet')).toBeInTheDocument();
  });

  it('shows a loading placeholder while the summary is loading', () => {
    render(<StreakDisplay currentStreak={0} loading />);
    expect(screen.getByText('Loading your streak…')).toBeInTheDocument();
  });
});
