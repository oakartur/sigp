import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Roles(Role.ADMIN, Role.QUANTIFIER, Role.MANAGER)
  @Post('excel/:requisitionId')
  triggerExcel(@Param('requisitionId') reqId: string) {
    return this.tasksService.generateExcel(reqId);
  }

  @Roles(Role.ADMIN)
  @Post('email')
  triggerEmail(@Body() body: { to: string; subject: string; body: string }) {
    return this.tasksService.dispatchEmail(body.to, body.subject, body.body);
  }
}
