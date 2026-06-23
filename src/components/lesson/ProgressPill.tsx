import { Box, LinearProgress, Typography } from '@mui/material';

interface ProgressPillProps {
  current: number;
  total: number;
  completed?: boolean;
}

export function ProgressPill({ current, total, completed = false }: ProgressPillProps) {
  const value = completed ? 100 : Math.round((current / total) * 100);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'auto minmax(160px, 1fr)' },
        alignItems: 'center',
        gap: 2,
        mb: 4,
      }}
    >
      <Typography variant="subtitle1" color="text.secondary" sx={{ fontWeight: 700 }}>
        {completed ? 'Lesson complete' : `Step ${current} of ${total}`}
      </Typography>
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
    </Box>
  );
}
