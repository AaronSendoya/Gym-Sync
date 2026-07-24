import * as nodemailer from 'nodemailer';
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/application/users.service';
import { User } from '../../users/domain/user.entity';
import { UserRole } from '../../roles/domain/user-role.entity';
import { Gym } from '../../gyms/domain/gym.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly mailer: nodemailer.Transporter;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Gym)
    private readonly gymRepo: Repository<Gym>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    this.mailer = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST') ?? 'smtp.gmail.com',
      port: this.configService.get<number>('SMTP_PORT') ?? 587,
      secure: false, // STARTTLS en puerto 587 (no SSL)
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  private extractGymName(
    userRoles: UserRole[] | undefined | null,
    gymId: number | null,
  ): string | null {
    if (!gymId || !userRoles?.length) return null;
    const match = userRoles.find((ur) => ur.gymId === gymId && ur.gym);
    if (match) return match.gym.name;
    const anyGym = userRoles.find((ur) => ur.gym)?.gym;
    return anyGym?.name ?? null;
  }

  private async buildJwtPayload(user: { id: number; email: string }) {
    const userRoles = await this.userRolesRepo.find({
      where: { userId: user.id },
      relations: ['role', 'gym'],
      order: { id: 'ASC' },
    });

    if (userRoles.length === 0) {
      this.logger.warn('JWT generado sin roles asignados');
      return { sub: user.id, email: user.email, role: null, gymId: null, level: 0, roleId: null };
    }

    // Ordena por hierarchy_level descendente — mayor nivel = mayor privilegio
    const sorted = [...userRoles].sort((a, b) =>
      (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0)
    );

    const topAssignment = sorted[0];
    const topLevel = topAssignment.role?.hierarchyLevel ?? 0;

    const topRoleId: number | null = topAssignment.role?.id ?? topAssignment.roleId ?? null;

    // ── Super Admin (level >= 10) — sin sede ──────────────────────────────────
    if (topLevel >= 10) {
      return {
        sub: user.id,
        email: user.email,
        role: topAssignment.role?.name ?? null,
        gymId: null,
        level: topLevel,
        roleId: topRoleId,
      };
    }

    // ── Gerente de Marca (level === 5) — brandId si Marca, gymId si Sucursal ──
    if (topLevel === 5) {
      const gerenteRoles = userRoles.filter(a => a.role?.hierarchyLevel === 5);
      const gerenteRole =
        gerenteRoles.find((a) => a.gymId !== null && a.gymId !== undefined) ??
        gerenteRoles[0];

      const resolvedGymId: number | null = gerenteRole.gymId ?? null;

      if (resolvedGymId !== null) {
        const assignedGym =
          gerenteRole.gym ??
          (await this.gymRepo.findOne({ where: { id: resolvedGymId } }));

        if (assignedGym && assignedGym.parentId === null) {
          return {
            sub: user.id,
            email: user.email,
            role: topAssignment.role?.name ?? null,
            gymId: null,
            brandId: resolvedGymId,
            level: topLevel,
            roleId: topRoleId,
          };
        }
      }

      return {
        sub: user.id,
        email: user.email,
        role: topAssignment.role?.name ?? null,
        gymId: resolvedGymId,
        brandId: null,
        level: topLevel,
        roleId: topRoleId,
      };
    }

    // ── Fallback: RECEPCIONISTA, ENTRENADOR, INSTRUCTOR, USER, etc. ───────────
    return {
      sub: user.id,
      email: user.email,
      role: topAssignment.role?.name ?? null,
      gymId: topAssignment.gymId ?? null,
      level: topLevel,
      roleId: topRoleId,
    };
  }

  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    ci?: string;
    gender?: string;
  }) {
    const existing = await this.usersService.findByEmail(data.email);
    if (existing)
      throw new ConflictException(
        `El usuario ${data.email} ya se encuentra registrado. Por favor inicie sesión.`,
      );

    const rolesResult = await this.userRolesRepo.manager.query(
      'SELECT id FROM roles WHERE hierarchy_level = 1 ORDER BY id ASC LIMIT 1',
    );
    if (!rolesResult?.length) {
      throw new InternalServerErrorException(
        'Error crítico: El rol base (Nivel 1) no existe en el sistema.',
      );
    }
    const roleId = rolesResult[0].id;

    const user = await this.usersService.create({
      ...data,
      roleId: roleId,
      phone: data.phone,
      ci: data.ci,
    });

    const payload = await this.buildJwtPayload({
      id: user.id,
      email: user.email,
    });
    const gymName = this.extractGymName(user.userRoles, payload.gymId);
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: payload.role,
        gymId: payload.gymId,
        gymName,
        firstName: user.profile?.firstName ?? null,
        lastName: user.profile?.lastName ?? null,
        profile: user.profile,
      },
    };
  }

  async login(data: { email: string; password: string }) {
    const user = await this.usersService.findByEmail(data.email);
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');
    if (!user.isActive) throw new UnauthorizedException('Cuenta desactivada');

    const payload = await this.buildJwtPayload({
      id: user.id,
      email: user.email,
    });
    let gymName: string | null = null;
    let brandName: string | null = null;
    let brandId: number | null = (payload as any).brandId ?? null;

    // Query DB directly — avoids stale gym relation on user.userRoles
    const gymIdToLookup = brandId ?? payload.gymId;
    if (gymIdToLookup) {
      const resolvedGym = await this.gymRepo.findOne({
        where: { id: gymIdToLookup },
        relations: ['parent'],
      });
      if (resolvedGym) {
        if (resolvedGym.parentId === null) {
          brandName = resolvedGym.name;
          brandId = resolvedGym.id;
        } else {
          gymName = resolvedGym.name;
          brandName = resolvedGym.parent?.name ?? null;
        }
      }
    }

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: payload.role,
        level: payload.level ?? 0,
        gymId: payload.gymId,
        brandId,
        brandName,
        gymName,
        firstName: user.profile?.firstName ?? null,
        lastName: user.profile?.lastName ?? null,
        profile: user.profile,
      },
    };
  }

  verifyToken(
    token: string,
  ): { sub: number; role: string | null; gymId: number | null; brandId?: number | null; level: number } | null {
    try {
      return this.jwtService.verify<{
        sub: number;
        role: string | null;
        gymId: number | null;
        brandId?: number | null;
        level: number;
      }>(token);
    } catch {
      return null;
    }
  }

  async validateUser(userId: number) {
    return this.usersService.findOne(userId);
  }

  async refreshToken(
    expiredToken: string,
  ): Promise<{ accessToken: string; level: number }> {
    let payload: { sub: number; exp?: number } | null = null;
    try {
      payload = this.jwtService.verify<{ sub: number; exp?: number }>(
        expiredToken,
        { ignoreExpiration: true } as any,
      );
    } catch {
      throw new UnauthorizedException('Token inválido.');
    }

    if (!payload?.sub) throw new UnauthorizedException('Token inválido.');

    if (payload.exp) {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() > payload.exp * 1000 + THIRTY_DAYS_MS) {
        throw new UnauthorizedException(
          'El token es demasiado antiguo para renovar. Inicia sesión nuevamente.',
        );
      }
    }

    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Cuenta no encontrada o desactivada.');
    }

    const newPayload = await this.buildJwtPayload({ id: user.id, email: user.email });
    return {
      accessToken: this.jwtService.sign(newPayload),
      level: Number(newPayload.level ?? 0),
    };
  }

  /**
   * Genera un OTP de 6 dígitos, lo guarda en la BD con expiración de 15 min
   * y lo imprime en consola (mock de correo).
   * Siempre devuelve 200 para evitar enumeración de usuarios.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

    if (user) {
      const { randomInt } = await import('crypto');
      const otpCode = String(randomInt(100000, 999999));
      const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // +15 min

      await this.userRepo.update(user.id, { otpCode, otpExpiresAt });

      try {
        await this.mailer.verify();
        await this.mailer.sendMail({
          from: this.configService.get<string>('SMTP_USER'),
          to: email,
          subject: 'Código de Verificación - Corpus Gym',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px;">
              <h2 style="color: #ff5500; text-align: center; margin-bottom: 20px;">Corpus Gym</h2>
              <p style="color: #333; font-size: 16px;">Has solicitado restablecer tu contraseña.</p>
              <p style="color: #333; font-size: 16px;">Usa el siguiente código de verificación de 6 dígitos:</p>
              <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; text-align: center; margin: 24px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111;">${otpCode}</span>
              </div>
              <p style="font-size: 12px; color: #666; text-align: center;">Este código expira en 15 minutos. No lo compartas con nadie.</p>
            </div>
          `,
        });
        this.logger.log(`[OTP] Correo enviado a ${email} vía Nodemailer`);
      } catch (error: any) {
        this.logger.error(
          `[SMTP] Error al enviar OTP a ${email}: ${error?.message ?? error} | code=${error?.code ?? 'n/a'} | responseCode=${error?.responseCode ?? 'n/a'}`,
          error?.stack,
        );
        throw new InternalServerErrorException(
          'Fallo interno del servidor SMTP.',
        );
      }
    }

    // Respuesta idéntica exista o no el usuario (anti-enumeración)
    return { message: 'Si el correo existe recibirás un código OTP.' };
  }

  /**
   * Verifica el OTP, valida expiración y actualiza la contraseña.
   * Limpia otpCode y otpExpiresAt tras el reset exitoso.
   */
  async resetPassword(
    email: string,
    otpCode: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepo.findOne({ where: { email } });

    const { timingSafeEqual } = await import('crypto');
    const otpMatch = user?.otpCode
      ? timingSafeEqual(Buffer.from(user.otpCode), Buffer.from(otpCode.padEnd(6, '0').substring(0, 6)))
      : false;
    if (!user || !otpMatch) {
      throw new BadRequestException('Código OTP inválido.');
    }

    if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      throw new BadRequestException(
        'El código OTP ha expirado. Solicita uno nuevo.',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.userRepo.update(user.id, {
      passwordHash,
      otpCode: null,
      otpExpiresAt: null,
    });

    return { success: true, message: 'Contraseña actualizada correctamente.' };
  }
}
