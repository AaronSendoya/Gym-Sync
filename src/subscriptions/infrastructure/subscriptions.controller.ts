import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';

import { SubscriptionsService } from '../application/subscriptions.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CreatePaymentDto,
} from '../application/dtos/subscriptions.dto';
import { AdminLevelGuard } from '../../auth/infrastructure/guards/admin-level.guard';
import type { RequestWithUser } from '../../common/security/gym-scope';

@ApiTags('Subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  // Cada sucursal gestiona SUS planes: Recepcionista los de su sucursal,
  // Gerente los de su marca, Super Admin los globales y todos. El service
  // aplica la autorización territorial fina.
  @Post('plans')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Crear plan de membresía (staff nivel >= 4, territorial)' })
  @ApiBody({ type: CreatePlanDto })
  createPlan(@Body() body: CreatePlanDto) {
    return this.svc.createPlan(body);
  }

  // AdminLevelGuard: el catálogo con precios de la red es información
  // administrativa — clientes y staff operativo no lo listan (el cliente ve
  // su propia membresía vía GET me/active).
  @Get('plans')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Listar planes de membresía del territorio (staff nivel >= 4). Sin "limit": array completo. Con "limit": paginado {data, meta}.',
  })
  findPlans(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAllPlans({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      search,
    });
  }

  @Put('plans/:id')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar plan de membresía (staff nivel >= 4, territorial)' })
  @ApiBody({ type: UpdatePlanDto })
  updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePlanDto,
  ) {
    return this.svc.updatePlan(id, body);
  }

  @Delete('plans/:id')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Eliminar plan de membresía sin inscripciones asociadas (staff nivel >= 4, territorial)' })
  deletePlan(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deletePlan(id);
  }

  // Registrado ANTES de GET :id — si no, NestJS resolvería 'me' como :id.
  @Get('me/active')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Membresía activa del usuario autenticado (con sesiones usadas si aplica)',
  })
  findMyActive(@Req() req: RequestWithUser) {
    return this.svc.findMyActive(Number(req.user!.userId));
  }

  @Post()
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Inscribir membresía a un cliente (staff nivel >= 4)' })
  @ApiBody({ type: CreateSubscriptionDto })
  create(@Body() body: CreateSubscriptionDto) {
    return this.svc.createSubscription(body);
  }

  @Get()
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar suscripciones del territorio del caller (paginado, max 200, filtros de búsqueda/sucursal/fecha/estado)' })
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('gymId') gymId?: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.findAllSubscriptions({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      search,
      gymId: gymId ? Number(gymId) : undefined,
      date,
      status,
    });
  }

  @Get('user/:userId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Suscripciones de un usuario' })
  findByUser(@Param('userId', ParseIntPipe) uid: number) {
    return this.svc.findByUser(uid);
  }

  // Registrado antes de GET :id (mismo motivo que el resto de rutas de
  // segmento literal de este controller). Usado por el buscador de
  // "Inscribir Cliente" para mostrar si cada resultado ya tiene membresía.
  @Get('active-status')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Nombre del plan bloqueante (o null) para una lista de userIds (staff nivel >= 4)' })
  @ApiQuery({ name: 'userIds', required: true, description: 'IDs de usuario separados por coma' })
  findActiveStatus(@Query('userIds') userIds: string) {
    const ids = (userIds ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return this.svc.findActivePlanNamesByUserIds(ids);
  }

  // Ruta de 3 segmentos ('checkin-calendar' literal): no colisiona con :id
  // (1 segmento) sin importar el orden, pero se registra junto a las rutas
  // por-usuario por claridad temática.
  @Get('checkin-calendar/user/:userId')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Calendario mensual de check-ins de la membresía de un cliente (tarjeta tipo carnet)',
  })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM, default mes actual' })
  getCheckinCalendar(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('month') month?: string,
  ) {
    return this.svc.getCheckinCalendar(userId, month);
  }

  // Self-access para el cliente (nivel < 4): la ruta de arriba exige
  // AdminLevelGuard porque la usa el staff para ver el carnet de OTROS
  // clientes; esta es la versión "mi propio carnet" para el carnet de la app
  // móvil — mismo patrón que GET me/active, sin guard de nivel (cualquier
  // autenticado puede consultar su propio calendario).
  @Get('checkin-calendar/me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Calendario mensual de check-ins de la propia membresía (carnet, app móvil)',
  })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM, default mes actual' })
  getMyCheckinCalendar(
    @Req() req: RequestWithUser,
    @Query('month') month?: string,
  ) {
    return this.svc.getCheckinCalendar(Number(req.user!.userId), month);
  }

  // Registrado ANTES de GET :id ('freeze-logs' literal, 1 segmento — colisionaría
  // con :id si fuera después).
  @Get('freeze-logs')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Historial permanente de congelamientos/descongelamientos del territorio (staff nivel >= 4)',
  })
  findFreezeLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findFreezeLogs({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      search,
    });
  }

  @Get(':id')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obtener suscripción' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOneSubscription(id);
  }

  @Put(':id')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Actualizar suscripción (estado, vencimiento)' })
  @ApiBody({ type: UpdateSubscriptionDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSubscriptionDto,
  ) {
    return this.svc.updateSubscription(id, body);
  }

  @Post(':id/payments')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Registrar pago' })
  @ApiBody({ type: CreatePaymentDto })
  createPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreatePaymentDto,
  ) {
    return this.svc.createPayment({ ...body, subscriptionId: id });
  }

  @Get(':id/payments')
  @UseGuards(AdminLevelGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Pagos de suscripción' })
  findPayments(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findPaymentsBySubscription(id);
  }
}
