import {
  IsString,
  IsOptional,
  IsInt,
  IsEnum,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MachineStatus, MachineCategory } from '../../domain/machine-inventory.entity';

export class CreateMachineDto {
  @ApiProperty({ example: 'Cinta de Correr Precor 900' })
  @IsString({ message: 'El nombre debe ser texto' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio o inválido' })
  name!: string;

  @ApiProperty({ example: 11, description: 'ID de la sucursal física' })
  @IsInt({ message: 'gymId debe ser un entero' })
  gymId!: number;

  @ApiPropertyOptional({
    enum: MachineStatus,
    example: MachineStatus.AVAILABLE,
    description: 'Estado de la máquina (default: AVAILABLE)',
  })
  @IsOptional()
  @IsEnum(MachineStatus)
  status?: MachineStatus;

  @ApiPropertyOptional({
    enum: MachineCategory,
    example: MachineCategory.CARDIO,
    description: 'Zona muscular / categoría de la máquina',
  })
  @IsOptional()
  @IsEnum(MachineCategory)
  category?: MachineCategory;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/...' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class UpdateMachineDto {
  @ApiPropertyOptional({ example: 'Cinta de Correr Life Fitness' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio o inválido' })
  name?: string;

  @ApiPropertyOptional({
    example: 12,
    description: 'Reasignar a otra sucursal',
  })
  @IsOptional()
  @IsInt()
  gymId?: number;

  @ApiPropertyOptional({
    enum: MachineStatus,
    example: MachineStatus.MAINTENANCE,
  })
  @IsOptional()
  @IsEnum(MachineStatus)
  status?: MachineStatus;

  @ApiPropertyOptional({
    enum: MachineCategory,
    example: MachineCategory.TREN_INFERIOR,
  })
  @IsOptional()
  @IsEnum(MachineCategory)
  category?: MachineCategory;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/...' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
