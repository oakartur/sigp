import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService } from './catalog.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Roles(Role.QUANTIFIER, Role.MANAGER, Role.AUDITOR, Role.ADMIN)
  @Get('tree')
  getTree() {
    return this.catalogService.getTree();
  }

  @Roles(Role.QUANTIFIER, Role.MANAGER, Role.AUDITOR, Role.ADMIN)
  @Get('locals')
  findLocals() {
    return this.catalogService.findLocals();
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post('locals')
  createLocal(@Body() body: { name: string }) {
    return this.catalogService.createLocal(body);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put('locals/:id')
  updateLocal(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean }) {
    return this.catalogService.updateLocal(id, body);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Delete('locals/:id')
  removeLocal(@Param('id') id: string) {
    return this.catalogService.removeLocal(id);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post('operations')
  createOperation(@Body() body: { localId: string; name: string }) {
    return this.catalogService.createOperation(body);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put('operations/:id')
  updateOperation(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean }) {
    return this.catalogService.updateOperation(id, body);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Delete('operations/:id')
  removeOperation(@Param('id') id: string) {
    return this.catalogService.removeOperation(id);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post('equipments')
  createEquipment(
    @Body()
    body: {
      operationId: string;
      code: string;
      description: string;
      baseQuantity?: number;
      autoConfigFieldId?: string | null;
      autoMultiplier?: number;
    },
  ) {
    return this.catalogService.createEquipment(body);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put('equipments/:id')
  updateEquipment(
    @Param('id') id: string,
    @Body()
    body: {
      code?: string;
      description?: string;
      baseQuantity?: number;
      autoConfigFieldId?: string | null;
      autoMultiplier?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.updateEquipment(id, body);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Delete('equipments/:id')
  removeEquipment(@Param('id') id: string) {
    return this.catalogService.removeEquipment(id);
  }
}
