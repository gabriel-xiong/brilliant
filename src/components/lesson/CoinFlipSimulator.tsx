import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Stack, TextField, Typography } from '@mui/material';
import { FrequencyChart } from './FrequencyChart';

interface CoinFlipSimulatorProps {
  rolls: number;
  target?: string;
}

type CoinResult = 'Heads' | 'Tails';

interface AnimatedCoin {
  id: number;
  result: CoinResult;
}

const runSizes = [10, 100, 500];
const previewCoins: CoinResult[] = Array.from({ length: 48 }, (_, index) => (index % 2 === 0 ? 'Heads' : 'Tails'));

export function CoinFlipSimulator({ rolls, target = 'Heads' }: CoinFlipSimulatorProps) {
  const [results, setResults] = useState<CoinResult[]>([]);
  const [visibleCoins, setVisibleCoins] = useState<AnimatedCoin[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeRunSize, setActiveRunSize] = useState<number | null>(null);
  const [customRunSize, setCustomRunSize] = useState('10');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const coinIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const counts = useMemo(() => {
    return results.reduce(
      (acc, result) => {
        if (result === 'Heads') acc.heads += 1;
        else acc.tails += 1;
        return acc;
      },
      { heads: 0, tails: 0 }
    );
  }, [results]);

  const displayedCoins = visibleCoins.length > 0
    ? visibleCoins
    : previewCoins.map((result, index) => ({ id: -index - 1, result }));
  const targetCount = target === 'Heads' ? counts.heads : counts.tails;
  const experimentalProbability = results.length > 0 ? targetCount / results.length : 0;
  const experimentalPercent = Math.round(experimentalProbability * 100);
  const gap = Math.abs(experimentalProbability - 0.5);
  const gapPoints = Math.round(gap * 100);

  const addFlipChunk = (chunkSize: number) => {
    const nextCoins = Array.from({ length: chunkSize }, () => ({
      id: coinIdRef.current++,
      result: Math.random() < 0.5 ? 'Heads' : 'Tails',
    })) satisfies AnimatedCoin[];

    setResults((current) => [...current, ...nextCoins.map((coin) => coin.result)]);
    setVisibleCoins((current) => [...nextCoins, ...current].slice(0, 72));
  };

  const runFlips = (totalFlips: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    setIsRunning(true);
    setActiveRunSize(totalFlips);

    let completed = 0;
    const chunkSize = totalFlips >= 500 ? 8 : totalFlips >= 100 ? 4 : 1;
    const intervalMs = totalFlips >= 500 ? 18 : totalFlips >= 100 ? 28 : 90;

    intervalRef.current = setInterval(() => {
      const remaining = totalFlips - completed;
      const nextChunkSize = Math.min(chunkSize, remaining);
      addFlipChunk(nextChunkSize);
      completed += nextChunkSize;

      if (completed >= totalFlips) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsRunning(false);
        setActiveRunSize(null);
      }
    }, intervalMs);
  };

  const reset = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setResults([]);
    setVisibleCoins([]);
    setIsRunning(false);
    setActiveRunSize(null);
  };

  const parsedCustomRunSize = Number(customRunSize);
  const validCustomRunSize = Number.isInteger(parsedCustomRunSize) && parsedCustomRunSize > 0 && parsedCustomRunSize <= 1000;

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Typography variant="h6" gutterBottom>
          What are we testing?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: '1rem' }}>
          Compare observed heads with the expected 50%. Small runs wobble; bigger runs usually settle closer.
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: '1fr auto auto',
            },
            gap: 1,
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="nowrap">
            <TextField
              size="small"
              label="Number of flips"
              type="number"
              value={customRunSize}
              onChange={(event) => setCustomRunSize(event.target.value)}
              disabled={isRunning}
              error={customRunSize.length > 0 && !validCustomRunSize}
              helperText={customRunSize.length > 0 && !validCustomRunSize ? '1–1000' : ''}
              inputProps={{ min: 1, max: 1000, step: 1 }}
              sx={{
                width: 170,
                '& .MuiFormHelperText-root': { position: 'absolute', top: '100%', m: 0.25 },
              }}
            />
            {runSizes.map((size) => (
              <Button
                key={size}
                variant={customRunSize === String(size) ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setCustomRunSize(String(size))}
                disabled={isRunning}
                sx={{
                  minWidth: 58,
                  height: 38,
                  px: 1.5,
                  fontSize: '0.95rem',
                  boxShadow: customRunSize === String(size) ? 1 : 'none',
                }}
              >
                {size}
              </Button>
            ))}
          </Stack>
          <Button variant="contained" onClick={() => runFlips(parsedCustomRunSize)} disabled={isRunning || !validCustomRunSize} sx={{ height: 42, px: 3, minWidth: 96 }}>
            Flip
          </Button>
          <Button variant="text" onClick={reset} disabled={results.length === 0 && !isRunning}>
            Reset
          </Button>
        </Box>

        <Box
          aria-label="Animated coin flips"
          sx={{
            minHeight: 136,
            p: 1.5,
            mb: 1.5,
            borderRadius: 3,
            bgcolor: 'action.hover',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(30px, 1fr))',
            gap: 0.75,
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          {displayedCoins.map((coin) => (
              <Box
                key={coin.id}
                sx={{
                  width: 30,
                  height: 30,
                  mx: 'auto',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  fontFamily: "'Source Sans 3', system-ui, sans-serif",
                  color: coin.result === 'Heads' ? 'primary.contrastText' : 'text.primary',
                  bgcolor: coin.result === 'Heads' ? 'primary.main' : '#fffaf0',
                  border: '1px solid',
                  borderColor: coin.result === 'Heads' ? 'primary.dark' : 'divider',
                  boxShadow: coin.id < 0 ? 0 : 2,
                  opacity: coin.id < 0 ? 0.45 : 1,
                  animation: coin.id < 0 ? 'none' : 'coinFlip 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                  transformStyle: 'preserve-3d',
                  '@keyframes coinFlip': {
                    '0%': { transform: 'rotateY(90deg) translateY(-8px)', opacity: 0 },
                    '100%': { transform: 'rotateY(0deg) translateY(0)', opacity: 1 },
                  },
                  '@media (prefers-reduced-motion: reduce)': {
                    animation: 'none',
                  },
                }}
              >
                {coin.result === 'Heads' ? 'H' : 'T'}
              </Box>
          ))}
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
          <Chip label={`${results.length} flips so far`} sx={{ fontSize: '0.95rem', height: 38 }} />
          <Chip label={`Expected heads: about 50%`} color="secondary" sx={{ fontSize: '0.98rem', fontWeight: 800, height: 40, px: 0.5 }} />
          <Chip label={`Observed heads: ${results.length ? `${experimentalPercent}%` : 'not measured yet'}`} color="primary" sx={{ fontSize: '0.98rem', fontWeight: 800, height: 40, px: 0.5 }} />
          <Chip
            label={`Difference: ${results.length ? `${gapPoints}%` : '—'}`}
            color={results.length > 0 && gapPoints <= 5 ? 'success' : 'default'}
            sx={{ fontSize: '0.98rem', fontWeight: 800, height: 40, px: 0.5 }}
          />
          {isRunning && <Chip label={`running ${activeRunSize}...`} color="secondary" />}
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '1rem', maxWidth: '96ch' }}>
          {results.length === 0
            ? 'Try 10 first, then increase the number of flips.'
            : 'If observed is not exactly 50%, that is normal — randomness is noisy.'}
        </Typography>
        {results.length > 0 && (
            <FrequencyChart
              values={[
                { label: 'Heads', count: counts.heads },
                { label: 'Tails', count: counts.tails },
              ]}
            />
        )}
      </CardContent>
    </Card>
  );
}
