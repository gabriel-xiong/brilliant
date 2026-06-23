import { Routes, Route, Navigate } from 'react-router-dom';
import SignInPage from './routes/SignInPage';
import HomePage from './routes/HomePage';
import CoursePathPage from './routes/CoursePathPage';
import LessonPlayerPage from './routes/LessonPlayerPage';
import ProfilePage from './routes/ProfilePage';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/course" element={<CoursePathPage />} />
        <Route path="/lesson/:lessonId" element={<LessonPlayerPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
