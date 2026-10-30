import { ReportController } from './reports/report.controller.js';
import { ReportService, REPORT_RUNTIME } from './reports/report.service.js';
import { RunController, ProviderController } from './runs/run.controller.js';
import { ChatController } from './chat/chat.controller.js';
import { ChatService } from './chat/chat.service.js';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { SpeechController } from './speech/speech.controller.js';
import { SpeechService } from './speech/speech.service.js';
import { MaestroController } from './maestro/maestro.controller.js';
import { MaestroService, MAESTRO_RUN_TOOLS } from './maestro/maestro.service.js';
import { DebateService } from './debate/debate.service.js';
import { DebateController } from './debate/debate.controller.js';
import { RepositoryBrowserController } from './repository-browser/repository-browser.controller.js';
import { ScaffoldDiscoveryController } from './scaffolds/scaffold-discovery.controller.js';
import { PreflightController } from './preflight/preflight.controller.js';

@Module({
  controllers: [
    ReportController,
    HealthController,
    ChatController,
    SpeechController,
    ScaffoldDiscoveryController,
    RunController,
    ProviderController,
    RepositoryBrowserController,
    PreflightController,
    MaestroController,
    DebateController,
  ],
  providers: [
    ReportService,
    {
      provide: REPORT_RUNTIME,
      useValue: async () => {
        const renderer = '@lilbits/reporting/renderer';
        return import(renderer);
      },
    },
    ChatService,
    SpeechService,
    DebateService,
    {
      provide: MAESTRO_RUN_TOOLS,
      inject: [DebateService],
      useFactory: (debate: DebateService) => debate.maestroTools(),
    },
    MaestroService,
  ],
})
export class AppModule {}
