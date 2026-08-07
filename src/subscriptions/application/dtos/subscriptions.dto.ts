import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  IsNumber,
  IsBoolean,
  IsPositive,
  IsDateString,
  Min,
} from 'class-validator';

export const PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'QR', 'TARJETA'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Estados de membresía — español, consistente con el resto del dominio
 * (Reservation usa CONFIRMADA/PENDIENTE). Las lecturas toleran el valor
 * legado 'ACTIVO' de datos históricos, pero nunca se escribe.
 */
export const MEMBERSHIP_STATUSES = [
  'ACTIVA',
  'VENCIDA',
  'CONGELADA',
  'CANCELADA',
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Valores aceptados en lecturas (incluye legado). */
export const ACTIVE_MEMBERSHIP_STATUSES = ['ACTIVA', 'ACTIVO'] as const;

/**
 * Estados que BLOQUEAN inscribir una membresía nueva: una CONGELADA sigue
 * ocupando el cupo del cliente (se descongela, no se duplica).
 */
export const BLOCKING_MEMBERSHIP_STATUSES = ['ACTIVA', 'ACTIVO', 'CONGELADA'] as const;

export class CreatePlanDto {
  @ApiProperty({ example: 'Mensualidad Regular' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 12,
    description:
      'Sucursal dueña del plan. Recepcionista: se fuerza la suya. Gerente: obligatoria, de su marca. Super Admin: omitir = plan global de la red.',
  })
  @IsOptional()
  @IsInt()
  gymId?: number;

  @ApiPropertyOptional({
    example: 'Acceso total, clases grupales, locker premium',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 350.0, description: 'Precio en moneda local' })
  @IsNumber()
  @Min(0)
  priceMonthly: number;

  @ApiPropertyOptional({
    example: 30,
    description:
      'Plan por fecha: días calendario de vigencia. Omitir en planes por sesiones.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({
    example: 30,
    description:
      'Plan por sesiones: ingresos reales incluidos (ej. Plan Ejecutivo). Omitir en planes por fecha.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  sessionsIncluded?: number;

  @ApiPropertyOptional({
    example: 60,
    description: 'Plan por sesiones: ventana de días para consumirlas.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  windowDays?: number;

  @ApiPropertyOptional({
    example: 'SUCURSAL',
    description: 'SUCURSAL = solo sucursal de inscripción | MARCA = toda la red de la marca (VIP)',
  })
  @IsOptional()
  @IsIn(['SUCURSAL', 'MARCA'])
  scope?: 'SUCURSAL' | 'MARCA';

  @ApiPropertyOptional({
    example: { clases_grupales: true, locker: true, sauna: false },
  })
  @IsOptional()
  features?: any;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ example: 'Mensualidad Regular' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  gymId?: number;

  @ApiPropertyOptional({ example: 'Descripción actualizada' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 380.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  sessionsIncluded?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  windowDays?: number;

  @ApiPropertyOptional({ example: 'MARCA' })
  @IsOptional()
  @IsIn(['SUCURSAL', 'MARCA'])
  scope?: 'SUCURSAL' | 'MARCA';

  @ApiPropertyOptional()
  @IsOptional()
  features?: any;
}

export class CreateSubscriptionDto {
  @ApiProperty({ example: 1, description: 'ID del usuario' })
  @IsInt()
  userId: number;

  @ApiProperty({ example: 1, description: 'ID del plan' })
  @IsInt()
  planId: number;

  @ApiPropertyOptional({ example: 1, description: 'ID de la sucursal de inscripción' })
  @IsOptional()
  @IsInt()
  homeGymId?: number;

  @ApiProperty({ example: '2026-07-01' })
  @IsString()
  startDate: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
    description:
      'IGNORADO: el servidor calcula el vencimiento desde el plan (startDate + durationDays/windowDays). Se acepta por compatibilidad.',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 'ACTIVA',
    description:
      'IGNORADO: toda membresía nace ACTIVA. CONGELADA/CANCELADA solo se aplican vía PUT /subscriptions/:id (que ejecuta sus efectos de negocio, ej. frozenAt). Se acepta por compatibilidad.',
  })
  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: MembershipStatus;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ example: 'CONGELADA' })
  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: MembershipStatus;

  @ApiPropertyOptional({
    example: 12,
    description: 'Mover la membresía a otra sucursal del territorio del caller.',
  })
  @IsOptional()
  @IsInt()
  homeGymId?: number;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}

export class CreatePaymentDto {
  @ApiProperty({ example: 350.0 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'BOB', description: 'Moneda' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({
    example: 'TRANSFERENCIA',
    description: 'EFECTIVO | TRANSFERENCIA | QR | TARJETA',
  })
  @IsIn(PAYMENT_METHODS)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: 'REF-2026-001' })
  @IsOptional()
  @IsString()
  transactionReference?: string;
}
