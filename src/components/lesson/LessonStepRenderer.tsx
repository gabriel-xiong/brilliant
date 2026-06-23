import { Box, Button, Card, CardContent, Radio, RadioGroup, FormControlLabel, Typography } from '@mui/material';
import { LessonStep } from '../../models/lesson';
import { CoinFlipSimulator } from './CoinFlipSimulator';
import { DiceRollSimulator } from './DiceRollSimulator';

interface LessonStepRendererProps {
  step: LessonStep;
  feedbackState: 'idle' | 'correct' | 'incorrect';
  selectedChoice: string | null;
  onSubmitAnswer: (choice: string) => void;
  onAdvance: () => void;
}

export function LessonStepRenderer({ step, feedbackState, selectedChoice, onSubmitAnswer, onAdvance }: LessonStepRendererProps) {
  if (step.type === 'concept') {
    return (
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {step.title}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {step.body}
          </Typography>
          <Button variant="contained" onClick={onAdvance}>
            Next
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step.type === 'simulation') {
    return (
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {step.title}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {step.prompt}
          </Typography>
          {step.simulationType === 'coin-flip' ? (
            <CoinFlipSimulator rolls={step.config.rolls} />
          ) : (
            <DiceRollSimulator rolls={step.config.rolls} />
          )}
          <Button variant="contained" onClick={onAdvance} sx={{ mt: 2 }}>
            Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" gutterBottom>
          {step.title}
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          {step.question}
        </Typography>
        <RadioGroup value={selectedChoice ?? ''} onChange={(event) => onSubmitAnswer(event.target.value)}>
          {step.choices.map((choice) => (
            <FormControlLabel key={choice.value} value={choice.value} control={<Radio />} label={choice.label} />
          ))}
        </RadioGroup>
        {feedbackState === 'correct' && <Typography color="success.main">Correct! {step.explanation}</Typography>}
        {feedbackState === 'incorrect' && <Typography color="error.main">Try again.</Typography>}
      </CardContent>
    </Card>
  );
}
