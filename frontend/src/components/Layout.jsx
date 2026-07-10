import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { LayoutDashboard, Users, FileText, FileStack, UserPlus, LogOut, Scale, Menu, X, Gavel, UserCheck, Calendar, Activity } from 'lucide-react';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = user?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const close = () => setSidebarOpen(false);

  return (
    <div className={styles.app}>

      <button className={styles.menuBtn} onClick={() => setSidebarOpen(o => !o)} aria-label="Menu">
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div className={`${styles.overlay} ${sidebarOpen ? styles.open : ''}`} onClick={close} />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>V</div>
          <div>
            <span className={styles.logoTitle}>Veredo</span>
            <span className={styles.logoSub}>Gestão Jurídica</span>
          </div>
        </div>
        <nav className={styles.nav}>
          <span className={styles.navSection}>Principal</span>
          <NavLink to="/" end onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <LayoutDashboard size={16} /> Dashboard
          </NavLink>
          <NavLink to="/clients" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <Users size={16} /> Clientes
          </NavLink>
          <NavLink to="/processos" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <Gavel size={16} /> Processos
          </NavLink>

          <NavLink to="/agenda" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <Calendar size={16} /> Agenda de Prazos
          </NavLink>
          <NavLink to="/documents" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <FileText size={16} /> Documentos
          </NavLink>
          <NavLink to="/identificar-clientes" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <UserCheck size={16} /> Identificar Clientes
          </NavLink>

          <span className={styles.navSection}>IA Jurídica</span>
          <NavLink to="/peticao" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <Scale size={16} /> Petição IA
          </NavLink>

          <span className={styles.navSection}>CRM</span>
          <NavLink to="/leads" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <Users size={16} /> Funil de Leads
          </NavLink>
          <NavLink to="/analytics" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <LayoutDashboard size={16} /> Analytics
          </NavLink>
          <NavLink to="/comunicados" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <FileText size={16} /> Comunicados
          </NavLink>

          <span className={styles.navSection}>Configurações</span>
          <NavLink to="/templates" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
            <FileStack size={16} /> Templates
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/users" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
              <UserPlus size={16} /> Usuários
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/diagnostico" onClick={close} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
              <Activity size={16} /> Diagnóstico
            </NavLink>
          )}
        </nav>
        <div className={styles.sidebarFooter}>
          <div className={styles.userRow}>
            <div className={styles.avatar}>{initials}</div>
            <div>
              <div className={styles.userName}>{user?.name}</div>
              <div className={styles.userRole}>{user?.role === 'admin' ? 'Administrador' : 'Colaborador'}</div>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <LogOut size={13} /> Sair
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
