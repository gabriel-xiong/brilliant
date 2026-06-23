import { Button, Container, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Brilliant Probability
      </Typography>
      <Typography variant="body1" sx={{ mb: 4 }}>
        Learn probability with coins and dice through hands-on simulations and instant feedback.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
        <Button component={RouterLink} to="/course" variant="contained" size="large">
          View Course Path
        </Button>
        <Button component={RouterLink} to={user ? '/profile' : '/signin'} variant="outlined" size="large">
          {user ? 'View Profile' : 'Sign in to save progress'}
        </Button>
      </Stack>
    </Container>
  );
}
