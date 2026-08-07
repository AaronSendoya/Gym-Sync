import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import cookieParser = require('cookie-parser');
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: isProd
      ? ['error', 'warn', 'log']
      : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // ── Security Headers (helmet) ──────────────────────────────────
  app.use(helmet());

  // ── Cookie Parser (requerido para leer HttpOnly cookies en el guard JWT) ──
  app.use(cookieParser());

  // ── Global Prefix ──────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── CORS ───────────────────────────────────────────────────────
  // En producción restringimos a un allowlist explícito (origin:true + credentials:true
  // reflejaría cualquier origen con cookies incluidas). En desarrollo se mantiene abierto
  // porque el frontend/mobile local pueden correr en distintos puertos/IPs de LAN.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProd && corsOrigins.length === 0) {
    logger.warn(
      'CORS_ORIGINS no está configurado en producción — se bloquearán todas las peticiones cross-origin. ' +
        'Define CORS_ORIGINS en .env con los dominios del frontend (separados por coma).',
    );
  }

  app.enableCors({
    origin: isProd ? corsOrigins : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // ── Global Pipes ───────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Global Filters & Interceptors ─────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new TransformInterceptor(),
  );

  // ── Swagger Documentation ─────────────────────────────────────
  // Nunca montado en producción: expondría toda la superficie de la API sin auth delante.
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('GymSync API')
      .setDescription(
        'API REST del backend de GymSync — Gestión de gimnasios, usuarios, rutinas, entrenamientos y métricas.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Ingresa tu JWT token',
          in: 'header',
        },
        'access-token',
      )
      .addTag('Auth', 'Autenticación y registro')
      .addTag('Users', 'Gestión de usuarios y perfiles')
      .addTag('Roles & Permissions', 'Sistema flexible de roles y permisos')
      .addTag('Gyms', 'Gimnasios, ubicaciones y horarios')
      .addTag('Machines', 'Inventario de máquinas físicas')
      .addTag('Activities', 'Actividades, horarios y asistencia')
      .addTag('Exercises', 'Catálogo de ejercicios')
      .addTag('Routines', 'Rutinas de entrenamiento')
      .addTag('Training', 'Perfil, sesiones, series y restricciones')
      .addTag('Subscriptions', 'Planes, suscripciones y pagos')
      .addTag('Reservations', 'Reservas de actividades')
      .addTag('Waitlist', 'Lista de espera FIFO')
      .addTag('Check-ins', 'Acceso y check-in/check-out')
      .addTag('Metrics', 'Métricas físicas históricas')
      .addTag('Notifications', 'Notificaciones y preferencias')
      .addTag('System', 'Configuración del sistema')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        defaultModelsExpandDepth: 3,
        defaultModelExpandDepth: 3,
        defaultModelRendering: 'example',
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
      },
    });
  }

  // ── Start Server ──────────────────────────────────────────────
  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');

  const env = configService.get('NODE_ENV') || 'development';
  logger.log(`GymSync API running on http://localhost:${port}/api [${env}]`);
  if (!isProd) {
    logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
