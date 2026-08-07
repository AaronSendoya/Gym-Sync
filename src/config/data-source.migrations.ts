// DataSource dedicado a la CLI de TypeORM (migration:generate / migration:run / migration:revert).
// A diferencia de data-source.cli.ts (usado por scripts ad-hoc con synchronize:true),
// este vive con synchronize:false porque su única función es producir y aplicar migraciones.
//
// Flujo esperado: en dev seguimos usando `synchronize: true` (ver app.module.ts) para iterar rápido.
// Cada vez que cambien las entidades y quieran que ese cambio llegue a producción, corran
// `npm run migration:generate -- src/migrations/NombreDelCambio` para capturar el diff antes de mergear.
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

if (!process.env.DB_PASSWORD) {
  throw new Error(
    'Falta DB_PASSWORD en .env — configúralo antes de correr comandos de migración.',
  );
}

export const MigrationsDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || 'bdd_gym_sync',
  synchronize: false,
  logging: true,
  entities: ['src/**/domain/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
