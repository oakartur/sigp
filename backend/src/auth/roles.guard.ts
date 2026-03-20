import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new UnauthorizedException('User not found in context.');

    // O Desenvolvedor pode acessar tudo
    if (user.role === Role.DEVELOPER) {
      return true;
    }

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // O ADMIN pode acessar tudo, a não ser que a rota seja estritamente para DEVELOPER
    if (user.role === Role.ADMIN) {
      if (requiredRoles.length === 1 && requiredRoles[0] === Role.DEVELOPER) {
        return false;
      }
      return true;
    }

    return requiredRoles.includes(user.role);
  }
}
