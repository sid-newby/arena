import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, resolvePort } from './app.setup.js';
import { attachListenGateway } from './speech/listen.gateway.js';
import { ListenService } from './speech/listen.service.js';

async function bootstrap() {
  const port = resolvePort();
  const app = configureApp(await NestFactory.create(AppModule));
  app.enableShutdownHooks();
  attachListenGateway(app.getHttpServer(), app.get(ListenService));
  await app.listen(port, '127.0.0.1');
}
await bootstrap();
