import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UnitCostsService } from './unit-costs.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('unit-costs')
export class UnitCostsController {
  constructor(private readonly unitCostsService: UnitCostsService) {}

  @Roles(Role.ADMIN)
  @Get()
  findAll() {
    return this.unitCostsService.findAll();
  }

  @Roles(Role.ADMIN)
  @Post()
  upsert(@Body() body: { code: string; description: string; cost: number }) {
    return this.unitCostsService.upsertCost(body);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.unitCostsService.remove(id);
  }

  @Roles(Role.ADMIN)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(@UploadedFile() file: any) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Arquivo nao enviado.');
    }
    return this.unitCostsService.importCsv(file.buffer);
  }
}
