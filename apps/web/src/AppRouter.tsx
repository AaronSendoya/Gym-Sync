import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { RoleGuard } from './components/Auth/RoleGuard';

// Carga eager (pequeñas, siempre necesarias)
import { HomePage }          from './components/Home/HomePage';
import { LoginScreen }       from './components/Auth/LoginScreen';
import { RegisterScreen }    from './components/Auth/RegisterScreen';
import { DashboardLayout }   from './components/Layout/DashboardLayout';
import { MedidasPlaceholder } from './components/Dashboard/Placeholders';
import { TerminosPage, PrivacidadPage, ContactoPage } from './pages/legal/LegalPages';

// Carga diferida — cada vista genera su propio chunk JS
const ResumenView          = lazy(() => import('./components/Dashboard/ResumenView').then(m => ({ default: m.ResumenView })));
const UsuariosView         = lazy(() => import('./components/Dashboard/UsuariosView').then(m => ({ default: m.UsuariosView })));
const SedesView            = lazy(() => import('./components/Dashboard/SedesView').then(m => ({ default: m.SedesView })));
const SucursalesView       = lazy(() => import('./components/Dashboard/SucursalesView').then(m => ({ default: m.SucursalesView })));
const RolesView            = lazy(() => import('./components/Dashboard/RolesView').then(m => ({ default: m.RolesView })));
const MapaView             = lazy(() => import('./components/Dashboard/MapaView').then(m => ({ default: m.MapaView })));
const ActividadesView      = lazy(() => import('./components/Dashboard/ActividadesView').then(m => ({ default: m.ActividadesView })));
const MachineInventoryScreen = lazy(() => import('./pages/dashboard/MachineInventoryScreen').then(m => ({ default: m.MachineInventoryScreen })));
const ExerciseLibraryScreen  = lazy(() => import('./pages/dashboard/ExerciseLibraryScreen').then(m => ({ default: m.ExerciseLibraryScreen })));
const ReservasView           = lazy(() => import('./components/Reservas/ReservasView').then(m => ({ default: m.ReservasView })));
const MembresiasView         = lazy(() => import('./components/Dashboard/MembresiasView').then(m => ({ default: m.MembresiasView })));
const AuditoriaView          = lazy(() => import('./components/Auditoria/AuditoriaView').then(m => ({ default: m.AuditoriaView })));
const ReportesPage           = lazy(() => import('./pages/dashboard/ReportesPage').then(m => ({ default: m.ReportesPage })));

const PageLoader = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
    <div style={{ width: 32, height: 32, border: '3px solid #FF5E00', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          containerStyle={{ zIndex: 99999 }}
          toastOptions={{
            style: {
              background: '#1C1C1E',
              color: '#fff',
              border: '1px solid #3A3A3C'
            }
          }}
        />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/register" element={<RegisterScreen />} />
            <Route path="/terminos" element={<TerminosPage />} />
            <Route path="/privacidad" element={<PrivacidadPage />} />
            <Route path="/contacto" element={<ContactoPage />} />

            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route path="resumen" element={<ResumenView />} />

              <Route path="auditoria" element={
                <RoleGuard routePath="auditoria"><AuditoriaView /></RoleGuard>
              } />

              <Route path="usuarios" element={
                <RoleGuard routePath="usuarios"><UsuariosView /></RoleGuard>
              } />

              <Route path="sedes" element={
                <RoleGuard routePath="sedes"><SedesView /></RoleGuard>
              } />

              <Route path="sucursales" element={
                <RoleGuard routePath="sucursales"><SucursalesView /></RoleGuard>
              } />

              <Route path="roles" element={
                <RoleGuard routePath="roles"><RolesView /></RoleGuard>
              } />

              <Route path="mapa" element={
                <RoleGuard routePath="mapa"><MapaView /></RoleGuard>
              } />

              <Route path="actividades" element={
                <RoleGuard routePath="actividades"><ActividadesView /></RoleGuard>
              } />

              <Route path="maquinas" element={
                <RoleGuard routePath="maquinas"><MachineInventoryScreen /></RoleGuard>
              } />

              <Route path="biblioteca-ejercicios" element={
                <RoleGuard routePath="biblioteca-ejercicios"><ExerciseLibraryScreen /></RoleGuard>
              } />

              <Route path="reservas" element={
                <RoleGuard routePath="reservas"><ReservasView /></RoleGuard>
              } />

              <Route path="membresias" element={
                <RoleGuard routePath="membresias"><MembresiasView /></RoleGuard>
              } />

              <Route path="reportes" element={
                <RoleGuard routePath="reportes"><ReportesPage /></RoleGuard>
              } />

              <Route path="medidas" element={
                <RoleGuard routePath="medidas"><MedidasPlaceholder /></RoleGuard>
              } />

              <Route index element={<Navigate to="resumen" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
};
