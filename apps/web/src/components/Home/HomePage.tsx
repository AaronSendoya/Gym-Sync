import React from 'react';
import { Link } from 'react-router-dom';

const today = new Date().toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });

const I = {
  monitor: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  phone: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  shield: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  map: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  qr: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4" rx="1"/><line x1="22" y1="14" x2="22" y2="22"/><line x1="14" y1="22" x2="22" y2="22"/></svg>,
  zap: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  dumbbell: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6.5 6.5h11M6 12h12M3.5 9v6M20.5 9v6M5.5 7.5v9M18.5 7.5v9"/></svg>,
  utensils: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3v5"/></svg>,
  calendar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};

const IconBox = ({ children }: { children: React.ReactNode }) => (
  <div className="w-10 h-10 rounded-xl bg-orange-400/10 border border-orange-400/15 flex items-center justify-center text-orange-400 shrink-0">
    {children}
  </div>
);

export const HomePage = () => {
  return (
    <div className="min-h-screen bg-[#1a1f2e] text-white font-sans antialiased overflow-x-hidden">

      {/* ═══ NAVBAR ═══ */}
      <nav className="sticky top-0 z-50 bg-[#1a1f2e]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 lg:px-10 py-4">
          <span className="text-xl font-extrabold tracking-tight">
            <span className="text-white">GymSync</span>
            <span className="text-orange-400"> Suite</span>
          </span>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition-colors">Funcionalidades</a>
            <a href="#como-funciona" className="hover:text-white transition-colors">Cómo funciona</a>
            <a href="#roles" className="hover:text-white transition-colors">Roles</a>
            <a href="#stack" className="hover:text-white transition-colors">Tecnología</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-gray-400 hover:text-white transition-colors hidden sm:block">Iniciar Sesión</Link>
            <Link to="/register" className="bg-orange-400 hover:bg-orange-500 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">Registrarse gratis</Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-orange-400/8 blur-[160px] rounded-full pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-24 pb-28 flex flex-col lg:flex-row items-center gap-16">
          {/* Left */}
          <div className="flex-1 max-w-xl">
            <span className="text-xs font-mono text-orange-400 tracking-widest uppercase mb-6 block">
              Proyecto universitario — UNIVALLE · Santa Cruz
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[1.08] mb-6">
              Administra toda tu<br />cadena de{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-500">gimnasios</span>
            </h1>
            <p className="text-lg text-gray-400 leading-relaxed max-w-xl mb-10">
              Panel web para administración. App móvil nativa para clientes y staff.
              Reservas, rutinas, check-in QR, aforo en tiempo real, asesorías y planes nutricionales.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/login" className="bg-orange-400 hover:bg-orange-500 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors">
                Iniciar Sesión
              </Link>
              <Link to="/register" className="border border-white/15 hover:border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors">
                Crear Cuenta
              </Link>
            </div>
          </div>

          {/* Right — Dashboard mockup */}
          <div className="flex-1 max-w-[560px] w-full">
            <div className="border border-white/8 bg-[#14181f] rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                <span className="ml-3 text-[11px] text-gray-500">GymSync Suite · Dashboard</span>
                <span className="ml-auto text-[11px] text-gray-600">{today}</span>
              </div>
              <div className="grid grid-cols-3 divide-x divide-white/5 border-b border-white/5">
                {[{ val: '2,847', label: 'Miembros' }, { val: '38', label: 'Reservas hoy' }, { val: '$48K', label: 'Ingresos' }].map((m, i) => (
                  <div key={i} className="py-5 text-center">
                    <div className="text-2xl font-bold text-white">{m.val}</div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">{m.label}</div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-medium mb-3">Acceso reciente</div>
                {[
                  { initials: 'MC', name: 'María Castro', zone: 'Zona Cardio', time: '08:12' },
                  { initials: 'JR', name: 'Jorge Ríos', zone: 'Musculación', time: '08:34' },
                  { initials: 'LP', name: 'Laura Pérez', zone: 'CrossFit WOD', time: '09:01' },
                ].map((u, i) => (
                  <div key={i} className={`flex items-center gap-3 py-2.5 ${i < 2 ? 'border-b border-white/5' : ''}`}>
                    <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-orange-400 shrink-0">{u.initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-200">{u.name}</div>
                      <div className="text-[10px] text-gray-500">{u.zone}</div>
                    </div>
                    <span className="text-[10px] text-gray-600">{u.time}</span>
                    <span className="text-emerald-400 text-xs">✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <div className="border-y border-white/5 bg-[#14181f]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5">
          {[
            { val: '2,400+', label: 'Miembros activos' },
            { val: '48', label: 'Sucursales' },
            { val: '99.9%', label: 'Uptime' },
            { val: '19', label: 'Módulos' },
            { val: '30+', label: 'Pantallas app' },
          ].map((s, i) => (
            <div key={i} className={`py-8 text-center ${i < 4 ? 'border-r border-white/5' : ''}`}>
              <div className="text-3xl font-bold text-white">{s.val}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="py-24 px-6 lg:px-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Todo lo que necesitas en una plataforma</h2>
            <p className="text-gray-400 max-w-2xl">19 módulos backend, 30+ pantallas móviles, panel web completo — diseñado para escalar.</p>
          </div>

          {/* Bento row 1 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2 bg-[#1e2433] rounded-2xl p-8 border border-white/5 hover:border-orange-400/20 transition-colors">
              <div className="flex gap-3 mb-6">
                <IconBox>{I.monitor}</IconBox>
                <IconBox>{I.phone}</IconBox>
              </div>
              <h3 className="text-xl font-bold mb-3">Panel Web + App Móvil Nativa</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-lg">
                Dos productos en un ecosistema unificado. El panel web para tu equipo administrativo con dashboards, auditoría y gestión de sucursales.
                La app móvil para clientes con rutinas, reservas, mapa GPS y credencial QR virtual.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Dashboard KPIs', 'Mapa GPS', 'QR Virtual', 'Rutinas', 'Reservas', 'Push Notifications'].map(t => (
                  <span key={t} className="text-[11px] text-gray-400 bg-white/5 border border-white/8 px-2.5 py-1 rounded-md">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <GlowCard icon={I.map} title="GPS Geofencing" desc="Detecta cuando un miembro llega a cualquier sucursal. Check-in automático sin intervención manual." />
              <GlowCard icon={I.qr} title="QR Check-in" desc="Escaneo instantáneo y sin contacto. Validación de reserva, sucursal y horario en tiempo real." />
            </div>
          </div>

          {/* Bento row 2 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <GlowCard icon={I.zap} title="WebSocket en Vivo" desc="Aforo actualizado al instante. Notificaciones push de asesorías, reservas y sesiones sin recargar." />
            <GlowCard icon={I.shield} title="RBAC Jerárquico" desc="6 niveles de acceso (1-10). Cada rol ve exactamente lo que necesita. Sin strings — todo por nivel numérico." />
            <GlowCard icon={I.calendar} title="Reservas + Waitlist" desc="Clases programadas o acceso libre. Si el horario está lleno, la lista de espera te promueve automáticamente." />
          </div>

          {/* Bento row 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-4">
              <GlowCard icon={I.dumbbell} title="4 Modos de Entrenamiento" desc="Peso+reps, solo reps, tiempo+distancia o solo tiempo. Cada ejercicio con su logType específico." />
              <GlowCard icon={I.utensils} title="Planes Nutricionales" desc="Planificador semanal de comidas con macronutrientes. Indicaciones personalizadas del coach." />
            </div>
            <div className="md:col-span-2 bg-[#1e2433] rounded-2xl p-8 border border-white/5 hover:border-orange-400/20 transition-colors">
              <div className="flex gap-3 mb-6">
                <IconBox>{I.dumbbell}</IconBox>
              </div>
              <h3 className="text-xl font-bold mb-3">Sistema de Asesorías Entrenador-Cliente</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-lg">
                Los clientes solicitan un entrenador o nutricionista desde la app. El asesor acepta, asigna rutinas semanales por día,
                crea planes nutricionales con comidas y macros, y monitorea el progreso con métricas corporales y records personales.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Solicitar Asesor', 'Rutinas por Día', 'Plan Nutricional', 'Métricas', 'Records', 'Timer Descanso'].map(t => (
                  <span key={t} className="text-[11px] text-gray-400 bg-white/5 border border-white/8 px-2.5 py-1 rounded-md">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PLATFORM SPLIT ═══ */}
      <section id="platform" className="py-24 px-6 lg:px-10 bg-[#14181f] border-y border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Dos productos, un ecosistema</h2>
            <p className="text-gray-400">Panel web para el equipo de gestión. App móvil para clientes y staff en campo.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {[{
              icon: I.monitor, title: 'Panel Web Administrativo',
              items: ['Dashboard con KPIs por sucursal', 'Gestión de usuarios, roles y permisos', 'Catálogo de servicios y actividades', 'Inventario de máquinas con Cloudinary', 'Biblioteca de 69+ ejercicios con videos', 'Gestión de reservas y check-ins QR', 'Auditoría de accesos del personal', 'Mapa interactivo de sucursales'],
            }, {
              icon: I.phone, title: 'App Móvil Nativa',
              items: ['Mapa con GPS, distancia y aforo en vivo', 'Reservas y credencial QR virtual', 'Rutinas semanales con selector por día', 'Ejecutor de ejercicios con timer y descanso', 'Catálogo de entrenadores y nutricionistas', 'Planes nutricionales con comidas diarias', 'Métricas corporales y progreso', 'Notificaciones push en tiempo real', 'Dashboards por rol'],
            }].map((p) => (
              <div key={p.title} className="bg-[#1e2433] border border-white/5 hover:border-white/10 rounded-2xl p-8 transition-colors">
                <div className="flex items-center gap-3 mb-6">
                  <IconBox>{p.icon}</IconBox>
                  <h3 className="text-lg font-bold">{p.title}</h3>
                </div>
                <ul className="space-y-2.5">
                  {p.items.map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="w-1 h-1 rounded-full bg-orange-400 mt-2 shrink-0" />
                      <span className="text-gray-400 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CÓMO FUNCIONA ═══ */}
      <section id="como-funciona" className="py-24 px-6 lg:px-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Cómo funciona</h2>
            <p className="text-gray-400">Tres actores, tres roles, una sola plataforma.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 relative">
            {/* Línea conectora en desktop */}
            <div className="hidden md:block absolute top-12 left-[calc(33.33%+1.5rem)] right-[calc(33.33%+1.5rem)] h-px bg-white/8" />

            {[
              {
                n: '01',
                who: 'Administrador',
                title: 'Configura la sucursal',
                desc: 'Crea sucursales, carga el inventario de máquinas, configura horarios de atención, asigna staff y define los roles desde el panel web.',
                tags: ['Panel Web', 'RBAC', 'Inventario'],
              },
              {
                n: '02',
                who: 'Entrenador',
                title: 'Asigna rutinas',
                desc: 'Acepta solicitudes de asesoría, diseña rutinas semanales por día con ejercicios, series, repeticiones y tiempos de descanso personalizados.',
                tags: ['App Móvil', 'Asesorías', 'Rutinas'],
              },
              {
                n: '03',
                who: 'Cliente',
                title: 'Entrena desde la app',
                desc: 'Reserva clases, hace check-in con QR, ejecuta su rutina con timer, registra series y hace seguimiento de su progreso y métricas corporales.',
                tags: ['App Móvil', 'QR', 'Progreso'],
              },
            ].map((step) => (
              <div key={step.n} className="relative flex flex-col px-6 md:px-8 py-8 border border-white/5 md:border-r md:last:border-r md:border-y-0 md:border-l-0 md:first:border-l rounded-2xl md:rounded-none md:first:rounded-l-2xl md:last:rounded-r-2xl bg-[#1a1f2e] hover:bg-[#1e2433] transition-colors">
                <span className="text-5xl font-black text-orange-400/20 leading-none mb-4 select-none">{step.n}</span>
                <span className="text-xs font-mono text-orange-400 uppercase tracking-widest mb-2">{step.who}</span>
                <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed flex-1">{step.desc}</p>
                <div className="flex flex-wrap gap-1.5 mt-5">
                  {step.tags.map(t => (
                    <span key={t} className="text-[10px] text-gray-500 bg-white/4 border border-white/8 px-2 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ RBAC ═══ */}
      <section id="roles" className="py-24 px-6 lg:px-10 bg-[#14181f] border-y border-white/5">
        <div className="relative max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 max-w-lg">
            <span className="font-mono text-xs text-orange-400 tracking-widest uppercase">Arquitectura de Seguridad</span>
            <h2 className="text-3xl font-extrabold tracking-tight mt-4 mb-4">Control de acceso por nivel jerárquico</h2>
            <p className="text-gray-400 leading-relaxed mb-8">
              Cada rol tiene un nivel numérico (1-10) que determina qué puede ver y hacer.
              Toda la autorización se basa en el peso jerárquico del JWT — sin strings hardcodeados.
            </p>
            <div className="flex flex-col gap-3">
              {[
                'Super Admin controla todo el ecosistema',
                'Gerentes administran su marca y sucursales hijas',
                'Recepcionistas gestionan solo su sucursal',
                'Entrenadores y nutricionistas ven solo sus clientes',
                'Instructores dictan clases grupales con horario fijo',
                'Clientes acceden a sus rutinas, planes y reservas',
              ].map(c => (
                <div key={c} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-orange-400/15 border border-orange-400/20 flex items-center justify-center shrink-0">
                    <span className="text-orange-400 text-[11px] font-bold">✓</span>
                  </div>
                  <span className="text-gray-300 text-sm">{c}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 max-w-md w-full">
            <div className="border border-white/5 bg-[#1e2433] rounded-2xl p-6">
              {[
                { role: 'Super Admin', level: 10, w: '100%' },
                { role: 'Gerente', level: 5, w: '50%' },
                { role: 'Recepcionista', level: 4, w: '40%' },
                { role: 'Entrenador', level: 3, w: '30%' },
                { role: 'Nutricionista', level: 3, w: '30%' },
                { role: 'Instructor', level: 2, w: '20%' },
                { role: 'Cliente', level: 1, w: '10%' },
              ].map((r, i) => (
                <div key={r.role} className={`flex items-center gap-3 py-3 ${i < 6 ? 'border-b border-white/5' : ''}`}>
                  <span className="text-gray-200 text-sm font-medium w-28">{r.role}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-orange-400 to-orange-500" style={{ width: r.w }} />
                  </div>
                  <span className="font-mono text-xs text-orange-400 w-6 text-right">{r.level}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TECH STACK ═══ */}
      <section id="stack" className="py-20 px-6 lg:px-10">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-2xl font-extrabold tracking-tight mb-3">Construido con tecnología enterprise</h2>
          <p className="text-gray-500 text-sm mb-10">Las tecnologías que usamos en cada capa del sistema.</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {[
              'NestJS', 'TypeORM', 'PostgreSQL', 'React', 'React Native', 'Expo',
              'Tailwind CSS', 'Socket.io', 'Cloudinary', 'JWT', 'Swagger', 'Haversine GPS',
            ].map(tech => (
              <span key={tech} className="px-4 py-2.5 rounded-xl bg-[#1e2433] border border-white/5 hover:border-orange-400/20 text-sm text-gray-300 font-medium transition-colors hover:text-white cursor-default">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA FINAL ═══ */}
      <section className="py-28 px-6 lg:px-10 bg-[#14181f] border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[250px] bg-orange-400/8 blur-[140px] rounded-full pointer-events-none" />
        <div className="relative max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Listo para transformar tu{' '}
            <span className="text-orange-400">gimnasio</span>
          </h2>
          <p className="text-gray-400 mb-10 max-w-xl mx-auto">
            19 módulos, 39 tablas PostgreSQL, y una app móvil completa — todo listo para usar.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/login" className="bg-orange-400 hover:bg-orange-500 text-white font-semibold px-10 py-4 rounded-xl text-base transition-colors">
              Iniciar Sesión
            </Link>
            <Link to="/register" className="border border-white/15 hover:border-white/30 text-white font-semibold px-10 py-4 rounded-xl text-base transition-colors">
              Crear Cuenta Gratis
            </Link>
          </div>
          <span className="text-gray-600 text-xs mt-6 block">Sin tarjeta de crédito requerida</span>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/5 bg-[#1a1f2e] py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
            <div className="md:col-span-2">
              <span className="text-lg font-extrabold tracking-tight">
                <span className="text-white">GymSync</span>
                <span className="text-orange-400"> Suite</span>
              </span>
              <p className="text-gray-500 text-sm mt-3 max-w-sm leading-relaxed">
                Plataforma integral de gestión para cadenas de gimnasios.
                Panel web administrativo + App móvil nativa.
              </p>
              <div className="mt-4">
                <span className="text-[11px] text-gray-600 uppercase tracking-widest">Proyecto Universitario</span>
                <p className="text-gray-500 text-sm mt-1">Universidad Privada del Valle (UNIVALLE)</p>
              </div>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-4">Plataforma</h4>
              <ul className="space-y-2.5">
                <li><Link to="/login" className="text-gray-400 text-sm hover:text-white transition-colors">Iniciar Sesión</Link></li>
                <li><Link to="/register" className="text-gray-400 text-sm hover:text-white transition-colors">Crear Cuenta</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-4">Legal</h4>
              <ul className="space-y-2.5">
                <li><Link to="/terminos" className="text-gray-400 text-sm hover:text-white transition-colors">Términos de Uso</Link></li>
                <li><Link to="/privacidad" className="text-gray-400 text-sm hover:text-white transition-colors">Política de Privacidad</Link></li>
                <li><Link to="/contacto" className="text-gray-400 text-sm hover:text-white transition-colors">Contacto</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="text-gray-600 text-xs">{'©'} {new Date().getFullYear()} GymSync Suite. Todos los derechos reservados.</span>
            <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3 text-gray-600 text-xs">
              <span>Desarrollado por:</span>
              <span className="text-gray-400 font-medium">Rene Aaron Sendoya Baqueros</span>
              <span className="hidden md:inline text-gray-700">{'·'}</span>
              <span className="text-gray-400 font-medium">Sebastian Fernandez Conde</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const GlowCard = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <div className="bg-[#1e2433] rounded-2xl p-6 border border-white/5 hover:border-orange-400/20 transition-colors flex-1 flex flex-col">
    <IconBox>{icon}</IconBox>
    <h3 className="text-white font-semibold mt-4 mb-2 text-sm">{title}</h3>
    <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
  </div>
);
