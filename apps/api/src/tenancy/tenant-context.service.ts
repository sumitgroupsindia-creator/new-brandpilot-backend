import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string | null;
  userId?: string;
  roles?: string[];
  permissions?: string[];
  correlationId?: string;
}

@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, callback: () => T): T {
    return this.als.run(context, callback);
  }

  get(): TenantContext | undefined {
    return this.als.getStore();
  }

  getTenantId(): string | null | undefined {
    return this.get()?.tenantId;
  }

  setTenantId(tenantId: string): void {
    const store = this.get();
    if (store) {
      store.tenantId = tenantId;
    }
  }

	 hasRole(role: string): boolean {
		 return this.get()?.roles?.includes(role) ?? false;
	 }
}
