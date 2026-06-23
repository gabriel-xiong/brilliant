import { Box, Stack, Typography } from '@mui/material';

interface FrequencyChartProps {
  values: Array<{
    label: string;
    count: number;
  }>;
}

export function FrequencyChart({ values }: FrequencyChartProps) {
  const maxCount = Math.max(1, ...values.map((value) => value.count));

  return (
    <Stack spacing={1.25} sx={{ mt: 2 }}>
      {values.map((value) => (
        <Box
          key={value.label}
          sx={{
            display: 'grid',
            gridTemplateColumns: '4rem 1fr 2rem',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Typography variant="body2">{value.label}</Typography>
          <Box
            sx={{
              height: 12,
              overflow: 'hidden',
              borderRadius: 999,
              bgcolor: 'action.hover',
            }}
          >
            <Box
              sx={{
                width: `${(value.count / maxCount) * 100}%`,
                height: '100%',
                borderRadius: 999,
                bgcolor: 'primary.main',
                transition: 'width 220ms ease-out',
              }}
            />
          </Box>
          <Typography variant="body2" textAlign="right">
            {value.count}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
