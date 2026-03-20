import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BackupsService } from './backups.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Roles(Role.DEVELOPER)
  @Get()
  listBackups() {
    return this.backupsService.listBackups();
  }

  @Roles(Role.DEVELOPER)
  @Post('restore')
  restoreBackup(@Request() req: any, @Body() body: { filename: string; type: 'daily' | 'weekly' }) {
    return this.backupsService.restoreBackup(req.user.id, body.filename, body.type);
  }
}
