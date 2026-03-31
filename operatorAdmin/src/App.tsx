import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './Layout';
import { Login } from './pages/Login';
import { Videos } from './pages/Videos';
import './index.css';

function Private({ children }: { children: React.ReactNode }) {
  const { authed } = useAuth();
  if (!authed) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Private>
                <Layout />
              </Private>
            }
          >
            <Route index element={<Navigate to="/videos" replace />} />
            <Route path="videos" element={<Videos />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
