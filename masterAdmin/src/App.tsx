import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Modules } from './pages/Modules';
import { Customers } from './pages/Customers';
import { CustomerDetail } from './pages/CustomerDetail';
import { Operators } from './pages/Operators';
import { ModuleDeployments } from './pages/ModuleDeployments';
import { PointsCashHub } from './pages/PointsCashHub';
import { StoreProducts } from './pages/StoreProducts';
import { ModuleEmbed } from './pages/ModuleEmbed';
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
            path="/m/:slug/:view"
            element={
              <Private>
                <ModuleEmbed />
              </Private>
            }
          />
          <Route
            path="/"
            element={
              <Private>
                <Layout />
              </Private>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="modules" element={<Modules />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="operators" element={<Operators />} />
            <Route path="deployments" element={<ModuleDeployments />} />
            <Route path="rewards-hub" element={<PointsCashHub />} />
            <Route path="store-products" element={<StoreProducts />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
