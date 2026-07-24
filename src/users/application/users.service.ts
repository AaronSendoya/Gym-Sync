import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../domain/user.entity';
import { UserProfile } from '../domain/user-profile.entity';
import { UserRole } from '../../roles/domain/user-role.entity';
import { Role } from '../../roles/domain/role.entity';
import { Gym } from '../../gyms/domain/gym.entity';
import { PhysicalMetricsHistory } from '../../metrics/domain/physical-metrics-history.entity';
import type { UpdateProfileDto } from './dtos/users.dto';
import type { RequestUser } from '../../common/security/gym-scope';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profilesRepo: Repository<UserProfile>,
    @InjectRepository(UserRole)
    private readonly userRolesRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(Gym)
    private readonly gymRepo: Repository<Gym>,
    @InjectRepository(PhysicalMetricsHistory)
    private readonly metricsRepo: Repository<PhysicalMetricsHistory>,
  ) {}

  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    dateOfBirth?: string;
    gender?: string;
    ci?: string;
    roleId?: number;
    gymId?: number;
    gymIds?: number[];
    isActive?: boolean;
  }, caller?: RequestUser) {
    const callerLevel = caller?.level ?? 0;
    // Obtener gymId desde la BD — el JWT puede tenerlo obsoleto o ausente
    let callerGymId = 0;
    if (caller && callerLevel >= 4 && callerLevel < 10) {
      const callerRoles = await this.userRolesRepo.find({
        where: { userId: Number(caller.userId) },
        relations: ['role', 'gym'],
      });
      const topRole = callerRoles.sort(
        (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
      )[0];
      callerGymId = Number(topRole?.gym?.id ?? topRole?.gymId ?? 0);
    }

    if (caller && data.roleId !== undefined) {
      const newLevel = await this.resolveNewRoleLevel(data.roleId);
      if (newLevel > callerLevel) {
        throw new ForbiddenException(
          'No puedes asignar un rol superior a tu propio nivel jerárquico.',
        );
      }
    }

    if (caller && callerLevel < 10 && data.gymIds?.length) {
      const allowedGyms = callerLevel >= 5
        ? await this.resolveBrandGymIds(callerGymId)
        : (callerGymId ? [callerGymId] : []);
      for (const gid of data.gymIds) {
        if (!allowedGyms.includes(gid)) {
          throw new ForbiddenException(
            `La sucursal ${gid} no pertenece a tu jurisdicción.`,
          );
        }
      }
    }

    if (caller && callerLevel <= 4 && data.gymIds?.length === 0) {
      data.gymIds = callerGymId ? [callerGymId] : undefined;
    }

    if (data.ci) {
      const existingProfile = await this.profilesRepo.findOne({ where: { ci: data.ci } });
      if (existingProfile) {
        throw new BadRequestException('El Carnet de Identidad (CI) ya está registrado en otra cuenta.');
      }
    }

    const existing = await this.usersRepo.findOne({
      where: { email: data.email },
    });
    if (existing)
      throw new ConflictException('Ya existe un usuario con este email');

    const user = this.usersRepo.create({
      email: data.email,
      passwordHash: await bcrypt.hash(data.password, 10),
      isActive: data.isActive !== undefined ? data.isActive : true,
    });
    const saved = await this.usersRepo.save(user);

    const profile = this.profilesRepo.create({
      userId: saved.id,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      gender: data.gender,
      ci: data.ci,
    });
    await this.profilesRepo.save(profile);

    if (data.roleId) {
      let incomingGymId = data.gymId || (data.gymIds && data.gymIds.length > 0 ? data.gymIds[0] : null);

      if (caller) {
        if (callerLevel === 4) {
          incomingGymId = callerGymId || null;
        } else if (callerLevel === 5) {
          if (!incomingGymId) {
            throw new BadRequestException('Como Gerente, debes seleccionar una Sucursal válida de tu Marca.');
          }
          const targetGym = await this.gymRepo.findOne({ where: { id: incomingGymId } });
          if (!targetGym || (targetGym.id !== callerGymId && targetGym.parentId !== callerGymId)) {
            throw new ForbiddenException('No tienes permisos para asignar usuarios a una sucursal de otra Marca.');
          }
        }
      }

      const roleToAssign = await this.rolesRepo.findOne({ where: { id: data.roleId } });
      if (!roleToAssign) throw new NotFoundException(`Rol ${data.roleId} no encontrado.`);
      
      const hierarchy = roleToAssign.hierarchyLevel ?? 0;
      // Nivel 10 (Super Admin) y Nivel 1 (Cliente) NO requieren gimnasio
      // Niveles intermedios SÍ requieren.
      const isSystemRole = hierarchy === 10 || hierarchy === 1;

      if (!isSystemRole && !incomingGymId) {
        throw new BadRequestException('Este nivel jerárquico requiere obligatoriamente una Marca o Sucursal.');
      }

      const roleAssignments: UserRole[] = [];

      // Si el frontend envía array de sucursales (caso múltiple), se inserta múltiple
      if (data.gymIds && data.gymIds.length > 0) {
        for (const gid of data.gymIds) {
          roleAssignments.push(
            this.userRolesRepo.create({
              userId: saved.id,
              roleId: data.roleId,
              gymId: gid,
            }),
          );
        }
      } else {
        // Inyección singular directa
        roleAssignments.push(
          this.userRolesRepo.create({
            userId: saved.id,
            roleId: data.roleId,
            gymId: isSystemRole ? undefined : (incomingGymId ? incomingGymId : undefined),
          }),
        );
      }

      if (roleAssignments.length > 0) {
        await this.userRolesRepo.save(roleAssignments);
      }
    }

    // Corregido: cambiamos 'newUserId' por 'saved.id'
    return this.findOne(saved.id);
  }

  async findAll(
    filters?: {
      search?: string;
      roleId?: number;
      hierarchyLevel?: number;
      noRole?: boolean;
      gymId?: number;
      status?: string;
      sortBy?: string;
    },
    pagination?: { limit: number; offset: number },
    caller?: RequestUser
  ): Promise<{ data: User[]; meta: { total: number; limit: number; offset: number } }> {
    const limit = pagination?.limit ?? 20;
    const offset = pagination?.offset ?? 0;

    const qb = this.usersRepo
      .createQueryBuilder('user')
      .leftJoin('user.profile', 'profile')
      .leftJoin('user.userRoles', 'userRole')
      .leftJoin('userRole.role', 'role')
      .leftJoin('userRole.gym', 'gym')
      .select([
        'user.id',
        'user.email',
        'user.isActive',
        'user.createdAt',
        'profile.id',
        'profile.userId',
        'profile.firstName',
        'profile.lastName',
        'profile.phone',
        'profile.ci',
        'profile.gender',
        'userRole.id',
        'userRole.userId',
        'userRole.roleId',
        'userRole.gymId',
        'role.id',
        'role.name',
        'role.hierarchyLevel',
        'gym.id',
        'gym.name',
        'gym.parentId',
      ]);

    // ── Filtros territoriales RBAC ─────────────────────────────────────────────
    if (caller) {
      // Consulta BD directamente para evitar valores obsoletos o ausentes del JWT
      const callerRoles = await this.userRolesRepo.find({
        where: { userId: Number(caller.userId) },
        relations: ['role', 'gym'],
      });
      const callerDbRole = callerRoles.sort(
        (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
      )[0];
      const callerLevel = Number(callerDbRole?.role?.hierarchyLevel ?? caller.level ?? 0);
      const callerGymId = Number(callerDbRole?.gym?.id ?? callerDbRole?.gymId ?? 0);

      if (callerLevel >= 10) {
        // Super Admin: sin restricción territorial
      } else if (callerLevel === 5) {
        // Gerente: staff de su marca + CLIENTES cuya membresía (activa o
        // vencida) pertenece a su territorio. Los clientes no tienen gym_id
        // en user_roles (transversales) — su vínculo territorial es la
        // membresía (user_subscriptions.home_gym_id).
        if (!callerGymId) throw new ForbiddenException('Gerente sin marca asignada.');
        qb.andWhere(
          `(
            user.id IN (SELECT ur.user_id FROM user_roles ur LEFT JOIN gyms g ON g.id = ur.gym_id WHERE ur.gym_id = :callerGymId OR g.parent_id = :callerGymId)
            OR user.id IN (
              SELECT us.user_id FROM user_subscriptions us
              LEFT JOIN gyms sg ON sg.id = us.home_gym_id
              WHERE (us.home_gym_id = :callerGymId OR sg.parent_id = :callerGymId)
                AND us.status IN ('ACTIVA', 'ACTIVO', 'VENCIDA')
            )
          )`,
          { callerGymId },
        );
      } else if (callerLevel === 4) {
        // Recepcionista: staff de su sucursal + CLIENTES con membresía
        // (activa o vencida) inscrita en su sucursal.
        if (!callerGymId) throw new ForbiddenException('Recepcionista sin sucursal asignada.');
        qb.andWhere(
          `(
            user.id IN (SELECT ur.user_id FROM user_roles ur WHERE ur.gym_id = :callerGymId)
            OR user.id IN (
              SELECT us.user_id FROM user_subscriptions us
              WHERE us.home_gym_id = :callerGymId
                AND us.status IN ('ACTIVA', 'ACTIVO', 'VENCIDA')
            )
          )`,
          { callerGymId },
        );
      } else {
        qb.andWhere('1 = 0');
      }
    }

    if (filters?.search) {
      qb.andWhere(
        new Brackets(qb2 => {
          qb2.where('user.email ILIKE :search')
            .orWhere('profile.firstName ILIKE :search')
            .orWhere('profile.lastName ILIKE :search')
            .orWhere("CONCAT(profile.first_name, ' ', profile.last_name) ILIKE :search");
        }),
        { search: `%${filters.search}%` },
      );
    }

    if (filters?.noRole) {
      qb.andWhere('userRole.id IS NULL');
    } else {
      if (filters?.roleId != null) {
        qb.andWhere('role.id = :roleId', { roleId: filters.roleId });
      }
      if (filters?.hierarchyLevel != null) {
        qb.andWhere('role.hierarchy_level = :hierarchyLevel', { hierarchyLevel: filters.hierarchyLevel });
      }
    }

    if (filters?.gymId != null && !filters?.noRole) {
      qb.andWhere('userRole.gymId = :gymId', { gymId: filters.gymId });
    }

    if (filters?.status === 'active') {
      qb.andWhere('user.isActive = true');
    } else if (filters?.status === 'inactive') {
      qb.andWhere('user.isActive = false');
    }

    // ── Ordenamiento ──────────────────────────────────────────────────────────
    if (filters?.sortBy === 'za') {
      qb.orderBy('profile.lastName', 'DESC', 'NULLS LAST')
        .addOrderBy('profile.firstName', 'DESC', 'NULLS LAST');
    } else if (filters?.sortBy === 'id_asc') {
      qb.orderBy('user.id', 'ASC');
    } else if (filters?.sortBy === 'id_desc') {
      qb.orderBy('user.id', 'DESC');
    } else {
      qb.orderBy('profile.lastName', 'ASC', 'NULLS LAST')
        .addOrderBy('profile.firstName', 'ASC', 'NULLS LAST');
    }

    // ── Paginación (SIEMPRE al final, después de todos los WHERE) ─────────────
    const [data, total] = await qb.take(limit).skip(offset).getManyAndCount();
    return { data, meta: { total, limit, offset } };
  }

  // Búsqueda de clientes (nivel 1) sin filtro territorial — los clientes son entidades globales
  async searchClientUsers(
    search?: string,
    limit = 20,
    offset = 0,
  ): Promise<{ id: number; email: string; firstName: string; lastName: string; ci: string | null }[]> {
    const qb = this.usersRepo
      .createQueryBuilder('user')
      .leftJoin('user.profile', 'profile')
      .innerJoin('user.userRoles', 'userRole')
      .innerJoin('userRole.role', 'role')
      .select(['user.id', 'user.email', 'profile.firstName', 'profile.lastName', 'profile.ci'])
      .where('role.hierarchy_level = :level', { level: 1 })
      .andWhere('user.isActive = true')
      // Orden estable: sin esto, paginar con offset (limit+desplazamiento)
      // puede repetir o saltar filas entre páginas — Postgres no garantiza
      // el mismo orden en cada ejecución sin un ORDER BY explícito.
      .orderBy('profile.firstName', 'ASC')
      .addOrderBy('user.id', 'ASC');

    if (search?.trim()) {
      qb.andWhere(
        new Brackets(qb2 => {
          qb2
            .where('user.email ILIKE :q')
            .orWhere('profile.firstName ILIKE :q')
            .orWhere('profile.lastName ILIKE :q')
            .orWhere("CONCAT(profile.first_name, ' ', profile.last_name) ILIKE :q");
        }),
        { q: `%${search.trim()}%` },
      );
    }

    const rows = await qb.take(limit).skip(offset).getMany();
    return rows.map(u => ({
      id:        u.id,
      email:     u.email,
      firstName: (u as any).profile?.firstName ?? '',
      lastName:  (u as any).profile?.lastName  ?? '',
      ci:        (u as any).profile?.ci        ?? null,
    }));
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['profile', 'userRoles', 'userRoles.role', 'userRoles.gym', 'userRoles.gym.parent'],
    });
    if (!user)
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    if (user.profile) {
      user.profile.physicalMetrics = await this.metricsRepo.findOne({
        where: { userId: id },
        order: { recordedAt: 'DESC' },
      });
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email },
      relations: ['profile', 'userRoles', 'userRoles.role', 'userRoles.gym', 'userRoles.gym.parent'],
    });
  }

  private async resolveTargetLevel(userId: number): Promise<number> {
    const topRole = await this.userRolesRepo.findOne({
      where: { userId },
      relations: ['role'],
      order: { role: { hierarchyLevel: 'DESC' } },
    });
    return topRole?.role?.hierarchyLevel ?? 0;
  }

  private async resolveNewRoleLevel(roleId: number): Promise<number> {
    const role = await this.rolesRepo.findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException(`Rol ${roleId} no encontrado.`);
    return role.hierarchyLevel ?? 0;
  }

  private async resolveBrandGymIds(callerGymId: number): Promise<number[]> {
    if (!callerGymId) return [];

    const anchor = await this.gymRepo.findOne({
      where: { id: callerGymId },
      select: ['id', 'parentId'],
    });
    if (!anchor) return [];

    // Si callerGymId ya es la Marca (parentId = null), usarlo directamente.
    // Si es una Sucursal, sube al padre para obtener la Marca raíz.
    const brandId = anchor.parentId ?? anchor.id;
    const branches = await this.gymRepo.find({
      where: { parentId: brandId, isActive: true },
      select: ['id'],
    });
    // Incluye la Marca misma (caso: Gerente crea otro Gerente → gymIds = [brandId])
    return [brandId, ...branches.map((b) => b.id)];
  }

  private isStructuralChange(data: {
    roleId?: number;
    gymIds?: number[];
    isActive?: boolean;
  }): boolean {
    return (
      data.roleId !== undefined ||
      data.gymIds !== undefined ||
      data.isActive !== undefined
    );
  }

  async update(
    id: number,
    data: Partial<{
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone: string;
      ci: string;
      gender: string;
      isActive: boolean;
      roleId?: number;
      gymId?: number;
      gymIds?: number[];
    }>,
    caller?: RequestUser,
  ) {
    const callerLevel = caller?.level ?? 0;
    const callerId = caller?.userId ? Number(caller.userId) : 0;
    const isSelfEdit = callerId === id;
    // Obtener gymId desde la BD — el JWT puede tenerlo obsoleto o ausente
    let callerGymId = 0;
    if (caller && callerLevel >= 4 && callerLevel < 10) {
      const callerRoles = await this.userRolesRepo.find({
        where: { userId: callerId },
        relations: ['role', 'gym'],
      });
      const topRole = callerRoles.sort(
        (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
      )[0];
      callerGymId = Number(topRole?.gym?.id ?? topRole?.gymId ?? 0);
    }

    // ── DEFENSA 1: Anti-escalada en auto-edición ──────────────────────────────
    if (isSelfEdit && this.isStructuralChange(data)) {
      throw new ForbiddenException(
        'Operación prohibida: No puedes modificar tu propio nivel, jurisdicción o estado contractual.',
      );
    }

    // ── DEFENSA 2: Validación jerárquica entre terceros ───────────────────────
    if (!isSelfEdit && caller) {
      const targetLevel = await this.resolveTargetLevel(id);

      if (targetLevel > callerLevel) {
        throw new ForbiddenException(
          'No puedes editar a un usuario de nivel superior al tuyo.',
        );
      }

      if (this.isStructuralChange(data)) {
        if (data.roleId !== undefined) {
          const newLevel = await this.resolveNewRoleLevel(data.roleId);
          if (newLevel > callerLevel) {
            throw new ForbiddenException(
              'No puedes asignar un rol superior a tu propio nivel jerárquico.',
            );
          }
        }

        if (callerLevel < 10 && data.gymIds?.length) {
          const brandGyms = callerLevel >= 5
            ? await this.resolveBrandGymIds(callerGymId)
            : (callerGymId ? [callerGymId] : []);
          for (const gid of data.gymIds) {
            if (!brandGyms.includes(gid)) {
              throw new ForbiddenException(
                `La sucursal ${gid} no pertenece a tu marca.`,
              );
            }
          }
        }
      }
    }

    // ── Persistencia ──────────────────────────────────────────────────────────
    if (data.ci) {
      const existingProfile = await this.profilesRepo.findOne({ where: { ci: data.ci } });
      if (existingProfile && existingProfile.userId !== id) {
        throw new BadRequestException('El Carnet de Identidad (CI) ya está registrado en otra cuenta.');
      }
    }

    const user = await this.findOne(id);

    if (data.password) user.passwordHash = await bcrypt.hash(data.password, 10);
    if (data.email) user.email = data.email;
    if (data.isActive !== undefined) user.isActive = data.isActive;
    await this.usersRepo.save(user);

    if (
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.phone !== undefined ||
      data.ci !== undefined ||
      data.gender !== undefined
    ) {
      if (user.profile) {
        if (data.firstName !== undefined)
          user.profile.firstName = data.firstName;
        if (data.lastName !== undefined) user.profile.lastName = data.lastName;
        if (data.phone !== undefined) user.profile.phone = data.phone;
        if (data.ci !== undefined) user.profile.ci = data.ci;
        if (data.gender !== undefined) user.profile.gender = data.gender;
        await this.profilesRepo.save(user.profile);
      } else {
        const newProfile = this.profilesRepo.create({
          userId: id,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          phone: data.phone,
          ci: data.ci,
          gender: data.gender,
        });
        await this.profilesRepo.save(newProfile);
      }
    }

    if (data.roleId !== undefined || data.gymIds !== undefined || data.gymId !== undefined) {
      await this.userRolesRepo.delete({ userId: id });

      if (data.roleId) {
        let incomingGymId = data.gymId || (data.gymIds && data.gymIds.length > 0 ? data.gymIds[0] : null);

        if (caller) {
          if (callerLevel === 4) {
            incomingGymId = callerGymId || null;
          } else if (callerLevel === 5) {
            if (!incomingGymId) {
              throw new BadRequestException('Como Gerente, debes seleccionar una Sucursal válida de tu Marca.');
            }
            const targetGym = await this.gymRepo.findOne({ where: { id: incomingGymId } });
            if (!targetGym || (targetGym.id !== callerGymId && targetGym.parentId !== callerGymId)) {
              throw new ForbiddenException('No tienes permisos para asignar usuarios a una sucursal de otra Marca.');
            }
          }
        }

        const roleToAssign = await this.rolesRepo.findOne({ where: { id: data.roleId } });
        if (!roleToAssign) throw new NotFoundException(`Rol ${data.roleId} no encontrado.`);

        const hierarchy = roleToAssign.hierarchyLevel ?? 0;
        const isSystemRole = hierarchy === 10 || hierarchy === 1;

        if (!isSystemRole && !incomingGymId) {
          throw new BadRequestException('Este nivel jerárquico requiere obligatoriamente una Marca o Sucursal.');
        }

        const roleAssignments: UserRole[] = [];
        if (data.gymIds && data.gymIds.length > 0) {
          for (const gid of data.gymIds) {
            roleAssignments.push(
              this.userRolesRepo.create({
                userId: id,
                roleId: data.roleId,
                gymId: gid,
              }),
            );
          }
        } else {
          roleAssignments.push(
            this.userRolesRepo.create({
              userId: id,
              roleId: data.roleId,
              gymId: isSystemRole ? undefined : (incomingGymId ? incomingGymId : undefined),
            }),
          );
        }

        if (roleAssignments.length > 0) {
          await this.userRolesRepo.save(roleAssignments);
        }
      }
    }

    return this.findOne(id);
  }

  async getManagerPushTokens(gymId: number): Promise<string[]> {
    const managers = await this.usersRepo
      .createQueryBuilder('u')
      .innerJoin('u.userRoles', 'ur', 'ur.gym_id = :gymId', { gymId })
      .innerJoin('ur.role', 'r', 'r.hierarchy_level = 5')
      .where('u.is_active = true')
      .andWhere('u.push_token IS NOT NULL')
      .select(['u.id', 'u.pushToken'])
      .getMany();
    return managers.map((m) => m.pushToken as string);
  }

  async savePushToken(userId: number, token: string): Promise<{ registered: boolean }> {
    await this.usersRepo.update(userId, { pushToken: token });
    return { registered: true };
  }

  async clearPushToken(userId: number): Promise<void> {
    await this.usersRepo.update(userId, { pushToken: null });
  }

  async remove(id: number, caller?: RequestUser): Promise<void> {
    if (caller) {
      const callerId = Number(caller.userId);

      // 1. Auto-eliminación prohibida
      if (callerId === id) {
        throw new ForbiddenException('Medida de seguridad: No puedes eliminar tu propia cuenta.');
      }

      // 2. Extraer nivel y gymId del caller desde la BD (JWT puede ser obsoleto)
      const callerRoles = await this.userRolesRepo.find({
        where: { userId: callerId },
        relations: ['role', 'gym'],
      });
      const topCallerRole = callerRoles.sort(
        (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
      )[0];
      const callerLevel = Number(topCallerRole?.role?.hierarchyLevel ?? caller.level ?? 0);
      const callerGymId = Number(topCallerRole?.gym?.id ?? topCallerRole?.gymId ?? 0);

      if (callerLevel < 4) {
        throw new ForbiddenException('Tu nivel jerárquico no permite eliminar usuarios.');
      }

      // 3. No puede eliminar a alguien de nivel igual o superior
      const targetLevel = await this.resolveTargetLevel(id);
      if (targetLevel >= callerLevel) {
        throw new ForbiddenException('No puedes eliminar a un usuario de nivel igual o superior al tuyo.');
      }

      // 4. Validación territorial para niveles 4 y 5
      if (callerLevel < 10) {
        const targetRoles = await this.userRolesRepo.find({
          where: { userId: id },
          select: ['gymId'],
        });
        const targetGymIds = targetRoles.map(ur => ur.gymId).filter(Boolean) as number[];

        if (callerLevel === 5) {
          const allowed = await this.resolveBrandGymIds(callerGymId);
          const hasAccess = targetGymIds.some(gid => allowed.includes(gid));
          if (!hasAccess) {
            throw new ForbiddenException('No tienes permisos para eliminar usuarios fuera de tu marca.');
          }
        } else if (callerLevel === 4) {
          if (!targetGymIds.includes(callerGymId)) {
            throw new ForbiddenException('No tienes permisos para eliminar usuarios de otra sucursal.');
          }
        }
      }
    }

    // Eliminar relaciones hijas explícitamente antes de borrar el padre.
    // Previene FK violations si la BD no tiene ON DELETE CASCADE configurado.
    await this.userRolesRepo.delete({ userId: id });
    await this.profilesRepo.delete({ userId: id });
    await this.metricsRepo.delete({ userId: id });

    const result = await this.usersRepo.delete(id);
    if (result.affected === 0)
      throw new NotFoundException(`Usuario con ID ${id} no encontrado o ya eliminado.`);
  }

  async updateMyProfile(
    userId: number,
    level: number,
    gymId: number | null | undefined,
    data: UpdateProfileDto,
  ): Promise<{ profile: UserProfile; metrics?: PhysicalMetricsHistory }> {

    const {
      weightKg,
      muscleMassKg,
      chestCm,
      notes,
      birthDate,
      age,
      ...profileData
    } = data;

    const hasMetrics =
      weightKg != null ||
      muscleMassKg != null ||
      chestCm != null ||
      notes != null;

    if (level === 5 && hasMetrics) {
      throw new BadRequestException(
        'Los gerentes no pueden registrar métricas físicas.',
      );
    }

    let profile = await this.profilesRepo.findOne({ where: { userId } });
    if (!profile) {
      const owner = await this.usersRepo.findOne({
        where: { id: userId },
        select: ['id', 'email'],
      });
      if (!owner)
        throw new NotFoundException(
          `Usuario ${userId} no encontrado. Por favor vuelve a iniciar sesión.`,
        );
      profile = await this.profilesRepo.save(
        this.profilesRepo.create({
          userId: owner.id,
          firstName: owner.email.split('@')[0],
          lastName: '',
        }),
      );
    }

    for (const [key, value] of Object.entries(profileData)) {
      if (value !== undefined) (profile as any)[key] = value;
    }
    if (birthDate !== undefined) {
      profile.dateOfBirth = new Date(birthDate);
    } else if (age !== undefined && age > 0) {
      const birthYear = new Date().getFullYear() - age;
      profile.dateOfBirth = new Date(`${birthYear}-01-01`);
    }

    let savedProfile: UserProfile;
    try {
      savedProfile = await this.profilesRepo.save(profile);
    } catch (error: any) {
      if (error?.code === '23505') {
        if (error?.detail?.includes('username')) {
          throw new BadRequestException('El nombre de usuario ya está en uso.');
        }
        if (error?.detail?.includes('ci')) {
          throw new BadRequestException(
            'Ese carnet de identidad ya está registrado.',
          );
        }
        throw new BadRequestException('Uno de los campos únicos ya existe.');
      }
      throw new InternalServerErrorException('Error al guardar el perfil.');
    }

    if (hasMetrics) {
      const entry = this.metricsRepo.create({
        userId,
        gymId: gymId ?? undefined,
        weightKg,
        muscleMassKg,
        chestCm,
        notes,
      });
      const savedMetrics = await this.metricsRepo.save(entry);
      return { profile: savedProfile, metrics: savedMetrics };
    }

    return { profile: savedProfile };
  }

  async saveAvatar(
    userId: number,
    filename: string,
    baseUrl: string,
  ): Promise<string> {
    const avatarUrl = `${baseUrl}/uploads/avatars/${filename}`;
    let profile = await this.profilesRepo.findOne({ where: { userId } });
    if (!profile) {
      const owner = await this.usersRepo.findOne({
        where: { id: userId },
        select: ['id', 'email'],
      });
      if (!owner)
        throw new NotFoundException(
          `Usuario ${userId} no encontrado. Por favor vuelve a iniciar sesión.`,
        );
      profile = await this.profilesRepo.save(
        this.profilesRepo.create({
          userId: owner.id,
          firstName: owner.email.split('@')[0],
          lastName: '',
        }),
      );
    }
    profile.avatarUrl = avatarUrl;
    await this.profilesRepo.save(profile);
    return avatarUrl;
  }

  getMetricsHistory(userId: number) {
    return this.metricsRepo.find({
      where: { userId },
      order: { recordedAt: 'DESC' },
    });
  }

  getLatestMetrics(userId: number) {
    return this.metricsRepo.findOne({
      where: { userId },
      order: { recordedAt: 'DESC' },
    });
  }

  async saveMyMetrics(
    userId: number,
    gymId: number | undefined,
    weightKg: number,
    heightCm: number,
    edad?: number,
  ): Promise<{ success: boolean }> {
    // 1. INSERT peso en historial
    await this.metricsRepo.save(
      this.metricsRepo.create({ userId, gymId, weightKg }),
    );

    // 2. UPDATE perfil: altura y, si viene edad, fecha de nacimiento
    let profile = await this.profilesRepo.findOne({ where: { userId } });
    if (!profile) {
      const owner = await this.usersRepo.findOne({
        where: { id: userId },
        select: ['id', 'email'],
      });
      profile = this.profilesRepo.create({
        userId,
        firstName: owner?.email?.split('@')[0] ?? '',
        lastName: '',
      });
    }
    profile.heightCm = heightCm;
    if (edad !== undefined && edad > 0) {
      const birthYear = new Date().getFullYear() - edad;
      profile.dateOfBirth = new Date(`${birthYear}-01-01`);
    }
    await this.profilesRepo.save(profile);

    return { success: true };
  }

  async saveMyCircumferences(
    userId: number,
    gymId: number | undefined,
    fields: {
      waistCm?:  number;
      hipCm?:    number;
      chestCm?:  number;
      midArmCm?: number;
      thighCm?:  number;
      calfCm?:   number;
    },
  ): Promise<{ success: boolean }> {
    // Actualiza el último registro existente para no fragmentar el historial.
    // Si no hay registros previos, crea uno nuevo.
    let record = await this.metricsRepo.findOne({
      where: { userId },
      order: { recordedAt: 'DESC' },
    });

    if (!record) {
      record = this.metricsRepo.create({ userId, gymId });
    }

    if (fields.waistCm  !== undefined) record.waistCm  = fields.waistCm;
    if (fields.hipCm    !== undefined) record.hipCm    = fields.hipCm;
    if (fields.chestCm  !== undefined) record.chestCm  = fields.chestCm;
    if (fields.midArmCm !== undefined) record.midArmCm = fields.midArmCm;
    if (fields.thighCm  !== undefined) record.thighCm  = fields.thighCm;
    if (fields.calfCm   !== undefined) record.calfCm   = fields.calfCm;

    await this.metricsRepo.save(record);
    return { success: true };
  }

  async getChatProfile(targetUserId: number, callerLevel = 0) {
    const userRole = await this.userRolesRepo.findOne({
      where: { user: { id: targetUserId } },
      relations: ['user', 'user.profile', 'role', 'gym', 'gym.parent'],
      order: { role: { hierarchyLevel: 'DESC' } } as any,
    });

    if (!userRole) throw new NotFoundException('Perfil no encontrado.');

    const level    = Number(userRole.role?.hierarchyLevel ?? 0);
    const isClient = level <= 1;

    return {
      id:         userRole.user.id,
      firstName:  userRole.user.profile?.firstName  ?? '',
      lastName:   userRole.user.profile?.lastName   ?? '',
      gender:     (userRole.user.profile as any)?.gender ?? 'No especificado',
      // Email es PII de contacto: visible solo para staff administrativo (>= 4).
      // Clientes, instructores y entrenadores chatean dentro de la plataforma.
      email:      callerLevel >= 4 ? (userRole.user.email ?? null) : null,
      roleName:   userRole.role?.name ?? '',
      level,
      brandName:  !isClient && userRole.gym?.parent ? userRole.gym.parent.name : null,
      branchName: !isClient && userRole.gym         ? userRole.gym.name        : null,
    };
  }

  toPublicDto(
    user: User,
    roleOverride?: string | null,
    gymIdOverride?: number | null,
  ) {
    const sorted = [...(user.userRoles ?? [])].sort(
      (a, b) => (b.role?.hierarchyLevel ?? 0) - (a.role?.hierarchyLevel ?? 0),
    );
    const top = sorted[0];

    const roleName = roleOverride !== undefined
      ? roleOverride
      : (top?.role?.name?.toUpperCase() ?? null);
    // gymIdOverride viene del JWT: null para Gerentes (su gym_id apunta a una Marca, no Sucursal).
    // Si el JWT envía null explícito, usamos el gymId real de la asignación en BD como fallback
    // para poder resolver brandId/brandName desde las relaciones cargadas.
    const gymId = gymIdOverride !== undefined ? gymIdOverride : (top?.gymId ?? null);
    const resolvedGymId = gymId ?? top?.gymId ?? null;
    const hierarchyLevel = top?.role?.hierarchyLevel ?? 0;

    let brandId: number | null = null;
    let brandName: string | null = null;
    let gymName: string | null = null;

    if (resolvedGymId) {
      const assignment = (user.userRoles ?? []).find(ur => ur.gymId === resolvedGymId);
      const gym = assignment?.gym;
      if (gym) {
        if (gym.parentId === null) {
          // Gym raíz → es una Marca (Gerente nivel 5)
          brandId = gym.id;
          brandName = gym.name;
        } else {
          // Gym hijo → es una Sucursal (Recepcionista nivel 4)
          gymName = gym.name;
          brandName = gym.parent?.name ?? null;
        }
      }
    }

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: roleName,
      gymId,
      brandId,
      brandName,
      gymName,
      level: hierarchyLevel,
      roles: (user.userRoles ?? []).map((ur) => ({
        id: ur.role?.id ?? null,
        name: ur.role?.name?.toUpperCase() ?? null,
        gymId: ur.gymId ?? null,
      })),
      profile: user.profile ?? null,
    };
  }
}
