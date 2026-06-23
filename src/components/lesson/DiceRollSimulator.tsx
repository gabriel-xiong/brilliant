import { useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Typography } from '@mui/material';

interface DiceRollSimulatorProps {
  rolls: number;
}

export function DiceRollSimulator({ rolls }: DiceRollSimulatorProps) {
  const [results, setResults] = useState<number[]>([]);

  const counts = useMemo(() => {
    return results.reduce((acc, result) => {
      acc[result] = (acc[result] ?? 0) + 1;
      return acc;
    }, {} as Record<number, number>);
  }, [results]);

  const roll = () => {
    const nextResults = Array.from({ length: rolls }, () => Math.floor(Math.random() * 6) + 1);
    setResults(nextResults);
  };

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Button variant="contained" onClick={roll}>
          Roll {rolls} times
        </Button>
        {results.length > 0 && (
          <Box sx={{ mt: 2 }}>
            {Array.from({ length: 6 }, (_, index) => (
              <Typography key={index}>
                {index + 1}: {counts[index + 1] ?? 0}
              </Typography>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
