import type { UserRole } from '@gymsync/core';

export interface NavRoute {
  path: string;
  label: string;
  allowedRoles: UserRole[];
  minLevel?: number;
}

export const NAV_ROUTES: NavRoute[] = [
  { path: 'resumen',     label: 'Resumen',               allowedRoles: ['SUPER_ADMIN', 'GERENTE', 'RECEPCIONISTA'], minLevel: 4 },
  { path: 'auditoria',   label: 'Registros del Personal', allowedRoles: ['SUPER_ADMIN', 'GERENTE', 'RECEPCIONISTA'], minLevel: 4 },
  { path: 'usuarios',    label: 'Usuarios',               allowedRoles: ['SUPER_ADMIN', 'GERENTE', 'RECEPCIONISTA'], minLevel: 4 },
  { path: 'sedes',       label: 'Marcas',                 allowedRoles: ['SUPER_ADMIN'], minLevel: 10 },
  { path: 'sucursales',  label: 'Sucursales',             allowedRoles: ['SUPER_ADMIN'], minLevel: 10 },
  { path: 'roles',       label: 'Roles',                  allowedRoles: ['SUPER_ADMIN'], minLevel: 10 },
  { path: 'mapa',        label: 'Mapa de Red',            allowedRoles: ['SUPER_ADMIN', 'GERENTE', 'RECEPCIONISTA'], minLevel: 4 },
  { path: 'actividades', label: 'Catálogo de Servicios',  allowedRoles: ['SUPER_ADMIN', 'GERENTE', 'RECEPCIONISTA'], minLevel: 4 },
  { path: 'maquinas',    label: 'Inventario de Máquinas', allowedRoles: ['SUPER_ADMIN', 'GERENTE', 'RECEPCIONISTA'], minLevel: 4 },
  { path: 'biblioteca-ejercicios', label: 'Biblioteca de Ejercicios App', allowedRoles: ['SUPER_ADMIN'], minLevel: 10 },
  { path: 'reservas',    label: 'Gestion de Reservas',    allowedRoles: ['SUPER_ADMIN', 'GERENTE', 'RECEPCIONISTA'], minLevel: 4 },
  { path: 'membresias',  label: 'Membresías',             allowedRoles: ['SUPER_ADMIN', 'GERENTE', 'RECEPCIONISTA'], minLevel: 4 },
  { path: 'reportes',   label: 'Reportes',               allowedRoles: ['SUPER_ADMIN', 'GERENTE'], minLevel: 4 },
];

export const getRoutesForRole = (role: UserRole | undefined, level?: number): NavRoute[] => {
  if (!role) return [];
  const lvl = level ?? 0;
  return NAV_ROUTES.filter(r =>
    r.allowedRoles.includes(role) || (r.minLevel !== undefined && lvl >= r.minLevel)
  );
};
