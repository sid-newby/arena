import { Body, Controller, Delete, Get, Inject, Param, Post, Sse } from '@nestjs/common';
import { MaestroService } from './maestro.service.js';
import { ChatService } from '../chat/chat.service.js';
import { map, merge } from 'rxjs';

@Controller('runs/:runId/maestro')
export class MaestroController {
  constructor(
    @Inject(MaestroService) private readonly maestro: MaestroService,
    @Inject(ChatService) private readonly chat: ChatService,
  ) {}
  @Sse('room-events')
  roomEvents(@Param('runId') runId: string) {
    return merge(
      this.chat.events('a', runId).pipe(map(({ data }) => ({ type: 'a', data }))),
      this.chat.events('b', runId).pipe(map(({ data }) => ({ type: 'b', data }))),
      this.maestro.events(runId).pipe(map(({ data }) => ({ type: 'maestro', data }))),
    );
  }
  @Get()
  snapshot(@Param('runId') runId: string) {
    return this.maestro.snapshot(runId);
  }
  @Sse('events')
  events(@Param('runId') runId: string) {
    return this.maestro.events(runId);
  }
  @Post('turns')
  submit(@Param('runId') runId: string, @Body() body: unknown) {
    return this.maestro.submit(runId, body);
  }
  @Post('criteria')
  generateCriteria(@Param('runId') runId: string, @Body() body: unknown) {
    return this.maestro.generateCriteria(runId, body);
  }
  @Get('criteria/:turnId')
  criteriaResult(@Param('runId') runId: string, @Param('turnId') turnId: string) {
    return this.maestro.criteriaResult(runId, turnId);
  }
  @Post('feedback/:turnId/read')
  readFeedback(@Param('runId') runId: string, @Param('turnId') turnId: string) {
    return this.maestro.markFeedback(runId, turnId, 'read');
  }
  @Post('feedback/:turnId/resolve')
  resolveFeedback(@Param('runId') runId: string, @Param('turnId') turnId: string) {
    return this.maestro.markFeedback(runId, turnId, 'resolve');
  }
  @Delete('turns/current')
  stop(@Param('runId') runId: string, @Body() target: unknown) {
    return this.maestro.stop(runId, target);
  }
}
