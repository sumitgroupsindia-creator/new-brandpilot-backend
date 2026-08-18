import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TenantContextService } from './tenant-context.service';
import { TenantContextMiddleware } from './tenancy.middleware';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [TenantContextService, TenantContextMiddleware],
  exports: [TenantContextService],
})
export class TenancyModule {}
