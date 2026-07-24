import { useState, useEffect } from 'react';
import { Outlet, Navigate, useNavigate, NavLink } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotifications } from '../../hooks/useNotifications';
import { getRoutesForRole } from '../../config/roles.config';
import './DashboardLayout.css';

export const DashboardLayout = () => {
  const { isAuthenticated, user, logout, isLoading, isServerDown } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasActiveFormModal, setHasActiveFormModal] = useState(false);

  // Detecta cuando un modal está abierto → oculta el header
  useEffect(() => {
    const check = () => setHasActiveFormModal(document.body.hasAttribute('data-modal-open'));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-modal-open'] });
    check();
    return () => observer.disconnect();
  }, []);

  // Canal de notificaciones en tiempo real (Socket.io)
  useNotifications();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-100 text-gray-500 dark:bg-bg-deep dark:text-text-muted text-sm tracking-wide">
        Verificando sesión...
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Bloqueo rígido de plataforma: la web es exclusiva de niveles >= 4
  // (Recepcionista, Gerente, Super Admin). Instructores/Entrenadores (2-3) y
  // Clientes (1) operan solo desde la app móvil. Cubre TODAS las rutas hijas
  // de /dashboard — incluida /dashboard/resumen, que no pasa por RoleGuard —
  // y la hidratación con cookie válida obtenida fuera del formulario de login.
  if ((user?.level ?? 0) < 4) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const closeSidebar = () => setIsSidebarOpen(false);

  // Iniciales del avatar
  const fName      = user?.firstName || 'U';
  const lName      = user?.lastName  || '';
  const initials   = `${fName.charAt(0)}${lName ? lName.charAt(0) : ''}`.toUpperCase();
  const displayName = lName ? `${fName} ${lName}` : fName;

  const visibleRoutes = getRoutesForRole(user?.role, user?.level);

  return (
    <div className="flex h-screen w-full bg-gray-100 text-gray-900 dark:bg-bg-deep dark:text-text-main overflow-hidden font-sans">

      {/* ── Banner de reconexión: backend temporalmente no disponible ───────── */}
      {isServerDown && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-sm font-medium text-black">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
          Conexión con el servidor perdida. Reintentando automáticamente...
        </div>
      )}

      {/* ── Overlay móvil ───────────────────────────────────────────────────── */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-bg-deep md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={[
          'fixed md:relative z-20 h-full w-[260px] bg-white text-gray-700 dark:bg-bg-surface dark:text-text-muted',
          'flex flex-col transition-transform duration-300',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200 dark:border-bg-deep flex-shrink-0">
          <span className="text-gray-900 dark:text-text-main font-extrabold text-xl tracking-tight">
            GymSync <span className="text-brand-orange">Suite</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleRoutes.map(route => (
            <NavLink
              key={route.path}
              to={`/dashboard/${route.path}`}
              onClick={closeSidebar}
              className={({ isActive }) =>
                [
                  'block px-4 py-2.5 rounded-lg text-sm font-medium',
                  isActive
                    ? 'bg-gray-100 text-brand-celeste dark:bg-bg-deep dark:text-brand-celeste'
                    : 'text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-main',
                ].join(' ')
              }
            >
              {route.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer sidebar */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-bg-deep">
          <span className="text-xs text-gray-400 dark:text-text-muted tracking-wide">v2.0 · PostgreSQL Mode</span>
        </div>
      </aside>

      {/* ── Zona derecha ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header
          className="h-16 bg-white dark:bg-bg-surface flex items-center justify-between px-6 z-10 border-b border-gray-200 dark:border-bg-deep flex-shrink-0 transition-transform duration-300"
          style={{
            transform: hasActiveFormModal ? 'translateY(-100%)' : 'translateY(0)',
            pointerEvents: hasActiveFormModal ? 'none' : 'auto',
          }}
        >
          {/* Izquierda */}
          <div className="flex items-center gap-4">
            {/* Botón hamburguesa móvil */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:text-text-muted dark:hover:text-text-main"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6"  x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Derecha */}
          <div className="flex items-center gap-4">

            {/* Toggle dark / light */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-500 hover:text-brand-orange dark:text-text-muted dark:hover:text-brand-orange"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Avatar + info */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-celeste flex items-center justify-center text-black font-bold text-sm select-none flex-shrink-0">
                {initials}
              </div>
              <div className="hidden md:flex flex-col leading-tight">
                <span className="text-sm font-semibold text-gray-900 dark:text-text-main">{displayName}</span>
                <span className="text-xs text-gray-500 dark:text-text-muted tracking-wide">
                  {user?.role}
                  {user?.level === 5
                    ? (user.brandName ? ` · ${user.brandName}` : ' · Sin marca asignada')
                    : (user?.brandName
                      ? ` · ${user.brandName}${user.gymName ? ` — ${user.gymName}` : ''}`
                      : user?.gymName
                        ? ` · ${user.gymName}`
                        : (user?.level ?? 0) >= 4 ? ' · Sin sucursal asignada' : '')}
                </span>
              </div>
            </div>

            {/* Logout desktop */}
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-2 text-sm text-gray-500 hover:text-brand-orange dark:text-text-muted dark:hover:text-brand-orange border border-gray-200 hover:border-brand-orange dark:border-bg-deep px-3 py-1.5 rounded-lg"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Salir
            </button>

            {/* Logout móvil */}
            <button
              onClick={handleLogout}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-brand-orange dark:text-text-muted dark:hover:text-brand-orange"
              title="Cerrar Sesión"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </header>

        {/* ── Contenido principal ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-bg-deep">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
