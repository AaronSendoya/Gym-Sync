import { IsString, IsOptional, IsBoolean, IsArray, IsIn, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExerciseDto {
  @ApiProperty({ example: 'Press de Banca Plano' })
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio o inválido' })
  name!: string;

  @ApiPropertyOptional({ example: 'Ejercicio compuesto principal para pectorales' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La descripción no puede superar los 500 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'La descripción parece contener texto aleatorio o inválido' })
  description?: string;

  @ApiProperty({ example: 'Pectorales' })
  @IsString()
  muscleGroup!: string;

  @ApiPropertyOptional({ example: 'FUERZA', enum: ['FUERZA', 'CARDIO', 'FUNCIONAL'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'STRENGTH', enum: ['STRENGTH', 'CARDIO', 'HIIT', 'FUNCTIONAL', 'MOBILITY'] })
  @IsOptional()
  @IsString()
  exerciseType?: string;

  @ApiPropertyOptional({ example: ['Tríceps', 'Deltoides Anterior'] })
  @IsOptional()
  @IsArray()
  secondaryMuscleGroups?: string[];

  @ApiPropertyOptional({ example: 'Barra olímpica, Banco plano' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'El equipamiento no puede superar los 200 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El equipamiento parece contener texto aleatorio o inválido' })
  equipmentRequired?: string;

  @ApiProperty({ example: 'INTERMEDIO' })
  @IsString()
  difficultyLevel!: string;

  @ApiPropertyOptional({ example: 'dQw4w9WgXcQ' })
  @IsOptional()
  @IsString()
  youtubeVideoId?: string;

  @ApiPropertyOptional({ example: 'https://images.example.com/bench-press.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'WEIGHT_REPS', enum: ['WEIGHT_REPS', 'REPS_ONLY', 'TIME_DISTANCE', 'TIME_ONLY'] })
  @IsOptional()
  @IsIn(['WEIGHT_REPS', 'REPS_ONLY', 'TIME_DISTANCE', 'TIME_ONLY'])
  logType?: 'WEIGHT_REPS' | 'REPS_ONLY' | 'TIME_DISTANCE' | 'TIME_ONLY';

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateExerciseDto {
  @ApiPropertyOptional({ example: 'Press Inclinado con Mancuernas' })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(100, { message: 'El nombre no puede superar los 100 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El nombre parece contener texto aleatorio o inválido' })
  name?: string;

  @ApiPropertyOptional({ example: 'Variación inclinada para pectoral superior' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La descripción no puede superar los 500 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'La descripción parece contener texto aleatorio o inválido' })
  description?: string;

  @ApiPropertyOptional({ example: 'Pectorales' })
  @IsOptional()
  @IsString()
  muscleGroup?: string;

  @ApiPropertyOptional({ example: 'FUERZA' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'STRENGTH' })
  @IsOptional()
  @IsString()
  exerciseType?: string;

  @ApiPropertyOptional({ example: ['Tríceps'] })
  @IsOptional()
  @IsArray()
  secondaryMuscleGroups?: string[];

  @ApiPropertyOptional({ example: 'Barra olímpica, Banco plano' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'El equipamiento no puede superar los 200 caracteres' })
  @Matches(/^(?![\s\S]*[bcdfghjklmnñpqrstvwxyz]{5,})[\s\S]*$/i, { message: 'El equipamiento parece contener texto aleatorio o inválido' })
  equipmentRequired?: string;

  @ApiPropertyOptional({ example: 'AVANZADO' })
  @IsOptional()
  @IsString()
  difficultyLevel?: string;

  @ApiPropertyOptional({ example: 'dQw4w9WgXcQ' })
  @IsOptional()
  @IsString()
  youtubeVideoId?: string;

  @ApiPropertyOptional({ example: 'https://images.example.com/exercise.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'WEIGHT_REPS', enum: ['WEIGHT_REPS', 'REPS_ONLY', 'TIME_DISTANCE', 'TIME_ONLY'] })
  @IsOptional()
  @IsIn(['WEIGHT_REPS', 'REPS_ONLY', 'TIME_DISTANCE', 'TIME_ONLY'])
  logType?: 'WEIGHT_REPS' | 'REPS_ONLY' | 'TIME_DISTANCE' | 'TIME_ONLY';

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
