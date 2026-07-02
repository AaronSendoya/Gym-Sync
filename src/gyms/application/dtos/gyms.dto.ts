import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ── Sub-DTOs ─────────────────────────────────────────────────────────────────

export class CreateGymLocationDto {
  @ApiProperty({ example: 'Av. Monseñor Rivero #300, Santa Cruz' })
  @IsString({ message: 'La dirección debe ser texto' })
  address: string;

  @ApiProperty({ example: 'Santa Cruz de la Sierra' })
  @IsString({ message: 'La ciudad debe ser texto' })
  city: string;

  @ApiProperty({ example: -17.7833 })
  @IsNumber({}, { message: 'La latitud debe ser un número' })
  latitude: number;

  @ApiProperty({ example: -63.1821 })
  @IsNumber({}, { message: 'La longitud debe ser un número' })
  longitude: number;
}

export class CreateGymScheduleDto {
  @ApiProperty({
    example: 'LUNES',
    description:
      'LUNES | MARTES | MIERCOLES | JUEVES | VIERNES | SABADO | DOMINGO',
  })
  @IsString()
  dayOfWeek: string;

  @ApiProperty({ example: '06:00', description: 'Hora apertura (HH:mm)' })
  @IsString()
  opensAt: string;

  @ApiProperty({ example: '22:00', description: 'Hora cierre (HH:mm)' })
  @IsString()
  closesAt: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isHoliday?: boolean;
}

// ── Main DTOs ─────────────────────────────────────────────────────────────────

export class CreateGymDto {
  @ApiProperty({ example: 'Corpus Gym - Sede Centro' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio o inválido' })
  name: string;

  @ApiPropertyOptional({
    example:
      'Gimnasio premium con área de CrossFit, piscina y spa en el centro de Santa Cruz',
  })
  @IsOptional()
  @IsString({ message: 'La descripción debe ser texto' })
  @MaxLength(300, { message: 'La descripción no puede superar los 300 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'La descripción parece contener texto aleatorio o inválido' })
  description?: string;

  @ApiProperty({
    example: 150,
    description: 'Capacidad máxima de personas simultáneas',
  })
  @IsInt()
  maxCapacity: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'ID de la sede o marca principal a la que pertenece esta sucursal',
  })
  @IsOptional()
  @IsInt()
  parentId?: number;

  @ApiPropertyOptional({
    type: CreateGymLocationDto,
    example: {
      address: 'Av. Monseñor Rivero #300, Santa Cruz',
      city: 'Santa Cruz de la Sierra',
      latitude: -17.7833,
      longitude: -63.1821,
    },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateGymLocationDto)
  location?: CreateGymLocationDto;

  @ApiPropertyOptional({
    type: [CreateGymScheduleDto],
    example: [
      { dayOfWeek: 'LUNES', opensAt: '06:00', closesAt: '22:00' },
      { dayOfWeek: 'MARTES', opensAt: '06:00', closesAt: '22:00' },
      { dayOfWeek: 'SABADO', opensAt: '07:00', closesAt: '20:00' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGymScheduleDto)
  schedules?: CreateGymScheduleDto[];
}

export class UpdateGymDto {
  @ApiPropertyOptional({ example: 'Corpus Gym - Sede Norte' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio o inválido' })
  name?: string;

  @ApiPropertyOptional({
    example: 'Nueva descripción actualizada del gimnasio',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'La descripción no puede superar los 300 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'La descripción parece contener texto aleatorio o inválido' })
  description?: string;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsInt()
  maxCapacity?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID de la sede o marca principal',
  })
  @IsOptional()
  @IsInt()
  parentId?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'true = abierto, false = cerrado',
  })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

}

export class CreateGymScheduleInputDto {
  @ApiProperty({ example: 'MIERCOLES' })
  @IsString()
  dayOfWeek: string;

  @ApiProperty({ example: '06:00' })
  @IsString()
  opensAt: string;

  @ApiProperty({ example: '22:00' })
  @IsString()
  closesAt: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isHoliday?: boolean;
}

export class UpdateGymLocationDto {
  @ApiPropertyOptional({ example: 'Av. Banzer Km 7, Santa Cruz' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Santa Cruz de la Sierra' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: -17.765 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: -63.195 })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}
