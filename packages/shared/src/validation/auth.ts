import { z } from 'zod';

export const RegisterDtoSchema = z
  .object({
    email: z.string().email().min(5).max(255),
    password: z.string().min(10).max(128),
    name: z.string().min(1).max(255).optional(),
  })
  .strict();

export const LoginDtoSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
    deviceName: z.string().max(255).optional(),
    deviceInfo: z.record(z.unknown()).optional(),
  })
  .strict();

export const RefreshDtoSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;
export type LoginDto = z.infer<typeof LoginDtoSchema>;
export type RefreshDto = z.infer<typeof RefreshDtoSchema>;
