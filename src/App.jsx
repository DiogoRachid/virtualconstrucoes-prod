import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import LandingPage from './pages/LandingPage';
import PortalSelect from './pages/PortalSelect';
import ColaboradorPortal from './pages/ColaboradorPortal';
import AdminLogin from './pages/AdminLogin';
import ColaboradorLogin from './pages/ColaboradorLogin';
import ProtectedAdminRoute from '@/lib/ProtectedAdminRoute';
import BenefitReceipt from './pages/BenefitReceipt';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Páginas públicas sem layout/sidebar */}
      <Route path="/LandingPage" element={<LandingPage />} />
      <Route path="/PortalSelect" element={<PortalSelect />} />
      <Route path="/AdminLogin" element={<AdminLogin />} />
      <Route path="/ColaboradorLogin" element={<ColaboradorLogin />} />
      <Route path="/ColaboradorPortal" element={<ColaboradorPortal />} />
      <Route path="/BenefitReceipt" element={<ProtectedAdminRoute><LayoutWrapper currentPageName="BenefitReceipt"><BenefitReceipt /></LayoutWrapper></ProtectedAdminRoute>} />

      <Route path="/" element={<LandingPage />} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <ProtectedAdminRoute>
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            </ProtectedAdminRoute>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App