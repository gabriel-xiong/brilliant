import { Alert } from '@mui/material';

interface FeedbackPanelProps {
  state: 'idle' | 'correct' | 'incorrect';
  explanation?: string;
  incorrectFeedback?: string;
}

export function FeedbackPanel({ state, explanation, incorrectFeedback }: FeedbackPanelProps) {
  if (state === 'idle') return null;

  if (state === 'correct') {
    return (
      <Alert severity="success" sx={{ mt: 2 }}>
        Correct. {explanation}
      </Alert>
    );
  }

  return (
    <Alert severity="info" sx={{ mt: 2 }}>
      {incorrectFeedback ?? 'Not quite. Recall that probability = favorable outcomes / total possible outcomes.'}
    </Alert>
  );
}
