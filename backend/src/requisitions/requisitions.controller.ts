import { Controller, Post, Body, Param, Put, UseGuards, Req, Get, Delete } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('requisitions')
export class RequisitionsController {
  constructor(private readonly requisitionsService: RequisitionsService) {}

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post('project/:projectId')
  createInitial(@Param('projectId') projectId: string, @Body() body: { version?: string }) {
    return this.requisitionsService.createInitialRequisition(projectId, body?.version);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post(':id/snapshot')
  createSnapshot(@Param('id') existingId: string, @Body() body: { version?: string }) {
    return this.requisitionsService.createSnapshot(existingId, body?.version);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put(':id/version')
  updateVersion(@Param('id') id: string, @Body() body: { version: string }) {
    return this.requisitionsService.updateVersion(id, body.version);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put(':id/complete')
  completeRequisition(@Param('id') id: string, @Body() body: { currentLock: number }) {
    return this.requisitionsService.completeRequisition(id, body.currentLock);
  }

  @Roles(Role.QUANTIFIER, Role.MANAGER, Role.AUDITOR, Role.ADMIN)
  @Get(':reqId/items')
  findItems(@Param('reqId') reqId: string) {
    return this.requisitionsService.findItems(reqId);
  }

  @Roles(Role.QUANTIFIER, Role.MANAGER, Role.AUDITOR, Role.ADMIN)
  @Get(':reqId/project-configs')
  findProjectConfigs(@Param('reqId') reqId: string) {
    return this.requisitionsService.findProjectConfigs(reqId);
  }

  @Roles(Role.QUANTIFIER, Role.MANAGER, Role.AUDITOR, Role.ADMIN)
  @Get(':reqId/computer-areas')
  findComputerAreas(@Param('reqId') reqId: string) {
    return this.requisitionsService.findComputerAreas(reqId);
  }

  @Roles(Role.QUANTIFIER, Role.MANAGER, Role.AUDITOR, Role.ADMIN)
  @Get(':reqId/backoffice-scale-areas')
  findBackofficeScaleAreas(@Param('reqId') reqId: string) {
    return this.requisitionsService.findBackofficeScaleAreas(reqId);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put(':reqId/project-configs')
  upsertProjectConfigs(
    @Param('reqId') reqId: string,
    @Body() body: { configs: Array<{ fieldId: string; value: string }> },
    @Req() req: any,
  ) {
    return this.requisitionsService.upsertProjectConfigs(reqId, body?.configs ?? [], req?.user?.role);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post(':reqId/items')
  addItem(@Param('reqId') reqId: string, @Body() body: any) {
    return this.requisitionsService.addItem(reqId, body);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post(':reqId/items/auto-fill')
  autoFillItems(@Param('reqId') reqId: string) {
    return this.requisitionsService.autoFillItemsFromProjectConfigs(reqId);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put('items/:itemId/quantity')
  updateItemQuantity(
    @Param('itemId') itemId: string,
    @Body() body: { manualQuantity: number | null; currentLock: number },
  ) {
    return this.requisitionsService.updateItemQuantity(itemId, body.manualQuantity, body.currentLock);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put('computer-areas/:rowId/quantity')
  updateComputerAreaQuantity(
    @Param('rowId') rowId: string,
    @Body() body: { quantity: number; currentLock: number },
  ) {
    return this.requisitionsService.updateComputerAreaQuantity(rowId, body.quantity, body.currentLock);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put('backoffice-scale-areas/:rowId/quantity')
  updateBackofficeScaleAreaQuantity(
    @Param('rowId') rowId: string,
    @Body() body: { quantity: number; currentLock: number },
  ) {
    return this.requisitionsService.updateBackofficeScaleAreaQuantity(rowId, body.quantity, body.currentLock);
  }

  @Roles(Role.ADMIN)
  @Put('items/:itemId/override')
  overrideItem(@Param('itemId') itemId: string, @Body() body: { overrideValue: number; currentLock: number }) {
    return this.requisitionsService.adminOverrideItem(itemId, body.overrideValue, body.currentLock);
  }

  @Roles(Role.MANAGER, Role.ADMIN)
  @Put('items/:itemId/receive')
  receiveItem(
    @Param('itemId') itemId: string,
    @Body() body: { observation: string; currentLock: number },
    @Req() req: any,
  ) {
    return this.requisitionsService.managerReceiveItem(itemId, req.user.id, body.observation, body.currentLock);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.requisitionsService.remove(id);
  }
}
