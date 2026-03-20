import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CatalogService } from './catalog.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Roles(Role.ADMIN)
  @Get('tree')
  getTree() {
    return this.catalogService.getTree();
  }

  @Roles(Role.ADMIN)
  @Get('locals')
  findLocals() {
    return this.catalogService.findLocals();
  }

  @Roles(Role.ADMIN)
  @Delete('clear')
  clearCatalog() {
    return this.catalogService.clearCatalog();
  }

  @Roles(Role.ADMIN)
  @Post('locals')
  createLocal(@Body() body: { name: string }) {
    return this.catalogService.createLocal(body);
  }

  @Roles(Role.ADMIN)
  @Put('locals/:id')
  updateLocal(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean }) {
    return this.catalogService.updateLocal(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete('locals/:id')
  removeLocal(@Param('id') id: string) {
    return this.catalogService.removeLocal(id);
  }

  @Roles(Role.ADMIN)
  @Post('operations')
  createOperation(@Body() body: { localId: string; name: string }) {
    return this.catalogService.createOperation(body);
  }

  @Roles(Role.ADMIN)
  @Put('operations/:id')
  updateOperation(@Param('id') id: string, @Body() body: { name?: string; isActive?: boolean }) {
    return this.catalogService.updateOperation(id, body);
  }

  @Roles(Role.ADMIN)
  @Delete('operations/:id')
  removeOperation(@Param('id') id: string) {
    return this.catalogService.removeOperation(id);
  }

  @Roles(Role.ADMIN)
  @Post('equipments')
  createEquipment(
    @Req() req: any,
    @Body()
    body: {
      operationId: string;
      code: string;
      description: string;
      baseQuantity?: number;
      autoConfigFieldId?: string | null;
      autoMultiplier?: number;
      autoFormulaExpression?: string | null;
      cost?: number;
    },
  ) {
    return this.catalogService.createEquipment(req.user.id, body);
  }

  @Roles(Role.ADMIN)
  @Put('equipments/:id')
  updateEquipment(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      code?: string;
      description?: string;
      baseQuantity?: number;
      autoConfigFieldId?: string | null;
      autoMultiplier?: number;
      autoFormulaExpression?: string | null;
      cost?: number;
      isActive?: boolean;
    },
  ) {
    return this.catalogService.updateEquipment(req.user.id, id, body);
  }

  @Roles(Role.ADMIN)
  @Delete('equipments/:id')
  removeEquipment(@Req() req: any, @Param('id') id: string) {
    return this.catalogService.removeEquipment(req.user.id, id);
  }

  @Roles(Role.ADMIN)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importCatalog(@Req() req: any, @UploadedFile() file: any) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Arquivo nao enviado.');
    }
    return this.catalogService.importCatalog(req.user.id, file.originalname || 'catalog.csv', file.buffer);
  }

  @Roles(Role.ADMIN)
  @Post('formula/validate')
  validateFormula(
    @Body()
    body: {
      formula: string;
      context?: Record<string, string | number | boolean | null>;
    },
  ) {
    return this.catalogService.validateAutoFormula(body?.formula || '', body?.context ?? {});
  }
}
