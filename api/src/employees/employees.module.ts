import {
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';

import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';

const PAIRING_TTL_MS = 10 * 60 * 1000;

class CreateEmployeeDto {
  @Matches(/^[A-Z0-9-]{2,20}$/)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;
}

@Controller('employees')
@UseGuards(AdminGuard)
class EmployeesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.prisma.employee.create({ data: dto });
  }

  @Get()
  list() {
    return this.prisma.employee.findMany({
      orderBy: { code: 'asc' },
      include: {
        devices: { where: { revokedAt: null }, select: { id: true, model: true, pairedAt: true } },
        _count: { select: { faces: true } },
      },
    });
  }

  // The plain code goes into the QR on the admin's screen and nowhere else; only
  // its hash is stored. Ten minutes on a screen in the office means whoever scans
  // it is standing in front of the admin.
  @Post(':id/pairing')
  async pairing(@Param('id', ParseUUIDPipe) id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee?.active) throw new NotFoundException('no active employee with that id');

    const code = randomBytes(16).toString('base64url');
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    await this.prisma.pairingCode.create({
      data: {
        employeeId: id,
        codeHash: createHash('sha256').update(code).digest('hex'),
        expiresAt,
      },
    });
    return { code, expiresAt };
  }
}

@Module({ controllers: [EmployeesController] })
export class EmployeesModule {}
