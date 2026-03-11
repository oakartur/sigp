import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // Permite o Frontend (porta 8080) acessar o Backend (porta 3000)
  
  // Garantir que a API escute em todas as interfaces do container (0.0.0.0)
  // Caso contrário, ela pode ficar presa apenas no "localhost" interno do Docker.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
