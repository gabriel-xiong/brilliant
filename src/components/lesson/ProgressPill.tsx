import { Box, Chip, LinearProgress, Stack, Typography } from '@mui/material';

type MasteryColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning';

interface ProgressPillProps {
  current: number;
  total: number;
  completed?: boolean;
  masteryLabel: string;
  masteryColor: MasteryColor;
  masteryDetail: string;
  /** First-try accuracy percentage, or null until a question has been answered. */
  accuracyPercent: number | null;
  firstTryCorrect: number;
  answeredCount: number;
}

/**
 * Consolidated lesson top bar: a single, aligned strip that combines the
 * "Step x of N" indicator, the progress bar, the mastery label, and the
 * retained first-try accuracy readout. Replaces the old separate step pill and
 * the standalone mastery card so progress lives in one place at the top.
 */
export function ProgressPill({
  current,
  total,
  completed = false,
  masteryLabel,
  masteryColor,
  masteryDetail,
  accuracyPercent,
  firstTryCorrect,
  answeredCount,
}: ProgressPillProps) {
  const value = completed ? 100 : Math.round((current / total) * 100);
  const accuracyText =
    accuracyPercent === null
      ? 'Answer a question to start tracking'
      : `${accuracyPercent}% first-try (${firstTryCorrect}/${answeredCount})`;

  return (
    <Box
      sx={{
        mb: 3,
        p: { xs: 1.75, sm: 2 },
        borderRadius: 3,
        border: '1px solid rgba(15,111,104,0.16)',
        bgcolor: 'rgba(15,111,104,0.04)',
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between"
        spacing={{ xs: 1, sm: 2 }}
        sx={{ mb: 1.25 }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary' }}>
            {completed ? 'Lesson complete' : `Step ${current} of ${total}`}
          </Typography>
          <Chip label={masteryLabel} color={masteryColor} size="small" sx={{ fontWeight: 700 }} />
        </Stack>
        <Typography variant="body2" color="text.secondary" className="numeric" sx={{ fontWeight: 600 }}>
          {accuracyText}
        </Typography>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={value}
        sx={{
          height: 12,
          borderRadius: 999,
          bgcolor: 'rgba(15,111,104,0.16)',
          '& .MuiLinearProgress-bar': {
            borderRadius: 999,
          },
        }}
        aria-label="Lesson progress"
      />

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        {masteryDetail} Mastery threshold: complete the lesson with 80% or higher first-try accuracy.
      </Typography>
    </Box>
  );
}
