import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import {
  IsBase64,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { AdminGuard } from '../auth/admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CheckinService } from './checkin.service';
import { FaceService } from './face.service';

const DECIMAL = /^-?\d{1,3}(\.\d{1,10})?$/;

class ChallengeDto {
  @IsUUID()
  deviceId!: string;
}

// Multipart, so every field arrives as text. They stay text: the signature was
// made over these exact strings.
class CheckinDto {
  @IsUUID()
  deviceId!: string;

  @IsUUID()
  challengeId!: string;

  @Matches(/^[A-Za-z0-9_-]{16,64}$/)
  nonce!: string;

  @IsIn(['IN', 'OUT'])
  kind!: string;

  @Matches(DECIMAL)
  lat!: string;

  @Matches(DECIMAL)
  lng!: string;

  @Matches(/^\d{1,5}(\.\d{1,3})?$/)
  accuracyM!: string;

  @IsIn(['0', '1'])
  mock!: string;

  @Matches(/^[0-9a-f]{64}$/)
  photoSha256!: string;

  @IsBase64()
  signature!: string;
}

class ListDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  limit?: number;
}

@Controller()
class CheckinController {
  constructor(
    private readonly checkins: CheckinService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('checkin/challenge')
  challenge(@Body() dto: ChallengeDto) {
    return this.checkins.challenge(dto.deviceId);
  }

  @Post('checkin')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async checkin(@Body() dto: CheckinDto, @UploadedFile() photo?: Express.Multer.File) {
    if (!photo) throw new BadRequestException('photo is required');
    const row = await this.checkins.checkin({ ...dto, photo: photo.buffer });
    return { id: row.id, result: row.result, reason: row.reason, at: row.at };
  }

  @Get('attendance')
  @UseGuards(AdminGuard)
  list(@Query() q: ListDto) {
    return this.prisma.attendance.findMany({
      where: {
        employeeId: q.employeeId,
        at: { gte: q.from ? new Date(q.from) : undefined, lt: q.to ? new Date(q.to) : undefined },
      },
      orderBy: { at: 'desc' },
      take: q.limit ?? 100,
      include: { employee: { select: { code: true, name: true } } },
    });
  }
}

@Module({ controllers: [CheckinController], providers: [CheckinService, FaceService] })
export class CheckinModule {}
