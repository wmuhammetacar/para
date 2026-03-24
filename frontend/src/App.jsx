import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import CustomersPage from './pages/CustomersPage';
import DashboardPage from './pages/DashboardPage';
import GrowthPage from './pages/GrowthPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import PilotReadinessPage from './pages/PilotReadinessPage';
import PlansPage from './pages/PlansPage';
import QuotesPage from './pages/QuotesPage';
import QuoteDetailPage from './pages/QuoteDetailPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="growth" element={<GrowthPage />} />
        <Route path="pilot-readiness" element={<PilotReadinessPage />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="quotes/:id" element={<QuoteDetailPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
