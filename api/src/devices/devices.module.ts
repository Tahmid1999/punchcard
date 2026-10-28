import { BadRequestException, Body, Controller, GoneException, Module, Post } from '@nestjs/common';
import { IsBase64, IsOptional, IsString, Length } from 'class-validator';
import { createHash, createPublicKey } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

class PairDto {
  @IsString()
  code!: string;

  @IsBase64()
  publicKey!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  model?: string;
}

// The key has to be the one the check-in signature is verified with, so refuse
// anything that is not P-256 here rather than at the first check-in.
function isP256(spki: string): boolean {
  try {
    const key = createPublicKey({ key: Buffer.from(spki, 'base64'), format: 'der', type: 'spki' });
    return key.asymmetricKeyDetails?.namedCurve === 'prime256v1';
  } catch {
    return false;
  }
}

@Controller('devices')
class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('pair')
  async pair(@Body() dto: PairDto) {
    if (!isP256(dto.publicKey)) throw new BadRequestException('publicKey must be a P-256 SPKI key');

    const now = new Date();
    const codeHash = createHash('sha256').update(dto.code).digest('hex');

    return this.prisma.$transaction(async (tx) => {
      const pairing = await tx.pairingCode.findUnique({ where: { codeHash } });
      // updateMany with usedAt: null is the claim. Two phones scanning the same QR
      // at once both pass the read above, but only one of them gets count 1 here.
      const claimed = await tx.pairingCode.updateMany({
        where: { codeHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (!pairing || claimed.count !== 1) {
        throw new GoneException('pairing code is used, expired or unknown');
      }

      // One phone per employee. Pairing a new one ends the old one.
      await tx.device.updateMany({
        where: { employeeId: pairing.employeeId, revokedAt: null },
        data: { revokedAt: now },
      });
      const device = await tx.device.create({
        data: { employeeId: pairing.employeeId, publicKey: dto.publicKey, model: dto.model },
        include: { employee: { select: { code: true, name: true } } },
      });
      return { deviceId: device.id, employee: device.employee };
    });
  }
}

@Module({ controllers: [DevicesController] })
export class DevicesModule {}
