import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

export function setupSwagger(app: INestApplication) {
  const configService = app.get(ConfigService);
  const isProduction = configService.get('NODE_ENV') === 'production';

  const config = new DocumentBuilder()
    .setTitle('BrandPilot API')
    .setDescription('Enterprise AI Branding Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth')
    .addTag('Tenants')
    .addTag('Config')
    .addTag('Users')
    .addTag('Health')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  if (!isProduction) {
    SwaggerModule.setup('docs', app, document);
  }
}
