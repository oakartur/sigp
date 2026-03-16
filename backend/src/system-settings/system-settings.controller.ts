import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SystemSettingsService } from './system-settings.service';

type ExportSelectionBody = {
  includeCatalog?: boolean;
  includeProjectHeaderFields?: boolean;
  includeProjectsAndActiveVersions?: boolean;
};

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @Roles(Role.ADMIN)
  @Post('export')
  exportSettings(@Body() body: ExportSelectionBody) {
    return this.systemSettingsService.exportSettings({
      includeCatalog: Boolean(body?.includeCatalog),
      includeProjectHeaderFields: Boolean(body?.includeProjectHeaderFields),
      includeProjectsAndActiveVersions: Boolean(body?.includeProjectsAndActiveVersions),
    });
  }
}
