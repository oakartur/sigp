import { Controller, Post, Body, Param, Put, UseGuards, Req } from '@nestjs/common';
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
  createInitial(@Param('projectId') projectId: string) {
    return this.requisitionsService.createInitialRequisition(projectId);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post(':id/snapshot')
  createSnapshot(@Param('id') existingId: string) {
    return this.requisitionsService.createSnapshot(existingId);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Put(':id/complete')
  completeRequisition(@Param('id') id: string, @Body() body: { currentLock: number }) {
    return this.requisitionsService.completeRequisition(id, body.currentLock);
  }

  @Roles(Role.QUANTIFIER, Role.ADMIN)
  @Post(':reqId/items')
  addItem(@Param('reqId') reqId: string, @Body() body: any) {
    return this.requisitionsService.addItem(reqId, body);
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
    @Req() req: any
  ) {
    return this.requisitionsService.managerReceiveItem(itemId, req.user.id, body.observation, body.currentLock);
  }
}
