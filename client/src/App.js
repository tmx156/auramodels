import React, { lazy, Suspense } from 'react';
import { 
  Routes, 
  Route, 
  Navigate,
  unstable_HistoryRouter as HistoryRouter // Import for more stable routing
} from 'react-router-dom';
import { createBrowserHistory } from 'history'; // Import history
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/LeadsNew';
import LeadDetail from './pages/LeadDetail';
import Users from './pages/Users';
import Calendar from './pages/Calendar';
import Reports from './pages/Reports';
import Templates from './pages/Templates';
import BookersTemplates from './pages/BookersTemplates';
import Finance from './pages/Finance';
import Sales from './pages/Sales';
import Messages from './pages/Messages'; // Gmail-style email inbox
import SMS from './pages/SMS'; // Google Messages-style SMS conversations
// import SalesApe from './pages/SalesApe'; // DISABLED - no longer using SalesApe
import Alex from './pages/Alex';
import BlockedSlots from './pages/BlockedSlots';
import Photographer from './pages/Photographer';
import ContractSigning from './pages/ContractSigning';
import ContractEditor from './pages/ContractEditor';
import EmailAccounts from './pages/EmailAccounts';
import PriceList from './pages/PriceList';

const PublicBooking = lazy(() => import('./pages/PublicBooking'));
const PublicBookingAlex = lazy(() => import('./pages/PublicBookingAlex'));
const PublicGallery = lazy(() => import('./pages/PublicGallery'));

// Create browser history
const history = createBrowserHistory();

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to="/dashboard" /> : children;
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <HistoryRouter 
          history={history}
          // Add future flags to suppress warnings
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}
        >
          <div className="App">
            <Routes>
              <Route 
                path="/login" 
                element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                } 
              />
              {/* Public booking page - no authentication required */}
              <Route 
                path="/book/:leadId" 
                element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>}><PublicBooking /></Suspense>}
              />
              {/* Alex A.I public booking page - no authentication required */}
              <Route
                path="/book-alex/:leadId"
                element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500"></div></div>}><PublicBookingAlex /></Suspense>}
              />
              {/* Public contract signing page - no authentication required */}
              <Route
                path="/sign-contract/:token"
                element={<ContractSigning />}
              />
              {/* Public photo gallery - no authentication required */}
              <Route
                path="/gallery/:token"
                element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div></div>}><PublicGallery /></Suspense>}
              />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <SocketProvider>
                      <Layout>
                        <Routes>
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/leads" element={<Leads />} />
                          <Route path="/leads/:id" element={<LeadDetail />} />
                          <Route path="/users" element={<Users />} />
                          <Route path="/templates" element={<Templates />} />
                          <Route path="/contract-editor" element={<ContractEditor />} />
                          <Route path="/calendar" element={<Calendar />} />
                          <Route path="/reports" element={<Reports />} />
                          <Route path="/bookers-templates" element={<BookersTemplates />} />
                          <Route path="/finance" element={<Finance />} />
                          <Route path="/sales" element={<Sales />} />
                          <Route path="/messages" element={<Messages />} />
                          <Route path="/sms" element={<SMS />} />
                          {/* <Route path="/salesape" element={<SalesApe />} /> DISABLED */}
                          <Route path="/alex" element={<Alex />} />
                          <Route path="/blocked-slots" element={<BlockedSlots />} />
                          <Route path="/photographer" element={<Photographer />} />
                          <Route path="/email-accounts" element={<EmailAccounts />} />
                          <Route path="/price-list" element={<PriceList />} />
                          <Route path="/" element={<Navigate to="/dashboard" />} />
                        </Routes>
                      </Layout>
                    </SocketProvider>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </HistoryRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App; 