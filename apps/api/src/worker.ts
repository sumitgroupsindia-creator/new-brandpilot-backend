import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrapWorker() {
  process.env.GENERATION_WORKER_ENABLED = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('BrandPilot worker is running');
}

bootstrapWorker();
