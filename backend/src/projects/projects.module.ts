import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SystemLogsModule } from '../system-logs/system-logs.module';

@Module({
  imports: [SystemLogsModule],
  providers: [ProjectsService],
  controllers: [ProjectsController]
})
export class ProjectsModule {}
