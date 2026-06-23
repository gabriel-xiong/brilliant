import { useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';

interface CoinFlipSimulatorProps {
  rolls: number;
}

export function CoinFlipSimulator({ rolls }: CoinFlipSimulatorProps) {
  const [results, setResults] = useState<string[]>([]);

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

  const flip = () => {
    const nextResults = Array.from({ length: rolls }, () => (Math.random() < 0.5 ? 'Heads' : 'Tails'));
    setResults(nextResults);
  };

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Button variant="contained" onClick={flip}>
          Flip {rolls} coins
        </Button>
        {results.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography>Heads: {counts.heads}</Typography>
            <Typography>Tails: {counts.tails}</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
