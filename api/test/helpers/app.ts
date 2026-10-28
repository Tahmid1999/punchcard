import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { Embedding, FaceClient, FaceUnavailable } from '../../src/face/face.client';
import { PrismaService } from '../../src/prisma/prisma.service';

// A unit vector whose cosine with REFERENCE is `c`. The suite enrols REFERENCE
// and then picks how close each check-in face is.
export function faceAt(c: number): Buffer {
  const b = Buffer.alloc(512);
  b.writeFloatLE(c, 0);
  b.writeFloatLE(Math.sqrt(1 - c * c), 4);
  return b;
}
export const REFERENCE = faceAt(1);

// Only the HTTP call to the Python service is swapped out. The matching, the
// threshold and the reasons are the real FaceService.
export const face: { next: Embedding; down: boolean } = {
  next: { faces: 1, embedding: REFERENCE },
  down: false,
};

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FaceClient)
    .useValue({
      embed: async (): Promise<Embedding> => {
        if (face.down) throw new FaceUnavailable('stub is down');
        return face.next;
      },
    })
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
