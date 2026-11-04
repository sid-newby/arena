import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Sse,
} from '@nestjs/common';
import { HANGOUT_ID } from '../memory/room-memory.js';
import { ChatService } from '../chat/chat.service.js';

@Controller('runs')
export class RunController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}
  @Get()
  list() {
    const { runs, currentRunId } = this.chat.listRuns();
    return { runs: runs.filter((run) => run.id !== HANGOUT_ID), currentRunId };
  }
  @Post('hangout/memory/search')
  @HttpCode(200)
  searchMemory(@Body() body: unknown) {
    return this.chat.searchHangoutMemory(body);
  }
  @Get('hangout/project')
  project() {
    return this.chat.hangoutProject();
  }
  @Put('hangout/project')
  attachProject(@Body() body: unknown) {
    return this.chat.setHangoutProject(body);
  }
  @Delete('hangout/project')
  detachProject() {
    return this.chat.detachHangoutProject();
  }
  @Get('hangout/presence')
  presence() {
    return this.chat.hangoutPresence();
  }
  @Post('hangout/invite/:seat')
  @HttpCode(200)
  invite(@Param('seat') seat: string) {
    return this.chat.inviteHangout(this.chat.agent(seat));
  }
  @Get('hangout/memory')
  memoryStatus() {
    return this.chat.hangoutMemoryStatus();
  }
  @Get('current')
  current() {
    return this.chat.currentRun();
  }
  @Get('hangout')
  hangout() {
    return this.chat.hangout();
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
  @Post(':runId/agents/:id/messages')
  @HttpCode(202)
  message(@Param('runId') runId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.submitMessage(this.chat.agent(id), body, runId);
  }
  @Delete(':runId/agents/:id/messages/:messageId')
  cancelMessage(
    @Param('runId') runId: string,
    @Param('id') id: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chat.cancelMessage(this.chat.agent(id), runId, messageId);
  }
  @Get(':runId/agents/:id/side-conversation')
  side(@Param('runId') runId: string, @Param('id') id: string) {
    return this.chat.sideSnapshot(runId, this.chat.agent(id));
  }
  @Post(':runId/agents/:id/side-conversation')
  @HttpCode(202)
  submitSide(@Param('runId') runId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.chat.submitSide(runId, this.chat.agent(id), body);
  }
  @Delete(':runId/agents/:id/side-conversation/turns/current')
  stopSide(@Param('runId') runId: string, @Param('id') id: string) {
    return this.chat.stopSide(runId, this.chat.agent(id));
  }
  @Sse(':runId/agents/:id/side-conversation/events')
  sideEvents(@Param('runId') runId: string, @Param('id') id: string) {
    return this.chat.sideEvents(runId, this.chat.agent(id));
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
