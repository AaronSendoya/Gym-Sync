import {
  IsEmail,
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
  IsArray,
  IsDateString,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
const PASSWORD_MSG =
  'La contraseña debe tener mínimo 8 caracteres, incluir un número y un carácter especial';
const CI_REGEX = /^\d{6,9}(-[a-zA-Z0-9]{1,2})?$/;
const CI_MSG = 'Formato de documento de identidad inválido';
const PHONE_REGEX = /^\+\d{7,15}$/;
const PHONE_MSG =
  'El número de teléfono debe ser un formato internacional válido (ej. +59170000000)';

export class SaveMetricsDto {
  @ApiProperty({ example: 75.5, description: 'Peso en kilogramos' })
  @IsNumber()
  weightKg!: number;

  @ApiProperty({ example: 170.5, description: 'Altura en centímetros' })
  @IsNumber()
  heightCm!: number;

  @ApiPropertyOptional({
    example: 25,
    description:
      'Edad del usuario (se convierte a fecha de nacimiento aproximada)',
  })
  @IsOptional()
  @IsNumber()
  edad?: number;
}

export class SaveCircumferencesDto {
  @ApiPropertyOptional({ example: 78.5, description: 'Cintura en cm' })
  @IsOptional() @IsNumber() waistCm?: number;

  @ApiPropertyOptional({ example: 95.0, description: 'Cadera en cm' })
  @IsOptional() @IsNumber() hipCm?: number;

  @ApiPropertyOptional({ example: 90.0, description: 'Pecho/Busto en cm' })
  @IsOptional() @IsNumber() chestCm?: number;

  @ApiPropertyOptional({ example: 32.5, description: 'Brazo medio en cm' })
  @IsOptional() @IsNumber() midArmCm?: number;

  @ApiPropertyOptional({ example: 55.0, description: 'Muslo/Pierna en cm' })
  @IsOptional() @IsNumber() thighCm?: number;

  @ApiPropertyOptional({ example: 38.0, description: 'Pantorrilla en cm' })
  @IsOptional() @IsNumber() calfCm?: number;
}

export class UpdatePushTokenDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description: 'Token de Expo para notificaciones push',
  })
  @IsString()
  token!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Carlos' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El nombre no puede superar los 60 caracteres' })
  @Matches(/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]+$/, { message: 'El nombre solo puede contener letras, espacios y guiones' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'López' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El apellido no puede superar los 60 caracteres' })
  @Matches(/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]+$/, { message: 'El apellido solo puede contener letras, espacios y guiones' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El apellido parece contener texto aleatorio' })
  lastName?: string;

  @ApiPropertyOptional({ example: '+59170099999' })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MSG })
  phone?: string;

  @ApiPropertyOptional({ example: 'Masculino' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    example: '1995-06-15',
    description: 'Fecha de nacimiento (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({
    example: 25,
    description: 'Edad en años (se convierte a fecha de nacimiento aproximada)',
  })
  @IsOptional()
  @IsNumber()
  age?: number;

  @ApiPropertyOptional({ example: 75.5 })
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiPropertyOptional({ example: 38.2 })
  @IsOptional()
  @IsNumber()
  muscleMassKg?: number;

  @ApiPropertyOptional({ example: 95.0 })
  @IsOptional()
  @IsNumber()
  chestCm?: number;

  @ApiPropertyOptional({ example: 'Medición post-ciclo' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '1234567' })
  @IsOptional()
  @Matches(CI_REGEX, { message: CI_MSG })
  ci?: string;

  @ApiPropertyOptional({ example: 170.5 })
  @IsOptional()
  @IsNumber()
  heightCm?: number;

  @ApiPropertyOptional({
    example: 'INTERMEDIO',
    description: 'PRINCIPIANTE | INTERMEDIO | AVANZADO',
  })
  @IsOptional()
  @IsString()
  experienceLevel?: string;

  @ApiPropertyOptional({ example: 'Diabetes tipo 2, hipertensión' })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ example: ['Fútbol', 'Natación'] })
  @IsOptional()
  @IsArray()
  favoriteSports?: string[];

  @ApiPropertyOptional({ example: 'avatar_3.png' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'carl0s_fit' })
  @IsOptional()
  @IsString()
  username?: string;
}

