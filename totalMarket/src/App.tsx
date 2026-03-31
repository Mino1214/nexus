import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { PortalLayout } from './Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Home } from './pages/Home';
import { ModulesPage } from './pages/ModulesPage';
import { RewardsLayout } from './pages/rewards/RewardsLayout';
import { RewardsOverview } from './pages/rewards/Overview';
import { AttendancePage } from './pages/rewards/Attendance';
import { ConvertPage } from './pages/rewards/Convert';
import { MiniGamePage } from './pages/rewards/MiniGame';
import { VideosPage } from './pages/rewards/Videos';
import { PredictionsPage } from './pages/rewards/Predictions';
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
                  <RewardsLayout />
                </Private>
              }
            >
              <Route index element={<RewardsOverview />} />
              <Route path="attendance" element={<AttendancePage />} />
              <Route path="convert" element={<ConvertPage />} />
              <Route path="minigame" element={<MiniGamePage />} />
              <Route path="videos" element={<VideosPage />} />
              <Route path="predictions" element={<PredictionsPage />} />
            </Route>
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
