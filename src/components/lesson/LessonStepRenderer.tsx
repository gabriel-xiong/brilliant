import { Box, Button, Card, CardContent, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { LessonStep } from '../../models/lesson';
import { CoinFlipSimulator } from './CoinFlipSimulator';
import { DiceRollSimulator } from './DiceRollSimulator';

interface LessonStepRendererProps {
  step: LessonStep;
  feedbackState: 'idle' | 'correct' | 'incorrect';
  selectedChoice: string | null;
  lessonComplete?: boolean;
  onSubmitAnswer: (choice: string) => void;
  onAdvance: () => void;
}

export function LessonStepRenderer({ step, feedbackState, selectedChoice, lessonComplete = false, onSubmitAnswer, onAdvance }: LessonStepRendererProps) {
  const [draftChoice, setDraftChoice] = useState(selectedChoice ?? '');

  useEffect(() => {
    setDraftChoice(selectedChoice ?? '');
  }, [selectedChoice, step.stepId]);

  if (step.type === 'concept') {
    return (
      <Card
        sx={{
          border: '1px solid rgba(31,36,48,0.08)',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
          <Typography variant="h4" gutterBottom>
            {step.title}
          </Typography>
          <Typography
            variant="body1"
            component="div"
            sx={{ mb: 3, maxWidth: '78ch', lineHeight: 1.6, whiteSpace: 'pre-line', fontSize: { xs: '1.05rem', md: '1.18rem' } }}
          >
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
      <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Typography variant="h4" gutterBottom>
            {step.title}
          </Typography>
          <Typography variant="body1" component="p" sx={{ mb: 2.5, lineHeight: 1.55, fontSize: { xs: '1.05rem', md: '1.15rem' } }}>
            {step.prompt}
          </Typography>
          {step.simulationType === 'coin-flip' ? (
            <CoinFlipSimulator rolls={step.config.rolls} target={step.config.target} />
          ) : (
            <DiceRollSimulator rolls={step.config.rolls} target={step.config.target} />
          )}
          <Box
            sx={{
              mt: 2.5,
              p: 2,
              borderRadius: 3,
              bgcolor: 'rgba(15,111,104,0.08)',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              What to look for
            </Typography>
            <Typography variant="body1" color="text.secondary">
            {step.reflectionPrompt}
            </Typography>
          </Box>
          <Button variant="contained" onClick={onAdvance} sx={{ mt: 2.5 }}>
            Continue
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ border: '1px solid rgba(31,36,48,0.08)' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
        <Typography variant="h4" gutterBottom>
          {step.title}
        </Typography>
        <Typography variant="body1" component="p" sx={{ mb: 2.5, lineHeight: 1.45, fontSize: { xs: '1.05rem', md: '1.16rem' } }}>
          {step.question}
        </Typography>
        <RadioGroup value={draftChoice} onChange={(event) => setDraftChoice(event.target.value)} sx={{ gap: 1.25 }}>
          {step.choices.map((choice) => {
            const isSelected = draftChoice === choice.value;
            const showFeedback = selectedChoice === choice.value && feedbackState !== 'idle';
            const isCorrect = feedbackState === 'correct' && showFeedback;
            const isIncorrect = feedbackState === 'incorrect' && showFeedback;

            return (
              <Box
                key={choice.value}
                sx={{
                  px: 2,
                  py: 1.25,
                  border: '1px solid',
                  borderColor: isCorrect ? 'success.main' : isIncorrect ? 'warning.main' : isSelected ? 'primary.main' : 'divider',
                  borderRadius: 3,
                  bgcolor: isCorrect
                    ? 'rgba(46,125,50,0.10)'
                    : isIncorrect
                      ? 'rgba(237,108,2,0.10)'
                      : isSelected
                        ? 'rgba(15,111,104,0.08)'
                        : 'background.paper',
                }}
              >
                <FormControlLabel
                  value={choice.value}
                  disabled={feedbackState === 'correct'}
                  control={<Radio />}
                  label={<span className="numeric">{choice.label}</span>}
                  sx={{ m: 0, width: '100%' }}
                />
                {showFeedback && (
                  <Typography
                    variant="body2"
                    className="numeric"
                    color={isCorrect ? 'success.dark' : 'text.secondary'}
                    sx={{ pl: 4, pr: 1, pb: 0.5, lineHeight: 1.45 }}
                  >
                    {isCorrect
                      ? `Correct. ${step.explanation}`
                      : step.incorrectFeedback ?? 'Not quite. Recall that probability = favorable outcomes / total possible outcomes.'}
                  </Typography>
                )}
              </Box>
            );
          })}
        </RadioGroup>
        {feedbackState !== 'correct' && (
          <Button
            variant="contained"
            sx={{ mt: 2 }}
            disabled={!draftChoice}
            onClick={() => onSubmitAnswer(draftChoice)}
          >
            Check answer
          </Button>
        )}
        {feedbackState === 'correct' && !lessonComplete && (
          <Button variant="contained" size="large" onClick={onAdvance} sx={{ mt: 2 }}>
            Continue
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
