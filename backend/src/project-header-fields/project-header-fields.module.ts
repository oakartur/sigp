import { Module } from '@nestjs/common';
import { ProjectHeaderFieldsService } from './project-header-fields.service';
import { ProjectHeaderFieldsController } from './project-header-fields.controller';

@Module({
  providers: [ProjectHeaderFieldsService],
  controllers: [ProjectHeaderFieldsController],
  exports: [ProjectHeaderFieldsService],
})
export class ProjectHeaderFieldsModule {}
