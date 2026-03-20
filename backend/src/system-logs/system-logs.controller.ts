import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SystemLogsService } from './system-logs.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('system-logs')
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Roles(Role.DEVELOPER)
  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.systemLogsService.findAll({ userId, entityType, action, skip, take });
  }
}
