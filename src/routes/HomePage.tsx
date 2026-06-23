import { Button, Container, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function HomePage() {
  return (
    <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Brilliant Probability
      </Typography>
      <Typography variant="body1" sx={{ mb: 4 }}>
        Learn probability with coins and dice through hands-on simulations and instant feedback.
      </Typography>
      <Button component={RouterLink} to="/course" variant="contained" size="large">
        View Course Path
      </Button>
    </Container>
  );
}
