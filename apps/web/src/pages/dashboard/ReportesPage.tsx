import React, { useState } from 'react';
import { FileText, BarChart2, Layers, Users, Trophy, Calendar, XCircle, TrendingUp, ClipboardList, UserX } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ReportFilterModal }  from '../../components/Reports/ReportFilterModal';
import { ReportPreviewModal } from '../../components/Reports/ReportPreviewModal';
import type { ReportType, ReportFilters } from '../../components/Reports/types';

interface ReportCard {
  type:        ReportType;
  title:       string;
  description: string;
  badge:       string;
  icon:        React.ReactNode;
  superOnly?:  boolean;
}

interface Category {
  id: string;
  label: string;
  types: ReportType[];
}

const CATEGORIES: Category[] = [
  { id: 'operacion',       label: 'Operación Diaria',           types: ['asistencia', 'aforo', 'auditoria'] },
  { id: 'rendimiento',     label: 'Rendimiento',                types: ['ranking', 'actividades', 'cancelaciones'] },
  { id: 'comportamiento',  label: 'Comportamiento de Usuarios', types: ['frecuencia', 'churn', 'consolidado'] },
  { id: 'infraestructura', label: 'Infraestructura',            types: ['maquinas'] },
];

const CARDS: ReportCard[] = [
  {
    type:        'asistencia',
    title:       'Asistencia por Sucursal',
    description: '¿Cuántos miembros asistieron y en qué horarios? Muestra los días con más afluencia, horas pico y una comparativa con el mes anterior.',
    badge:       'GERENTE',
    icon:        <BarChart2 size={22} />,
  },
  {
    type:        'maquinas',
    title:       'Inventario de Máquinas',
    description: 'Estado actual de cada equipo por categoría. Identifica de un vistazo cuáles están disponibles y cuáles requieren mantenimiento.',
    badge:       'GERENTE / SUPER ADMIN',
    icon:        <Layers size={22} />,
  },
  {
    type:        'consolidado',
    title:       'Consolidado de Sucursales',
    description: 'Visión global de toda la red: compara asistencias, reservas, miembros activos y equipos en cada sucursal, agrupados por marca.',
    badge:       'SUPER ADMIN',
    icon:        <FileText size={22} />,
    superOnly:   true,
  },
  {
    type:        'aforo',
    title:       'Ocupación y Aforo',
    description: 'Estado actual de capacidad por sucursal: aforo real vs máximo, porcentaje de utilización y capacidad de máquinas instaladas.',
    badge:       'GERENTE / SUPER ADMIN',
    icon:        <Users size={22} />,
  },
  {
    type:        'ranking',
    title:       'Ranking de Sucursales',
    description: 'Score consolidado por sucursal basado en check-ins, reservas completadas, miembros activos y % de ocupación. Identifica las sucursales con mejor y peor desempeño.',
    badge:       'SUPER ADMIN',
    icon:        <Trophy size={22} />,
    superOnly:   true,
  },
  {
    type:        'actividades',
    title:       'Reservas por Actividad',
    description: 'Reservas confirmadas, completadas y canceladas por tipo de actividad. Identifica las clases más populares y con mayor cancelación.',
    badge:       'GERENTE / SUPER ADMIN',
    icon:        <Calendar size={22} />,
  },
  {
    type:        'cancelaciones',
    title:       'Cancelaciones y No-Shows',
    description: 'Tasa de cancelación por actividad y día de semana. Detecta patrones de abandono y actividades con mayor índice de incumplimiento.',
    badge:       'GERENTE / SUPER ADMIN',
    icon:        <XCircle size={22} />,
  },
  {
    type:        'frecuencia',
    title:       'Frecuencia de Entrenamiento',
    description: 'Distribución de check-ins por usuario en el período. Clasifica miembros por frecuencia e identifica los más y menos activos.',
    badge:       'GERENTE / SUPER ADMIN',
    icon:        <TrendingUp size={22} />,
  },
  {
    type:        'auditoria',
    title:       'Auditoría de Accesos',
    description: 'Registro completo de todos los check-ins por fecha, usuario y sede. Útil para control de asistencia y cumplimiento normativo.',
    badge:       'GERENTE / SUPER ADMIN',
    icon:        <ClipboardList size={22} />,
  },
  {
    type:        'churn',
    title:       'Retención de Usuarios',
    description: 'Usuarios activos, en riesgo (sin check-in en 30–90 días) e inactivos. Detecta clientes en riesgo de abandono para intervención proactiva.',
    badge:       'GERENTE / SUPER ADMIN',
    icon:        <UserX size={22} />,
  },
];

export function ReportesPage() {
  const { user } = useAuth();
  const isSuperAdmin = (user?.level ?? 0) >= 10;

  const [filterType,  setFilterType]  = useState<ReportType | null>(null);
  const [activeFilters, setActiveFilters] = useState<ReportFilters | null>(null);

  function openFilter(type: ReportType) {
    setActiveFilters(null);
    setFilterType(type);
  }

  function handleFilterConfirm(filters: ReportFilters) {
    setFilterType(null);
    setActiveFilters(filters);
  }

  function closePreview() {
    setActiveFilters(null);
  }

  const visibleCards = CARDS.filter(c => !c.superOnly || isSuperAdmin);

  return (
    <div className="min-h-full p-6">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Centro de Reportes</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
          Genera y exporta informes PDF basados en los datos de tu sucursal.
        </p>
      </div>

      {/* Categorized hub */}
      <div className="flex flex-col gap-10">
        {CATEGORIES.map(cat => {
          const catCards = visibleCards.filter(c => cat.types.includes(c.type));
          if (catCards.length === 0) return null;
          return (
            <section key={cat.id}>
              {/* Category header */}
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-gray-400">
                  {cat.label}
                </h2>
                <div className="flex-1 h-px bg-slate-200 dark:bg-white/10 ml-2" />
              </div>

              {/* Cards grid */}
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {catCards.map(card => (
                  <div
                    key={card.type}
                    className="flex flex-col rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-bg-surface p-5 transition-colors duration-200 hover:border-brand-orange/60 dark:hover:border-brand-orange/40"
                  >
                    {/* Icon + badge row */}
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange">
                        {card.icon}
                      </div>
                      <span className="rounded-full border border-slate-200 dark:border-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                        {card.badge}
                      </span>
                    </div>

                    {/* Text */}
                    <h3 className="mb-2 text-[15px] font-semibold text-slate-900 dark:text-white leading-snug">
                      {card.title}
                    </h3>
                    <p className="flex-1 text-sm text-slate-500 dark:text-gray-400 leading-relaxed">
                      {card.description}
                    </p>

                    {/* CTA */}
                    <button
                      onClick={() => openFilter(card.type)}
                      className="mt-5 w-full rounded-lg border border-brand-orange/60 px-4 py-2.5 text-sm font-semibold text-brand-orange transition-colors duration-200 hover:bg-brand-orange/10"
                    >
                      Configurar Reporte
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Filter modal */}
      {filterType && (
        <ReportFilterModal
          type={filterType}
          onConfirm={handleFilterConfirm}
          onClose={() => setFilterType(null)}
        />
      )}

      {/* Preview modal */}
      {activeFilters && (
        <ReportPreviewModal
          filters={activeFilters}
          onClose={closePreview}
        />
      )}
    </div>
  );
}
