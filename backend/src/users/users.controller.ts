import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from './users.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(
    @Body()
    body: {
      email: string;
      password: string;
      role?: Role;
    },
  ) {
    return this.usersService.create({
      email: body?.email,
      password: body?.password,
      role: body?.role,
    });
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      email?: string;
      password?: string;
      role?: Role;
    },
    @Req() req: any,
  ) {
    return this.usersService.update(id, body, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.usersService.remove(id, req.user.id);
  }
}

