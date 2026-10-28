import 'dotenv/config';

import { defineConfig } from 'prisma/config';

// Prisma 7 moved the connection URL out of schema.prisma. Migration and
// introspection commands read it from here; the running application gets its
// connection from the driver adapter in PrismaService instead.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
  migrations: {
    seed: 'ts-node src/seed.ts',
  },
});
