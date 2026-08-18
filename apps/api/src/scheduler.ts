import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrapScheduler() {
  process.env.GENERATION_WORKER_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  const interval = setInterval(() => {
    console.log(`[scheduler] heartbeat ${new Date().toISOString()}`);
  }, 5 * 60 * 1000);

  const shutdown = async () => {
    clearInterval(interval);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('BrandPilot scheduler is running');
}

bootstrapScheduler();
