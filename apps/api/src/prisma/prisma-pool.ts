import { PrismaMariaDb } from '@prisma/adapter-mariadb';

/**
 * Pool settings shared by the Nest PrismaService and the standalone CLI
 * scripts (seed, frame repair, overlay normalisation).
 *
 * Configured explicitly rather than through URL query parameters: Prisma 6's
 * `connection_limit`/`pool_timeout` parameters are not read by the mariadb
 * driver and would silently do nothing.
 */
export function poolConfigFromUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    // Small pool: the server drops idle connections after 20s (`wait_timeout`),
    // so a large one only churns, and shared hosting caps threads besides.
    connectionLimit: Number(process.env.DATABASE_CONNECTION_LIMIT ?? 5),
    // Recycle below the server's 20s wait_timeout so the pool never hands out
    // a connection the server has already closed.
    idleTimeout: 10,
    connectTimeout: 10_000,
    acquireTimeout: 20_000,
  };
}

/** Driver adapter for a Prisma 7 client. Prisma 7 has no Rust engine, so this
 *  is now the only thing that opens database connections. */
export function createPrismaAdapter(databaseUrl = process.env.DATABASE_URL as string) {
  return new PrismaMariaDb(poolConfigFromUrl(databaseUrl));
}
