import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

type CreateUserInput = {
  email: string;
  password: string;
  role?: Role;
};

type UpdateUserInput = {
  email?: string;
  password?: string;
  role?: Role;
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private normalizeEmail(email: string): string {
    return String(email || '').trim().toLowerCase();
  }

  private validateEmail(email: string) {
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Email invalido.');
    }
  }

  private validatePassword(password: string) {
    if (!password || password.length < 6) {
      throw new BadRequestException('Senha deve ter no minimo 6 caracteres.');
    }
  }

  private parseRole(input?: string | Role): Role {
    const role = String(input || Role.QUANTIFIER).trim().toUpperCase();
    const roles = new Set(Object.values(Role));
    if (!roles.has(role as Role)) {
      throw new BadRequestException('Permissao invalida.');
    }
    return role as Role;
  }

  private async ensureAdminSafety(params: {
    targetUserId: string;
    targetCurrentRole: Role;
    nextRole?: Role;
    actorUserId: string;
  }) {
    const { targetUserId, targetCurrentRole, nextRole, actorUserId } = params;

    if (targetUserId === actorUserId && nextRole && nextRole !== Role.ADMIN) {
      throw new ForbiddenException('ADMIN nao pode remover a propria permissao de administrador.');
    }

    const adminIsBeingDemoted = targetCurrentRole === Role.ADMIN && nextRole && nextRole !== Role.ADMIN;
    if (!adminIsBeingDemoted) return;

    const adminsCount = await this.prisma.user.count({ where: { role: Role.ADMIN } });
    if (adminsCount <= 1) {
      throw new ForbiddenException('O sistema precisa manter ao menos um usuario ADMIN.');
    }
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
    });
  }

  async create(data: CreateUserInput) {
    const email = this.normalizeEmail(data.email);
    const role = this.parseRole(data.role);
    const password = String(data.password || '');

    this.validateEmail(email);
    this.validatePassword(password);

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Email ja cadastrado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      return await this.prisma.user.create({
        data: {
          email,
          role,
          passwordHash,
        },
        select: { id: true, email: true, role: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Email ja cadastrado.');
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateUserInput, actorUserId: string) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });
    if (!current) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    const payload: { email?: string; role?: Role; passwordHash?: string } = {};

    if (typeof data.email === 'string') {
      const email = this.normalizeEmail(data.email);
      this.validateEmail(email);

      const duplicated = await this.prisma.user.findFirst({
        where: {
          id: { not: id },
          email: { equals: email, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (duplicated) {
        throw new BadRequestException('Email ja cadastrado.');
      }

      payload.email = email;
    }

    let nextRole: Role | undefined;
    if (data.role !== undefined) {
      nextRole = this.parseRole(data.role);
      payload.role = nextRole;
    }

    if (typeof data.password === 'string' && data.password.trim()) {
      this.validatePassword(data.password);
      payload.passwordHash = await bcrypt.hash(data.password, 10);
    }

    await this.ensureAdminSafety({
      targetUserId: current.id,
      targetCurrentRole: current.role,
      nextRole,
      actorUserId,
    });

    if (Object.keys(payload).length === 0) {
      return this.prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, role: true },
      });
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: payload,
        select: { id: true, email: true, role: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Email ja cadastrado.');
      }
      throw error;
    }
  }

  async remove(id: string, actorUserId: string) {
    if (id === actorUserId) {
      throw new ForbiddenException('ADMIN nao pode excluir o proprio usuario.');
    }

    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!current) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    if (current.role === Role.ADMIN) {
      const adminsCount = await this.prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminsCount <= 1) {
        throw new ForbiddenException('O sistema precisa manter ao menos um usuario ADMIN.');
      }
    }

    await this.prisma.user.delete({ where: { id } });

    return {
      deletedUserId: id,
    };
  }
}

