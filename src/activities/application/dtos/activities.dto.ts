import { IsString, IsOptional, IsInt, IsBoolean, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export {
  CreateActivityScheduleDto,
  DayOfWeek,
  normalizeDayOfWeekInput,
} from './create-activity-schedule.dto';

export class CreateActivityDto {
  @ApiPropertyOptional({
    example: 1,
    description:
      'ID del gimnasio (SUPER_ADMIN lo especifica; GERENTE lo toma del token)',
  })
  @IsOptional()
  @IsInt()
  gymId?: number;

  @ApiProperty({ example: 'Spinning' })
  @IsString({ message: 'El nombre del servicio debe ser texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio o inválido' })
  name: string;

  @ApiProperty({ example: 'Clase de ciclismo indoor de alta intensidad' })
  @IsString({ message: 'La descripción debe ser texto' })
  @MinLength(5, { message: 'La descripción debe tener al menos 5 caracteres' })
  @MaxLength(200, { message: 'La descripción no puede superar los 200 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'La descripción parece contener texto aleatorio o inválido' })
  description: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  defaultDurationMin?: number;

  @ApiPropertyOptional({
    example: false,
    description:
      'Si es true, la actividad es de acceso libre: no requiere horario específico al reservar.',
  })
  @IsOptional()
  @IsBoolean()
  isFreeAccess?: boolean;
}

export class UpdateActivityDto {
  @ApiPropertyOptional({
    example: 2,
    description:
      'Reasignar la actividad a otra sede. GERENTE solo puede usar su propio gymId.',
  })
  @IsOptional()
  @IsInt()
  gymId?: number;

  @ApiPropertyOptional({ example: 'Spinning Pro' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio o inválido' })
  name?: string;

  @ApiPropertyOptional({ example: 'Descripción actualizada' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La descripción no puede superar los 200 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'La descripción parece contener texto aleatorio o inválido' })
  description?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  defaultDurationMin?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Acceso libre (sin horario obligatorio)',
  })
  @IsOptional()
  @IsBoolean()
  isFreeAccess?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Activar o desactivar el servicio' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RegisterAttendanceDto {
  @ApiProperty({ example: 1, description: 'ID del usuario' })
  @IsInt()
  userId: number;

  @ApiPropertyOptional({ example: 'CONFIRMED' })
  @IsOptional()
  @IsString()
  status?: string;
}
