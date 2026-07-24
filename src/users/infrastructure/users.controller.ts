import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminLevelGuard } from '../../auth/infrastructure/guards/admin-level.guard';
import { UsersService } from '../application/users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  UpdatePushTokenDto,
  SaveMetricsDto,
  SaveCircumferencesDto,
} from '../application/dtos/users.dto';
import { UserQueryDto } from '../application/dtos/user-query.dto';
import type { RequestWithUser } from '../../common/security/gym-scope';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Crear usuario con perfil completo' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'Usuario creado' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  @ApiResponse({ status: 403, description: 'Nivel jerárquico insuficiente o escalada de privilegios' })
  create(@Req() req: RequestWithUser, @Body() body: CreateUserDto) {
    return this.usersService.create(body, req.user!);
  }

  @Get()
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Listar usuarios paginados. level >= 5: toda la marca. level 4: solo su sede. level >= 10: sin filtro.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Nivel jerárquico insuficiente (>= 4)' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }))
  findAll(
    @Req() req: RequestWithUser,
    @Query() query: UserQueryDto,
  ) {
    const authUser = req.user!;
    const level = authUser.level ?? 0;
    const gymId =
      level >= 10
        ? query.gymId
        : (authUser.gymId != null ? Number(authUser.gymId) : undefined);
    return this.usersService.findAll(
      {
        search: query.search?.trim() || undefined,
        roleId: query.roleId,
        hierarchyLevel: query.hierarchyLevel,
        noRole: query.noRole ?? false,
        gymId: query.gymId, // No forzamos override, el service controla la visibilidad
        status: query.status,
        sortBy: query.sortBy,
      },
      { limit: query.limit ?? 20, offset: query.offset ?? 0 },
      authUser
    );
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Perfil del usuario autenticado (incluye birthDate y última métrica)',
  })
  @ApiResponse({ status: 200 })
  async getMe(@Req() req: RequestWithUser) {
    const userId = Number(req.user!.userId);
    const user = await this.usersService.findOne(userId);
    const dto = this.usersService.toPublicDto(user);
    const birthDate = user.profile?.dateOfBirth ?? null;
    const age = birthDate
      ? Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;
    return {
      ...dto,
      birthDate,
      age,
      profile: dto.profile ? { ...dto.profile, birthDate, age } : null,
    };
  }

  // GET /api/users/chat/clients?search=... — accesible a cualquier usuario autenticado.
  // Sólo devuelve usuarios de nivel 1 (clientes); sin filtro territorial porque los
  // clientes son entidades globales (no tienen gym_id).
  @Get('chat/clients')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Buscar clientes (nivel 1) para iniciar chat o inscribir membresía. Accesible a todos los roles.' })
  @ApiQuery({ name: 'search', required: false, description: 'Nombre o email del cliente' })
  @ApiQuery({ name: 'offset', required: false, description: 'Para "cargar más resultados" (default 0)' })
  searchClients(
    @Query('search') search?: string,
    @Query('offset') offset?: string,
  ) {
    return this.usersService.searchClientUsers(search, 30, offset ? Number(offset) : 0);
  }

  // GET /api/users/:id/chat-profile  →  perfil público para la vista de contacto del chat
  // Definido antes de GET :id para que NestJS no confunda el segmento literal 'chat-profile'
  @Get(':id/chat-profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Perfil público de un usuario para la vista de contacto del chat' })
  @ApiParam({ name: 'id', example: 1 })
  getChatProfile(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.usersService.getChatProfile(id, Number(req.user?.level ?? 0));
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiParam({ name: 'id', example: 1 })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findOne(id);
    return this.usersService.toPublicDto(user);
  }

  @Put(':id')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar datos del usuario' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 403, description: 'Nivel jerárquico insuficiente o escalada de privilegios' })
  update(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
  ) {
    return this.usersService.update(id, body, req.user!);
  }

  @Patch('me/profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Actualizar perfil propio (+ métricas si rol USER/MEMBER)',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200 })
  @ApiResponse({
    status: 400,
    description: 'GERENTE no puede enviar métricas físicas',
  })
  updateMyProfile(@Req() req: RequestWithUser, @Body() body: UpdateProfileDto) {
    const { userId, level, gymId } = req.user!;
    return this.usersService.updateMyProfile(
      Number(userId),
      level ?? 0,
      gymId ?? undefined,
      body,
    );
  }

  @Post('me/metrics')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Guardar métricas: actualiza height_cm en perfil e inserta peso en historial',
  })
  @ApiBody({ type: SaveMetricsDto })
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  saveMyMetrics(@Req() req: RequestWithUser, @Body() body: SaveMetricsDto) {
    const { userId, gymId } = req.user!;
    return this.usersService.saveMyMetrics(
      Number(userId),
      gymId ?? undefined,
      body.weightKg,
      body.heightCm,
      body.edad,
    );
  }

  // PATCH /api/users/me/metrics/circumferences
  // Definido antes de GET me/metrics/latest para evitar ambigüedad de segmentos
  @Patch('me/metrics/circumferences')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guardar circunferencias corporales del usuario autenticado' })
  @ApiBody({ type: SaveCircumferencesDto })
  saveMyCircumferences(@Req() req: RequestWithUser, @Body() body: SaveCircumferencesDto) {
    const { userId, gymId } = req.user!;
    return this.usersService.saveMyCircumferences(Number(userId), gymId ?? undefined, body);
  }

  @Get('me/metrics/latest')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Última métrica física del usuario autenticado' })
  @ApiResponse({ status: 200 })
  getLatestMetrics(@Req() req: RequestWithUser) {
    return this.usersService.getLatestMetrics(Number(req.user!.userId));
  }

  @Get('me/metrics')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Historial completo de métricas físicas del usuario autenticado',
  })
  @ApiResponse({
    status: 200,
    description: 'Array de registros ordenados por fecha DESC',
  })
  getMetricsHistory(@Req() req: RequestWithUser) {
    return this.usersService.getMetricsHistory(Number(req.user!.userId));
  }

  @Patch('me/push-token')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Registrar token push del dispositivo (Expo) para el usuario autenticado. Accesible a todos los roles.',
  })
  @ApiBody({ type: UpdatePushTokenDto })
  @ApiResponse({ status: 200, description: 'Token registrado', schema: { example: { registered: true } } })
  @ApiResponse({ status: 401, description: 'Token JWT inválido' })
  savePushToken(@Req() req: RequestWithUser, @Body() body: UpdatePushTokenDto) {
    return this.usersService.savePushToken(
      Number(req.user!.userId),
      body.token,
    );
  }

  @Delete('me/push-token')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Eliminar token push del dispositivo del usuario autenticado. Accesible a todos los roles.',
  })
  @ApiResponse({ status: 200, description: 'Token eliminado' })
  clearPushToken(@Req() req: RequestWithUser) {
    return this.usersService.clearPushToken(Number(req.user!.userId));
  }

  @Delete(':id')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Eliminar usuario. Nivel >= 4, dentro de su jurisdicción. Nunca a sí mismo.' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiResponse({ status: 403, description: 'Auto-eliminación, nivel insuficiente o fuera de jurisdicción' })
  async remove(@Req() req: RequestWithUser, @Param('id', ParseIntPipe) id: number) {
    await this.usersService.remove(id, req.user!);
    return { message: 'Usuario eliminado' };
  }
}
