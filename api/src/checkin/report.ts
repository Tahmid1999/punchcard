import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface ReportDay {
  day: string;
  firstIn: Date | null;
  lastOut: Date | null;
  rejected: number;
}

// "Which day" depends on where the office is: 01:30 in Dhaka is still the day
// before in UTC. `at` is stored as UTC without a zone, so it is turned into
// office time first and everything is grouped on that.
export async function monthReport(prisma: PrismaService, month: string, timezone: string) {
  const rows = await prisma.$queryRaw<(ReportDay & { employeeId: string })[]>(Prisma.sql`
    WITH local AS (
      SELECT "employeeId", kind, result, at,
             (at AT TIME ZONE 'UTC') AT TIME ZONE ${timezone} AS here
      FROM "Attendance"
    )
    SELECT "employeeId",
           to_char(here, 'YYYY-MM-DD') AS day,
           min(at) FILTER (WHERE result = 'ACCEPTED' AND kind = 'IN') AS "firstIn",
           max(at) FILTER (WHERE result = 'ACCEPTED' AND kind = 'OUT') AS "lastOut",
           count(*) FILTER (WHERE result = 'REJECTED')::int AS rejected
    FROM local
    WHERE here >= ${month + '-01'}::timestamp
      AND here < ${month + '-01'}::timestamp + interval '1 month'
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);

  const employees = await prisma.employee.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, active: true },
  });
  const [y, m] = month.split('-').map(Number);

  return {
    month,
    timezone,
    daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate(),
    employees: employees
      .map((e) => {
        const days = rows.filter((r) => r.employeeId === e.id).map(({ employeeId: _, ...d }) => d);
        return { ...e, present: days.filter((d) => d.firstIn).length, days };
      })
      // Someone made inactive mid-month still belongs on that month's report.
      .filter((e) => e.active || e.days.length > 0),
  };
}
