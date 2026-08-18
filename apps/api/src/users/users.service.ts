import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.toPublic(user);
  }

  async findMe(id: string, tenantId: string) {
    return this.findById(id, tenantId);
  }

  async updateProfile(id: string, tenantId: string, data: { name?: string; themeMode?: 'light' | 'dark' | 'system' }) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.themeMode !== undefined ? { themeMode: data.themeMode.toUpperCase() as 'LIGHT' | 'DARK' | 'SYSTEM' } : {}),
      },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
    return this.toPublic(user);
  }

  private toPublic(user: any) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      tenantId: user.tenantId,
      roles: user.roles.map((ur: any) => ur.role.key),
      createdAt: user.createdAt.toISOString(),
      themeMode: String(user.themeMode || 'SYSTEM').toLowerCase(),
    };
  }
}
