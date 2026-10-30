import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ChatService } from '../chat/chat.service.js';

@Controller('runs')
export class RunController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}
  @Get()
  list() {
    return this.chat.listRuns();
  }
  @Get('current')
  current() {
    return this.chat.currentRun();
  }
  @Post()
  create() {
    return this.chat.createRun();
  }
  @Get(':runId')
  run(@Param('runId') runId: string) {
    return this.chat.run(runId);
  }
  @Post(':runId/select')
  select(@Param('runId') runId: string) {
    return this.chat.selectRun(runId);
  }
  @Post(':runId/clone')
  clone(@Param('runId') runId: string, @Body() body: unknown) {
    return this.chat.cloneRun(runId, body);
  }
  @Post(':runId/configurations')
  configure(@Param('runId') runId: string, @Body() body: unknown) {
    return this.chat.configureRun(runId, body);
  }
  @Get(':runId/state')
  state(@Param('runId') runId: string, @Query('after') after = '0', @Query('limit') limit = '100') {
    return this.chat.workflowPersistence().state.get(runId, Number(after), Number(limit));
  }
  @Get(':runId/state/outcomes')
  outcomes(@Param('runId') runId: string) {
    return this.chat.workflowPersistence().state.outcomes(runId);
  }
  @Post(':runId/state/outcomes/:proposalRevision/confirm')
  confirm(
    @Param('runId') runId: string,
    @Param('proposalRevision') proposalRevision: string,
    @Body() body: unknown,
  ) {
    return this.chat.workflowPersistence().state.confirm(runId, Number(proposalRevision), body);
  }
  @Get(':runId/correspondence')
  correspondence(
    @Param('runId') runId: string,
    @Query('after') after = '0',
    @Query('limit') limit = '100',
  ) {
    return this.chat.correspondence(runId, Number(after), Number(limit));
  }
  @Sse(':runId/events')
  events(
    @Param('runId') runId: string,
    @Query('after') after?: string,
    @Headers('last-event-id') lastEventId?: string,
  ) {
    return this.chat.correspondenceEvents(runId, Number(after ?? lastEventId ?? '0'));
  }
  @Get(':runId/agents')
  agents(@Param('runId') runId: string) {
    return this.chat.list(runId);
  }
  @Get(':runId/agents/:id')
  snapshot(@Param('runId') runId: string, @Param('id') id: string) {
    return this.chat.snapshot(this.chat.agent(id), runId);
  }
  @Post(':runId/agents/:id/turns')
  submit(@Param('runId') runId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.submit(this.chat.agent(id), body, runId);
  }
  @Delete(':runId/agents/:id/turns/current')
  stop(@Param('runId') runId: string, @Param('id') id: string) {
    return this.chat.stop(this.chat.agent(id), runId);
  }
  @Sse(':runId/agents/:id/events')
  seatEvents(@Param('runId') runId: string, @Param('id') id: string) {
    return this.chat.events(this.chat.agent(id), runId);
  }
  @Post(':runId/stop')
  stopRun(@Param('runId') runId: string) {
    return this.chat.stopConversation(runId);
  }
}

@Controller('providers')
export class ProviderController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}
  @Get(':provider/models')
  models(@Param('provider') provider: string) {
    return this.chat.providerCatalog(provider);
  }
}
