const REQUIRED_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_DATABASE',
  'JWT_SECRET',
] as const;

// Falla el arranque si falta un secreto en vez de dejar que cada módulo
// caiga en un fallback débil hardcodeado (ver docker-compose.yml / data-source.cli.ts).
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = config[key];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno requeridas ausentes: ${missing.join(', ')}. ` +
        'Configúralas en tu .env (ver .env.example) antes de arrancar la aplicación.',
    );
  }

  return config;
}
