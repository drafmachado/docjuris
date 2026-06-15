import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import ClientDetail from './pages/ClientDetail.jsx';
import Documents from './pages/Documents.jsx';
import Templates from './pages/Templates.jsx';
import Users from './pages/Users.jsx';
import UploadPage from './pages/UploadPage.jsx';
import Processos from './pages/Processos.jsx';
import ProcessoDetail from './pages/ProcessoDetail.jsx';
import IdentificarClientes from './pages/IdentificarClientes.jsx';
import Comunicados from './pages/Comunicados.jsx';
import Leads from './pages/Leads.jsx';
import Analytics from './pages/Analytics.jsx';
import Peticao from './pages/Peticao.jsx';

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#6b6b68' }}>Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/upload/:token" element={<UploadPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="documents" element={<Documents />} />
        <Route path="templates" element={<Templates />} />
        <Route path="processos" element={<Processos />} />
        <Route path="processos/:id" element={<ProcessoDetail />} />
        <Route path="identificar-clientes" element={<IdentificarClientes />} />
          <Route path="peticao" element={<Peticao />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="leads" element={<Leads />} />
          <Route path="comunicados" element={<Comunicados />} />
        <Route path="users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#0f2035', color: 'white', fontSize: '13px', borderRadius: '8px' },
            success: { iconTheme: { primary: '#4caf50', secondary: 'white' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
