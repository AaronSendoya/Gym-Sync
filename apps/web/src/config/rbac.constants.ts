/**
 * DB_ROLES — Constantes sincronizadas con la tabla `roles` de PostgreSQL.
 * Fuente de verdad única para todos los componentes del frontend web.
 * IDs verificados directamente de la BD.
 *
 * ID  | Nombre                | level | isSystemRole
 *  1  | SUPER_ADMIN           |  10   | true
 *  2  | GERENTE               |   5   | true
 *  3  | CLIENTE               |   1   | true  (rol cliente/socio)
 *  4  | ENTRENADOR            |   3   | true
 *  5  | COORDINADOR           | null  | false
 *  6  | PERSONAL_DE_LIMPIEZA  |   1   | false
 *  7  | INSTRUCTOR            |   3   | false
 *  8  | NUTRICIONISTA         |   3   | true
 *  9  | RECEPCIONISTA         |   4   | false
 * 13  | MANTENIMIENTO         |   4   | false
 */
export const DB_ROLES = {
  SUPER_ADMIN:          1,
  GERENTE:              2,
  CLIENTE:              3,
  ENTRENADOR:           4,
  INSTRUCTOR:           7,
  NUTRICIONISTA:        8,
  RECEPCIONISTA:        9,
} as const;

export type DbRoleId = (typeof DB_ROLES)[keyof typeof DB_ROLES];

export const ROLE_ID_TO_NAME: Record<number, string> = {
  1:  'SUPER_ADMIN',
  2:  'GERENTE',
  3:  'CLIENTE',
  4:  'ENTRENADOR',
  5:  'COORDINADOR',
  6:  'PERSONAL_DE_LIMPIEZA',
  7:  'INSTRUCTOR',
  8:  'NUTRICIONISTA',
  9:  'RECEPCIONISTA',
  13: 'MANTENIMIENTO',
};

export const VALID_ROLES = [
  'SUPER_ADMIN',
  'GERENTE',
  'ENTRENADOR',
  'NUTRICIONISTA',
  'CLIENTE',
  'RECEPCIONISTA',
  'INSTRUCTOR',
] as const;
