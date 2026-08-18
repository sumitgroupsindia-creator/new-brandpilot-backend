import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigService as AppConfigService } from './config.service';
import { ConfigController } from './config.controller';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [EncryptionService, AppConfigService],
  controllers: [ConfigController],
  exports: [AppConfigService, EncryptionService],
})
export class ConfigModule {}
