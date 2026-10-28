import 'dotenv/config';

import { PrismaService } from './prisma/prisma.service';
import { hashPassword } from './auth/password';

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set.');

  const prisma = new PrismaService();
  await prisma.admin.upsert({
    where: { email },
    update: { passwordHash: await hashPassword(password) },
    create: { email, passwordHash: await hashPassword(password) },
  });
  await prisma.$disconnect();
  console.log(`admin ${email} ready`);
}

void main();
