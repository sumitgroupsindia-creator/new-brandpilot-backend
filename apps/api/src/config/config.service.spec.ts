import { getAdminSeedConfig } from './config.service';

describe('getAdminSeedConfig', () => {
  it('uses the branded admin defaults expected by the UI', () => {
    expect(getAdminSeedConfig()).toEqual({
      emails: ['admin@brandpilot.app', 'admin@sumitgroups.com'],
      password: 'BrandPilot#Admin2026',
    });
  });

  it('supports environment overrides', () => {
    expect(
      getAdminSeedConfig({
        SEED_SUPER_ADMIN_EMAIL: 'ops@example.com',
        SEED_SUPER_ADMIN_PASSWORD: 'secure-pass',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      emails: ['ops@example.com', 'admin@sumitgroups.com'],
      password: 'secure-pass',
    });
  });
});