export class CreateUserDto {
  @ApiProperty({
    example: 'admin@corpusgym.com',
    description: 'Correo electrónico único',
  })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @IsEmail({}, { message: 'Formato de correo electrónico inválido' })
  email!: string;

  @ApiProperty({
    example: 'MiClave123!',
    description: 'Mínimo 8 caracteres, 1 número y 1 carácter especial',
  })
  @IsString({ message: 'La contraseña debe ser texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  password!: string;

  @ApiProperty({ example: 'RASB', description: 'Nombre' })
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El nombre no puede superar los 60 caracteres' })
  @Matches(/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]+$/, { message: 'El nombre solo puede contener letras, espacios y guiones' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio' })
  firstName!: string;

  @ApiProperty({ example: 'Admin', description: 'Apellido' })
  @IsString({ message: 'El apellido debe ser texto' })
  @IsNotEmpty({ message: 'El apellido es obligatorio' })
  @MinLength(2, { message: 'El apellido debe tener al menos 2 caracteres' })
  @MaxLength(60, { message: 'El apellido no puede superar los 60 caracteres' })
  @Matches(/^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]+$/, { message: 'El apellido solo puede contener letras, espacios y guiones' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El apellido parece contener texto aleatorio' })
  lastName!: string;

  @ApiPropertyOptional({
    example: '+59170012345',
    description: 'Teléfono de contacto',
  })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MSG })
  phone?: string;

  @ApiPropertyOptional({
    example: '1995-06-15',
    description: 'Fecha de nacimiento (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({
    example: 'Masculino',
    description: 'Masculino | Femenino | Otro',
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID del rol asignado al usuario',
  })
  @IsOptional()
  @IsNumber()
  roleId?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'ID de la sucursal asignada',
  })
  @IsOptional()
  @IsNumber()
  gymId?: number;

  @ApiPropertyOptional({
    example: [1, 2, 3],
    description: 'Array de IDs de gimnasios asignados al usuario',
  })
  @IsOptional()
  // @IsArray()
  @IsNumber({}, { each: true })
  gymIds?: number[];

  @ApiPropertyOptional({
    example: true,
    description: 'Estado de activación del usuario',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '1234567' })
  @IsOptional()
  @Matches(CI_REGEX, { message: CI_MSG })
  ci?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'nuevo@corpusgym.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Formato de correo electrónico inválido' })
  email?: string;

  @ApiPropertyOptional({ example: 'NuevaClave123!' })
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser texto' })
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  password?: string;

  @ApiPropertyOptional({ example: 'Carlos' })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @MaxLength(60, { message: 'El nombre no puede superar los 60 caracteres' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'López' })
  @IsOptional()
  @IsString({ message: 'El apellido debe ser texto' })
  @MaxLength(60, { message: 'El apellido no puede superar los 60 caracteres' })
  lastName?: string;

  @ApiPropertyOptional({ example: '+59170099999' })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: PHONE_MSG })
  phone?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Activar o desactivar cuenta',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 2,
    description: 'ID del rol asignado al usuario',
  })
  @IsOptional()
  @IsNumber()
  roleId?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'ID de la sucursal asignada',
  })
  @IsOptional()
  @IsNumber()
  gymId?: number;

  @ApiPropertyOptional({
    example: [1, 2],
    description: 'Array de IDs de gimnasios asignados al usuario',
  })
  @IsOptional()
  // @IsArray()
  @IsNumber({}, { each: true })
  gymIds?: number[];

  @ApiPropertyOptional({ example: '1234567' })
  @IsOptional()
  @Matches(CI_REGEX, { message: CI_MSG })
  ci?: string;

  @ApiPropertyOptional({ example: 'MALE', description: 'MALE | FEMALE | OTHER' })
  @IsOptional()
  @IsString()
  gender?: string;
}
