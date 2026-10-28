import { Body, Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsLatitude, IsLongitude, IsString, Length, Max, Min } from 'class-validator';

import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreateOfficeDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  // Under 30 m a phone indoors can't reliably land inside it.
  @IsInt()
  @Min(30)
  @Max(2000)
  radiusM!: number;
}

@Controller('offices')
@UseGuards(AdminGuard)
class OfficesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  create(@Body() dto: CreateOfficeDto) {
    return this.prisma.office.create({ data: dto });
  }

  @Get()
  list() {
    return this.prisma.office.findMany({ orderBy: { name: 'asc' } });
  }
}

@Module({ controllers: [OfficesController] })
export class OfficesModule {}
