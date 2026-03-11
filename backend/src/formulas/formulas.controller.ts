import { Controller, Get, Post, Body, Put, Param, UseGuards } from '@nestjs/common';
import { FormulasService } from './formulas.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('formulas')
export class FormulasController {
  constructor(private readonly formulasService: FormulasService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() body: { name: string; expression: string }) {
    return this.formulasService.create(body);
  }

  @Roles(Role.ADMIN, Role.QUANTIFIER, Role.AUDITOR)
  @Get()
  findAll() {
    return this.formulasService.findAll();
  }

  @Roles(Role.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; expression?: string; isActive?: boolean }) {
    return this.formulasService.update(id, body);
  }
}
