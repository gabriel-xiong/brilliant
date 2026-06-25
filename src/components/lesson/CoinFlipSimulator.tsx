import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Stack, TextField, Typography } from '@mui/material';
import { FrequencyChart } from './FrequencyChart';

interface CoinFlipSimulatorProps {
  rolls: number;
  target?: string;
  /**
   * Simplified first-encounter mode: a single Flip control, a running tally,
   * and P = heads/total shown only as a stacked fraction. No expected-vs-
   * observed comparison, difference chip, or frequency chart.
   */
  simplified?: boolean;
}

type CoinResult = 'Heads' | 'Tails';

interface AnimatedCoin {
  id: number;
  result: CoinResult;
}

const runSizes = [10, 100, 500];
const previewCoins: CoinResult[] = Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? 'Heads' : 'Tails'));

/** Compact stacked fraction (numerator over a rule over denominator). */
function TallyFraction({ numerator, denominator }: { numerator: number; denominator: number }) {
  return (
    <Box
      component="span"
      className="numeric"
      aria-label={`${numerator} over ${denominator}`}
      sx={{
        display: 'inline-grid',
        gridTemplateRows: 'auto auto',
        alignItems: 'center',
        justifyItems: 'center',
        lineHeight: 1.05,
        fontWeight: 900,
        fontSize: '2rem',
      }}
    >
      <Box component="span" sx={{ px: 1, pb: 0.3, borderBottom: '3px solid currentColor', minWidth: 36, textAlign: 'center' }}>
        {numerator}
      </Box>
      <Box component="span" sx={{ px: 1, pt: 0.3, minWidth: 36, textAlign: 'center' }}>
        {denominator}
      </Box>
    </Box>
  );
}

export function CoinFlipSimulator({ rolls, target = 'Heads', simplified = false }: CoinFlipSimulatorProps) {
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

  // Responsive coin sizing: as the count grows we shrink each glyph and switch
  // to a compact dot grid so the whole run stays visible without overflowing.
  const coinCount = displayedCoins.length;
  const coinLayout = coinCount > 400
    ? { cell: 11, fontSize: 0, gap: 0.35, showLabel: false, animate: false }
    : coinCount > 180
      ? { cell: 15, fontSize: 0, gap: 0.4, showLabel: false, animate: false }
      : coinCount > 80
        ? { cell: 22, fontSize: 0.6, gap: 0.5, showLabel: true, animate: false }
        : { cell: 30, fontSize: 0.72, gap: 0.75, showLabel: true, animate: true };
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
    // Show every coin from the run (no cap). Newest coins are prepended; the
    // display below shrinks the glyphs as the count grows so they still fit.
    setVisibleCoins((current) => [...nextCoins, ...current]);
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

  if (simplified) {
    return (
      <Card variant="outlined" sx={{ mt: 2 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button
              variant="contained"
              onClick={() => addFlipChunk(1)}
              aria-label="Flip the coin once"
              sx={{ height: 40, px: 3, boxShadow: 2 }}
            >
              Flip
            </Button>
            <Button variant="text" onClick={reset} disabled={results.length === 0}>
              Reset
            </Button>
          </Stack>

          <Box
            aria-label={`Coin flips so far: ${counts.heads} heads, ${counts.tails} tails`}
            sx={{
              minHeight: 72,
              maxHeight: 220,
              p: 1.5,
              mb: 2,
              borderRadius: 3,
              bgcolor: 'action.hover',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(30px, 1fr))',
              gap: 0.75,
              alignContent: 'flex-start',
              alignItems: 'center',
              overflowY: 'auto',
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
                  animation: coin.id < 0 ? 'none' : 'coinFlipSimple 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                  '@keyframes coinFlipSimple': {
                    '0%': { transform: 'rotateY(90deg) translateY(-8px)', opacity: 0 },
                    '100%': { transform: 'rotateY(0deg) translateY(0)', opacity: 1 },
                  },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              >
                {coin.result === 'Heads' ? 'H' : 'T'}
              </Box>
            ))}
          </Box>

          <Stack
            direction="row"
            spacing={{ xs: 2, sm: 4 }}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ rowGap: 1.5 }}
          >
            <Stack direction="row" spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  Heads
                </Typography>
                <Typography variant="h4" className="numeric" sx={{ fontWeight: 900, lineHeight: 1 }}>
                  {counts.heads}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.9 }}>
                  Total
                </Typography>
                <Typography variant="h4" className="numeric" sx={{ fontWeight: 900, lineHeight: 1 }}>
                  {results.length}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box component="span" className="numeric" sx={{ fontWeight: 900, fontSize: '1.2rem' }}>
                P(heads) =
              </Box>
              {results.length > 0 ? (
                <TallyFraction numerator={counts.heads} denominator={results.length} />
              ) : (
                <Typography variant="body1" color="text.secondary">
                  flip to begin
                </Typography>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: '1fr auto',
            },
            gap: 1,
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
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
            <Button
              variant="contained"
              onClick={() => runFlips(parsedCustomRunSize)}
              disabled={isRunning || !validCustomRunSize}
              aria-label="Flip the chosen number of coins"
              sx={{ height: 38, px: 3, minWidth: 96, ml: 0.25, boxShadow: 2 }}
            >
              Flip
            </Button>
          </Stack>
          <Button variant="text" onClick={reset} disabled={results.length === 0 && !isRunning} sx={{ justifySelf: { xs: 'start', md: 'end' } }}>
            Reset
          </Button>
        </Box>

        <Box
          aria-label={`Coin flips so far: ${counts.heads} heads, ${counts.tails} tails`}
          sx={{
            minHeight: visibleCoins.length > 0 ? 136 : 72,
            maxHeight: 360,
            p: 1.5,
            mb: 1.5,
            borderRadius: 3,
            bgcolor: 'action.hover',
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${coinLayout.cell}px, 1fr))`,
            gap: coinLayout.gap,
            alignContent: 'flex-start',
            alignItems: 'center',
            overflowY: 'auto',
          }}
        >
          {displayedCoins.map((coin) => (
              <Box
                key={coin.id}
                sx={{
                  width: coinLayout.cell,
                  height: coinLayout.cell,
                  mx: 'auto',
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: coinLayout.fontSize ? `${coinLayout.fontSize}rem` : 0,
                  fontFamily: "'Source Sans 3', system-ui, sans-serif",
                  color: coin.result === 'Heads' ? 'primary.contrastText' : 'text.primary',
                  bgcolor: coin.result === 'Heads' ? 'primary.main' : '#fffaf0',
                  border: '1px solid',
                  borderColor: coin.result === 'Heads' ? 'primary.dark' : 'divider',
                  boxShadow: coin.id < 0 || !coinLayout.showLabel ? 0 : 2,
                  opacity: coin.id < 0 ? 0.45 : 1,
                  animation: coin.id < 0 || !coinLayout.animate ? 'none' : 'coinFlip 420ms cubic-bezier(0.22, 1, 0.36, 1)',
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
                {coinLayout.showLabel ? (coin.result === 'Heads' ? 'H' : 'T') : ''}
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
