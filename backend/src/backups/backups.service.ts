import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface BackupInfo {
  filename: string;
  type: 'daily' | 'weekly';
  sizeBytes: number;
  createdAt: string;
}

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly backupsBaseDir = '/backups'; // Conforme mapeado no docker-compose.yml

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  private isDirectoryValid(): boolean {
    return fs.existsSync(this.backupsBaseDir);
  }

  async listBackups(): Promise<BackupInfo[]> {
    const results: BackupInfo[] = [];
    if (!this.isDirectoryValid()) {
      this.logger.warn(`Diretório de backups não encontrado: ${this.backupsBaseDir}`);
      return results;
    }

    const scanDirectory = async (type: 'daily' | 'weekly') => {
      const dirPath = path.join(this.backupsBaseDir, type);
      if (!fs.existsSync(dirPath)) return;

      const files = await fs.promises.readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith('.dump')) continue;

        const filePath = path.join(dirPath, file);
        const stats = await fs.promises.stat(filePath);
        if (stats.isFile()) {
           // Pode haver metadata pareado, mas o stats.mtimeMs/size resolvem o essencial.
           results.push({
             filename: file,
             type,
             sizeBytes: stats.size,
             createdAt: stats.mtime.toISOString()
           });
        }
      }
    };

    await scanDirectory('daily');
    await scanDirectory('weekly');

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async restoreBackup(userId: string, filename: string, type: 'daily' | 'weekly') {
    if (!filename || filename.includes('/') || filename.includes('..') || !filename.endsWith('.dump')) {
      throw new BadRequestException('Nome de arquivo inválido.');
    }
    if (type !== 'daily' && type !== 'weekly') {
      throw new BadRequestException('Tipo de backup inválido.');
    }

    const filePath = path.join(this.backupsBaseDir, type, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Arquivo de backup não encontrado no disco local.');
    }

    this.logger.warn(`⚠️ Usuário ${userId} solicitou RESTORE do banco usando: ${filePath}`);

    try {
      // 1. Desconectar o Prisma para evitar bloqueios ao jogar a base fora
      await this.prisma.$disconnect();

      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) throw new Error('DATABASE_URL não configurada no ambiente.');

      // 2. Matar conexões passivas que outros listeners possam ter aberto
      const killCmd = `psql -d "${dbUrl}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();"`;
      try {
        execSync(killCmd, { stdio: 'ignore' });
        this.logger.log('Conexões ociosas terminadas.');
      } catch (e) {
        this.logger.log('Comando de terminar conexões ignorado (ou não era necessário).');
      }

      // 3. Efetuar a deleção agressiva e restauração
      const command = `pg_restore --clean --if-exists --no-owner --no-privileges -d "${dbUrl}" "${filePath}"`;
      
      this.logger.log('Iniciando pg_restore...');
      execSync(command, { stdio: 'ignore' }); // Evitar expor logs confidenciais via terminal se não em debug
      this.logger.log('pg_restore finalizado com sucesso.');

      // 4. Reconectar a si mesmo
      await this.prisma.$connect();

      // 5. Auditar evento crítico
      await this.systemLogsService.logAction(userId, 'CREATE', 'SETTINGS' as any, 'RESTORE_BACKUP', null, { 
        importedFile: filename, 
        importedType: type 
      });

      return { success: true, message: 'Banco de dados restaurado com sucesso.' };
    } catch (err: any) {
      this.logger.error(`Ocorreu um erro no restore: ${err.message}`, err);
      
      // Tentativa de religar caso falhe o script no meio
      await this.prisma.$connect().catch(() => null);
      
      throw new InternalServerErrorException('Falha ao restaurar banco de dados. Um administrador deve checar os logs da aplicação.');
    }
  }
}
