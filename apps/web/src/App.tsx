import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { Spinner } from './components/ui/Spinner';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { LeadsList } from './pages/leads/LeadsList';
import { LeadDetail } from './pages/leads/LeadDetail';
import { ClientsList } from './pages/clients/ClientsList';
import { ClientDetail } from './pages/clients/ClientDetail';
import { PropertiesList } from './pages/properties/PropertiesList';
import { PropertyDetail } from './pages/properties/PropertyDetail';
import { OwnersList } from './pages/owners/OwnersList';
import { OwnerDetail } from './pages/owners/OwnerDetail';
import { ViewingsList } from './pages/viewings/ViewingsList';
import { FollowUpsList } from './pages/followups/FollowUpsList';
import { TasksList } from './pages/tasks/TasksList';
import { DealsBoard } from './pages/deals/DealsBoard';
import { DealDetail } from './pages/deals/DealDetail';
import { CommissionsList } from './pages/commissions/CommissionsList';
import { CalendarPage } from './pages/calendar/CalendarPage';
import { CommunicationsList } from './pages/communications/CommunicationsList';
import { DocumentsList } from './pages/documents/DocumentsList';
import { ReportsPage } from './pages/reports/ReportsPage';
import { AnalyticsPage } from './pages/analytics/AnalyticsPage';
import { AuditLog } from './pages/audit/AuditLog';
import { AutomationPage } from './pages/automation/AutomationPage';
import { TeamPage } from './pages/team/TeamPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { PublicShortlist } from './pages/public/PublicShortlist';
import { PublicInquiry } from './pages/public/PublicInquiry';
import { Landing } from './pages/marketing/Landing';
import { NotFound } from './pages/NotFound';
import { PlatformAuthProvider, usePlatformAuth } from './platform/PlatformAuthContext';
import { PlatformLogin } from './platform/PlatformLogin';
import { PlatformLayout } from './platform/PlatformLayout';
import { PlatformDashboard } from './platform/PlatformDashboard';
import { OrganizationsList } from './platform/OrganizationsList';
import { OrganizationDetail } from './platform/OrganizationDetail';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-ground">
        <Spinner />
      </div>
    );
  }
  if (!user) {
    // Root is the public marketing page for signed-out visitors; any other
    // protected path sends them to sign in first.
    if (location.pathname === '/') return <Landing />;
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

function ProtectedPlatformRoute({ children }: { children: React.ReactNode }) {
  const { admin } = usePlatformAuth();
  if (!admin) return <Navigate to="/platform/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/share/:token" element={<PublicShortlist />} />
      <Route path="/inquire/:slug" element={<PublicInquiry />} />
      <Route
        path="/platform/*"
        element={
          <PlatformAuthProvider>
            <Routes>
              <Route path="login" element={<PlatformLogin />} />
              <Route
                path=""
                element={
                  <ProtectedPlatformRoute>
                    <PlatformLayout />
                  </ProtectedPlatformRoute>
                }
              >
                <Route index element={<PlatformDashboard />} />
                <Route path="organizations" element={<OrganizationsList />} />
                <Route path="organizations/:id" element={<OrganizationDetail />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </PlatformAuthProvider>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="leads" element={<LeadsList />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="clients" element={<ClientsList />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="properties" element={<PropertiesList />} />
        <Route path="properties/:id" element={<PropertyDetail />} />
        <Route path="owners" element={<OwnersList />} />
        <Route path="owners/:id" element={<OwnerDetail />} />
        <Route path="viewings" element={<ViewingsList />} />
        <Route path="follow-ups" element={<FollowUpsList />} />
        <Route path="tasks" element={<TasksList />} />
        <Route path="deals" element={<DealsBoard />} />
        <Route path="deals/:id" element={<DealDetail />} />
        <Route path="commissions" element={<CommissionsList />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="communications" element={<CommunicationsList />} />
        <Route path="documents" element={<DocumentsList />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="automation" element={<AutomationPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
