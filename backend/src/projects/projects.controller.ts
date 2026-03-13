import { Controller, Get, Post, Body, Param, UseGuards, Delete } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post()
  create(@Body() body: { name: string }) {
    return this.projectsService.create(body);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN, Role.MANAGER, Role.AUDITOR)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
