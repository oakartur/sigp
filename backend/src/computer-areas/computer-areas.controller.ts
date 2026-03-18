import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ComputerAreasService } from './computer-areas.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('computer-areas')
export class ComputerAreasController {
  constructor(private readonly computerAreasService: ComputerAreasService) {}

  @Roles(Role.ADMIN)
  @Get('catalog')
  findCatalog() {
    return this.computerAreasService.findCatalog();
  }

  @Roles(Role.ADMIN)
  @Post('catalog')
  createArea(@Body() body: { name: string; sortOrder?: number }) {
    return this.computerAreasService.createArea(body);
  }

  @Roles(Role.ADMIN)
  @Put('catalog/:id')
  updateArea(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean; sortOrder?: number }) {
    return this.computerAreasService.updateArea(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete('catalog/:id')
  removeArea(@Param('id') id: string) {
    return this.computerAreasService.removeArea(id);
  }
}
