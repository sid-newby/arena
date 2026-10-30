import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ChatService } from '../chat/chat.service.js';
import { ReportPublisher, type ReportRuntime } from './report.publisher.js';
export const REPORT_RUNTIME = Symbol('REPORT_RUNTIME');
@Injectable()
export class ReportService implements OnModuleInit, OnModuleDestroy {
  readonly publisher: ReportPublisher;
  readonly repository;
  constructor(
    @Inject(ChatService) chat: ChatService,
    @Inject(REPORT_RUNTIME) runtime: () => Promise<ReportRuntime>,
  ) {
    this.repository = chat.workflowPersistence().reports;
    this.publisher = new ReportPublisher(
      this.repository,
      resolve(
        process.env.ROOM_CONTROL_HOME ?? join(homedir(), '.local', 'state', 'lilbits'),
        'workbench',
      ),
      runtime,
    );
  }
  async onModuleInit() {
    await this.publisher.recover();
  }
  async onModuleDestroy() {
    await this.publisher.close();
  }
}
