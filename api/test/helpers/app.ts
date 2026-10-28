import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { FaceResult, FaceService } from '../../src/checkin/face.service';
import { PrismaService } from '../../src/prisma/prisma.service';

// The real face check fails closed until stage 2, so the suite swaps in one it
// can steer. Everything else is the real module graph.
export const face = { next: { ok: true, score: 0.71 } as FaceResult };

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FaceService)
    .useValue({ match: async () => face.next })
    .compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Attendance", "Challenge", "FaceTemplate", "PairingCode", "Device", "Employee", "Office", "Admin" CASCADE',
  );
}
