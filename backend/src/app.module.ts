import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { FormulasModule } from './formulas/formulas.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { RequisitionsModule } from './requisitions/requisitions.module';
import { ProjectHeaderFieldsModule } from './project-header-fields/project-header-fields.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),
    PrismaModule,
    AuthModule,
    FormulasModule,
    ProjectsModule,
    RequisitionsModule,
    TasksModule,
    ProjectHeaderFieldsModule,
  ],
})
export class AppModule {}

