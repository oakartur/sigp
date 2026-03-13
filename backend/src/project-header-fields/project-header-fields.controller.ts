import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ProjectHeaderFieldsService } from './project-header-fields.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('project-header-fields')
export class ProjectHeaderFieldsController {
  constructor(private readonly service: ProjectHeaderFieldsService) {}

  @Roles(Role.ADMIN, Role.QUANTIFIER)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() body: { label: string }) {
    return this.service.create(body);
  }

  @Roles(Role.ADMIN)
  @Put('reorder')
  reorder(@Body() body: { orderedIds: string[] }) {
    return this.service.reorder(body.orderedIds);
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: { label?: string; isActive?: boolean }) {
    return this.service.update(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
