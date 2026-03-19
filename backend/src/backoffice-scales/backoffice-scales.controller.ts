import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BackofficeScalesService } from './backoffice-scales.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('backoffice-scales')
export class BackofficeScalesController {
  constructor(private readonly backofficeScalesService: BackofficeScalesService) {}

  @Roles(Role.ADMIN)
  @Get('catalog')
  findCatalog() {
    return this.backofficeScalesService.findCatalog();
  }

  @Roles(Role.ADMIN)
  @Post('catalog')
  createArea(@Body() body: { name: string; sortOrder?: number }) {
    return this.backofficeScalesService.createArea(body);
  }

  @Roles(Role.ADMIN)
  @Put('catalog/:id')
  updateArea(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean; sortOrder?: number }) {
    return this.backofficeScalesService.updateArea(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete('catalog/:id')
  removeArea(@Param('id') id: string) {
    return this.backofficeScalesService.removeArea(id);
  }
}
