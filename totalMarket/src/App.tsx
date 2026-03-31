import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { PortalLayout } from './Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Home } from './pages/Home';
import { ModulesPage } from './pages/ModulesPage';
import { RewardsHub } from './pages/RewardsHub';
import { Shop } from './pages/Shop';
import './index.css';

function Private({ children }: { children: React.ReactNode }) {
  const { authed, role } = useAuth();
  if (!authed || role !== 'user') return <Navigate to="/login" replace state={{ from: 'private' }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<PortalLayout />}>
            <Route index element={<Home />} />
            <Route path="modules" element={<ModulesPage />} />
            <Route
              path="rewards"
              element={
                <Private>
                  <RewardsHub />
                </Private>
              }
            />
            <Route
              path="shop"
              element={
                <Private>
                  <Shop />
                </Private>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
