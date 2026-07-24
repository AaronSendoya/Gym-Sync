import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  HttpException,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Request,
  Response,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response as ExpressResponse } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../application/auth.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../application/dtos/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { UsersService } from '../../users/application/users.service';

const OTP_PIPE = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: false,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

// Convierte la cadena de expiración del JWT (ej: "24h", "7d", "3600") a milisegundos
// para usarla como maxAge de la cookie.
function jwtExpirationToMs(expiration: string | undefined): number {
  const DEFAULT_MS = 24 * 60 * 60 * 1000; // 24 horas
  if (!expiration) return DEFAULT_MS;
  const num = parseInt(expiration, 10);
  if (isNaN(num)) return DEFAULT_MS;
  if (expiration.endsWith('d')) return num * 86400 * 1000;
  if (expiration.endsWith('h')) return num * 3600 * 1000;
  if (expiration.endsWith('m')) return num * 60 * 1000;
  if (expiration.endsWith('s')) return num * 1000;
  return num * 1000; // asume segundos si no hay sufijo
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly cookieMaxAge: number;

  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {
    this.cookieMaxAge = jwtExpirationToMs(
      this.configService.get<string>('JWT_EXPIRATION'),
    );
  }

  /** warn para 4xx (esperados), error+stack solo para 5xx (inesperados). */
  private logError(context: string, error: any): void {
    if (error instanceof HttpException && error.getStatus() < 500) {
      this.logger.warn(`[${context}] ${error.message}`);
    } else {
      this.logger.error(`[${context}] ${error?.message}`, error?.stack);
    }
  }

  /** Emite la cookie HttpOnly con el token y retorna solo los datos del usuario. */
  private setAuthCookie(res: ExpressResponse, token: string): void {
    res.cookie('access_token', token, {
      httpOnly: true,          // inaccesible desde JS — protege de XSS
      secure: this.configService.get('NODE_ENV') === 'production',
      sameSite: 'lax',         // protege de CSRF; 'strict' rompería flujos OAuth futuros
      // JWT_EXPIRATION + 30 días: la cookie sobrevive a la expiración del JWT
      // para que POST /auth/refresh pueda renovarlo dentro del grace period.
      // Un JWT expirado dentro de la cookie NO autentica requests (401).
      maxAge: this.cookieMaxAge + 30 * 86400 * 1000,
      path: '/',
    });
  }

  /**
   * Gate de plataforma: la cookie HttpOnly es el vehículo de sesión exclusivo
   * de la PLATAFORMA WEB (niveles >= 4: Recepcionista, Gerente, Super Admin).
   * Niveles 1-3 (Clientes, Instructores, Entrenadores) operan por Bearer token
   * en la app móvil — no se les emite cookie, por lo que no pueden hidratar
   * sesión web aunque tengan credenciales válidas.
   */
  private setAuthCookieForLevel(
    res: ExpressResponse,
    token: string,
    level: number,
  ): void {
    if (level >= 4) this.setAuthCookie(res, token);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Obtener perfil completo del usuario autenticado' })
  @ApiResponse({ status: 200, description: 'Perfil del usuario con relaciones' })
  @ApiResponse({ status: 401, description: 'Token inválido o ausente' })
  async getMe(
    @Request()
    req: { user: { userId: number; role: string | null; gymId: number | null; brandId?: number | null } },
  ) {
    try {
      const user = await this.usersService.findOne(req.user.userId);
      return this.usersService.toPublicDto(user, req.user.role, req.user.gymId);
    } catch (error: any) {
      this.logError('getMe', error);
      throw error;
    }
  }

  @Public()
  @Post('register')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  async register(
    @Body() body: RegisterDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    try {
      const result = await this.authService.register(body);
      // register siempre crea Clientes (nivel 1): app móvil vía Bearer, sin cookie web.
      return result;
    } catch (error: any) {
      this.logError('register', error);
      throw error;
    }
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )
  @ApiOperation({ summary: 'Iniciar sesión — emite cookie HttpOnly con JWT' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login exitoso, retorna datos del usuario (sin token en body)' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(
    @Body() body: LoginDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    try {
      const result = await this.authService.login(body);
      this.setAuthCookieForLevel(
        res,
        result.accessToken,
        Number(result.user?.level ?? 0),
      );
      return result;
    } catch (error: any) {
      this.logError('login', error);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión — limpia la cookie HttpOnly' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada correctamente' })
  logout(@Response({ passthrough: true }) res: ExpressResponse) {
    res.clearCookie('access_token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.get('NODE_ENV') === 'production',
      path: '/',
    });
    return { success: true, message: 'Sesión cerrada.' };
  }

  /**
   * Solicita un OTP de 6 dígitos por correo.
   * Siempre devuelve 200 (anti-enumeración de usuarios).
   */
  @Public()
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(OTP_PIPE)
  @ApiOperation({ summary: 'Solicitar código OTP para recuperación de contraseña' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Respuesta genérica (anti-enumeración)' })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    try {
      return await this.authService.forgotPassword(body.email);
    } catch (error: any) {
      this.logError('forgotPassword', error);
      throw error;
    }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar JWT expirado sin re-login (grace period 30 días)' })
  @ApiResponse({ status: 200, description: 'Nuevo accessToken emitido' })
  @ApiResponse({ status: 401, description: 'Token inválido o demasiado antiguo' })
  async refresh(
    @Request() req: any,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    try {
      const authHeader: string | undefined = req.headers['authorization'];
      const cookieToken: string | undefined = req.cookies?.['access_token'];
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : cookieToken;
      if (!token) throw new Error('Token no proporcionado.');
      const result = await this.authService.refreshToken(token);
      this.setAuthCookieForLevel(res, result.accessToken, result.level);
      return { accessToken: result.accessToken };
    } catch (error: any) {
      this.logError('refresh', error);
      throw error;
    }
  }

  /** Verifica el OTP y actualiza la contraseña. */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(OTP_PIPE)
  @ApiOperation({ summary: 'Resetear contraseña con OTP válido' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: '{ success: true, message: "Contraseña actualizada" }' })
  @ApiResponse({ status: 400, description: 'OTP inválido o expirado' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    try {
      return await this.authService.resetPassword(
        body.email,
        body.otpCode,
        body.newPassword,
      );
    } catch (error: any) {
      this.logError('resetPassword', error);
      throw error;
    }
  }
}
