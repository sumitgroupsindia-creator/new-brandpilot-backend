import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 reads CLI configuration from here instead of from the schema.
// The connection URL is no longer allowed in schema.prisma; Migrate reads it
// from here, while the runtime client gets it through the driver adapter.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
