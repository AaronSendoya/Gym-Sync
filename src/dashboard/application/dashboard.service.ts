import { ForbiddenException, Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { RequestWithUser } from '../../common/security/gym-scope';

export type Period = 'week' | 'month' | 'year';

@Injectable({ scope: Scope.REQUEST })
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(REQUEST) private readonly request: RequestWithUser,
  ) {}

  /**
   * Gyms visibles para el caller. null = sin filtro (Super Admin, level >= 10).
   * Gerente (5): marca + sucursales hijas. Recepcionista (4): su sucursal exacta.
   */
  private async visibleGymIds(): Promise<number[] | null> {
    const u = this.request.user;
    const level = u?.level ?? 0;

    if (level >= 10) return null;

    if (level === 5) {
      if (u?.brandId !== null && u?.brandId !== undefined) {
        const rows = await this.db.query<{ id: number }[]>(
          `SELECT id FROM gyms WHERE id = $1 OR parent_id = $1`,
          [Number(u.brandId)],
        );
        return rows.map((r) => Number(r.id));
      }
      if (u?.gymId !== null && u?.gymId !== undefined) return [Number(u.gymId)];
      throw new ForbiddenException('El gerente no tiene una marca o sucursal asignada.');
    }

    if (level === 4) {
      if (u?.gymId === null || u?.gymId === undefined) {
        throw new ForbiddenException('El usuario no tiene una sucursal asignada.');
      }
      return [Number(u.gymId)];
    }

    throw new ForbiddenException('Nivel insuficiente para acceder al dashboard.');
  }

  /** [dateSelect, whereClause, groupBy] para columnas TIMESTAMP */
  private ts(col: string, period: Period): [string, string, string] {
    if (period === 'year')
      return [
        `TO_CHAR(DATE_TRUNC('month', ${col}), 'YYYY-MM')`,
        `${col} >= DATE_TRUNC('month', NOW()) - INTERVAL '11 months'`,
        `DATE_TRUNC('month', ${col})`,
      ];
    const d = period === 'month' ? 29 : 6;
    return [
      `DATE(${col})::text`,
      `${col} >= CURRENT_DATE - INTERVAL '${d} days'`,
      `DATE(${col})`,
    ];
  }

  /** [dateSelect, whereClause, groupBy] para columnas DATE (ej. reservation_date) */
  private dt(col: string, period: Period): [string, string, string] {
    if (period === 'year')
      return [
        `TO_CHAR(${col}, 'YYYY-MM')`,
        `${col} >= (DATE_TRUNC('month', NOW()) - INTERVAL '11 months')::date`,
        `TO_CHAR(${col}, 'YYYY-MM')`,
      ];
    const d = period === 'month' ? 29 : 6;
    return [`${col}::text`, `${col} >= CURRENT_DATE - INTERVAL '${d} days'`, col];
  }

  private buildHistory(
    rows: { date: string; count: string }[],
    period: Period,
  ): { v: number }[] {
    const map = new Map(rows.map((r) => [r.date, Number(r.count)]));

    if (period === 'year') {
      const now = new Date();
      return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1),
        );
        return { v: map.get(d.toISOString().slice(0, 7)) ?? 0 };
      });
    }

    const n = period === 'month' ? 30 : 7;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - (n - 1 - i));
      return { v: map.get(d.toISOString().slice(0, 10)) ?? 0 };
    });
  }

  async getSummary(period: Period = 'week') {
    const gymIds = await this.visibleGymIds();

    // ── Users ──────────────────────────────────────────────────────────────────
    const [u_s, u_w, u_g] = this.ts('u.created_at', period);
    const [c_s, c_w, c_g] = this.ts('created_at', period);

    const [usersTotal, usersHistory] = await Promise.all([
      gymIds !== null
        ? this.db.query<{ total: string }[]>(
            `SELECT COUNT(DISTINCT u.id) AS total
             FROM users u
             INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.gym_id = ANY($1)
             WHERE u.is_active = true`,
            [gymIds],
          )
        : this.db.query<{ total: string }[]>(
            `SELECT COUNT(*) AS total FROM users WHERE is_active = true`,
          ),

      gymIds !== null
        ? this.db.query<{ date: string; count: string }[]>(
            `SELECT ${u_s} AS date, COUNT(DISTINCT u.id)::text AS count
             FROM users u
             INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.gym_id = ANY($1)
             WHERE ${u_w}
             GROUP BY ${u_g}`,
            [gymIds],
          )
        : this.db.query<{ date: string; count: string }[]>(
            `SELECT ${c_s} AS date, COUNT(*)::text AS count
             FROM users
             WHERE ${c_w}
             GROUP BY ${c_g}`,
          ),
    ]);

    // ── Check-ins ──────────────────────────────────────────────────────────────
    const [ck_s, ck_w, ck_g] = this.ts('check_in_time', period);

    const [checkinsTotal, checkinsHistory] = await Promise.all([
      gymIds !== null
        ? this.db.query<{ total: string }[]>(
            `SELECT COUNT(*) AS total FROM check_ins
             WHERE gym_id = ANY($1) AND DATE(check_in_time) = CURRENT_DATE`,
            [gymIds],
          )
        : this.db.query<{ total: string }[]>(
            `SELECT COUNT(*) AS total FROM check_ins
             WHERE DATE(check_in_time) = CURRENT_DATE`,
          ),

      gymIds !== null
        ? this.db.query<{ date: string; count: string }[]>(
            `SELECT ${ck_s} AS date, COUNT(*)::text AS count
             FROM check_ins
             WHERE gym_id = ANY($1) AND ${ck_w}
             GROUP BY ${ck_g}`,
            [gymIds],
          )
        : this.db.query<{ date: string; count: string }[]>(
            `SELECT ${ck_s} AS date, COUNT(*)::text AS count
             FROM check_ins
             WHERE ${ck_w}
             GROUP BY ${ck_g}`,
          ),
    ]);

    // ── Reservations ───────────────────────────────────────────────────────────
    const [r_s, r_w, r_g] = this.dt('reservation_date', period);

    const [reservationsTotal, reservationsHistory] = await Promise.all([
      gymIds !== null
        ? this.db.query<{ total: string }[]>(
            `SELECT COUNT(*) AS total FROM reservations
             WHERE gym_id = ANY($1) AND reservation_date = CURRENT_DATE`,
            [gymIds],
          )
        : this.db.query<{ total: string }[]>(
            `SELECT COUNT(*) AS total FROM reservations
             WHERE reservation_date = CURRENT_DATE`,
          ),

      gymIds !== null
        ? this.db.query<{ date: string; count: string }[]>(
            `SELECT ${r_s} AS date, COUNT(*)::text AS count
             FROM reservations
             WHERE gym_id = ANY($1) AND ${r_w}
             GROUP BY ${r_g}`,
            [gymIds],
          )
        : this.db.query<{ date: string; count: string }[]>(
            `SELECT ${r_s} AS date, COUNT(*)::text AS count
             FROM reservations
             WHERE ${r_w}
             GROUP BY ${r_g}`,
          ),
    ]);

    return {
      users: {
        total: Number(usersTotal[0]?.total ?? 0),
        history: this.buildHistory(usersHistory, period),
      },
      checkins: {
        total: Number(checkinsTotal[0]?.total ?? 0),
        history: this.buildHistory(checkinsHistory, period),
      },
      reservations: {
        total: Number(reservationsTotal[0]?.total ?? 0),
        history: this.buildHistory(reservationsHistory, period),
      },
    };
  }
}
