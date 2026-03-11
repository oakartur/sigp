import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // Permite o Frontend (porta 8080) acessar o Backend (porta 3000)
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
