import { Body, Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DebateService } from './debate.service.js';
import { MaestroService } from '../maestro/maestro.service.js';
import { BadRequestException } from '@nestjs/common';
import { object } from './workflow.store.js';
@Controller('runs/:runId')
export class DebateController {
  constructor(
    @Inject(DebateService) private readonly debate: DebateService,
    @Inject(MaestroService) private readonly maestro: MaestroService,
  ) {
    this.debate.setFeedbackSender((runId, event) => this.maestro.feedbackEvent(runId, event));
  }
  @Get('workflow') workflow(@Param('runId') id: string) {
    return this.debate.snapshot(id);
  }
  @Get('feedback-delivery') feedbackDelivery(@Param('runId') id: string) {
    return this.debate.feedbackDelivery(id);
  }
  @Post('feedback-delivery/retry') retryFeedbackDelivery(@Param('runId') id: string) {
    return this.debate.retryFeedbackDelivery(id);
  }
  @Get('retained-workspaces') retainedWorkspaces(@Param('runId') id: string) {
    return this.debate.retainedWorkspaces(id);
  }
  @Post('retained-workspaces/:seat/keep') keepWorkspace(
    @Param('runId') id: string,
    @Param('seat') seat: string,
  ) {
    return this.debate.keepWorkspaceForNow(id, seat);
  }
  @Get('retained-workspaces/:seat/result') result(
    @Param('runId') id: string,
    @Param('seat') seat: string,
  ) {
    return this.debate.preservedResult(id, seat);
  }
  @Post('retained-workspaces/:seat/preserve') preserve(
    @Param('runId') id: string,
    @Param('seat') seat: string,
  ) {
    return this.debate.preserveResult(id, seat);
  }
  @Post('retained-workspaces/:seat/cleanup') cleanup(
    @Param('runId') id: string,
    @Param('seat') seat: string,
    @Body() body: unknown,
  ) {
    return this.debate.cleanupResult(id, seat, body);
  }
  @Post('retained-workspaces/:seat/publish') publish(
    @Param('runId') id: string,
    @Param('seat') seat: string,
    @Body() body: unknown,
  ) {
    return this.debate.publishResult(id, seat, body);
  }
  @Post('task') task(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.saveTask(id, body);
  }
  @Post('prepare') prepare(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.prepare(id, body);
  }
  @Post('start') start(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.start(id, body);
  }
  @Post('compare') compare(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.compare(id, body);
  }
  @Post('discuss') discuss(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.discuss(id, body);
  }
  @Post('pause') pause(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.pause(id, body);
  }
  @Post('resume') resume(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.resume(id, body);
  }
  @Post('complete') complete(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.complete(id, body);
  }
  @Get('artifacts') artifacts(@Param('runId') id: string) {
    return { artifacts: this.debate.artifacts(id) };
  }
  @Get('artifacts/:artifactId') artifact(
    @Param('runId') id: string,
    @Param('artifactId') artifactId: string,
  ) {
    return this.debate.artifactView(id, artifactId);
  }
  @Get('artifacts/:artifactId/download') download(
    @Param('runId') id: string,
    @Param('artifactId') artifactId: string,
    @Res() response: Response,
  ) {
    const result = this.debate.artifact(id, artifactId);
    response
      .set({
        'Content-Type': result.metadata.mimeType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename="artifact-${result.metadata.id}${result.metadata.mimeType === 'text/markdown' ? '.md' : ''}"`,
        'Cache-Control': 'no-store',
      })
      .send(result.content);
  }
  @Get('artifacts/:artifactId/preview') preview(
    @Param('runId') id: string,
    @Param('artifactId') artifactId: string,
    @Res() response: Response,
  ) {
    const result = this.debate.artifact(id, artifactId);
    if (result.content.length > 256 * 1024)
      throw new BadRequestException('Download this artifact to inspect its full contents.');
    response
      .set({
        'Content-Type':
          result.metadata.mimeType === 'text/html'
            ? 'text/html; charset=utf-8'
            : 'text/plain; charset=utf-8',
        'Content-Security-Policy':
          "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      })
      .send(result.content);
  }
  @Post('actions/propose') propose(@Param('runId') id: string, @Body() body: unknown) {
    return this.debate.propose(id, body);
  }
  @Post('actions/:actionId/apply') apply(
    @Param('runId') id: string,
    @Param('actionId') actionId: string,
    @Body() body: unknown,
  ) {
    return this.debate.apply(id, actionId, body);
  }
  @Post('synthesis') synthesis(@Param('runId') id: string, @Body() body: unknown) {
    const messages = this.maestro.snapshot(id).messages;
    const turnId = object(body) && typeof body.turnId === 'string' ? body.turnId : undefined;
    const message = messages
      .filter(
        (item) =>
          item.role === 'assistant' &&
          item.status === 'completed' &&
          (!turnId || item.id === turnId || item.turnId === turnId),
      )
      .at(-1);
    if (!message) throw new BadRequestException('Choose a completed Maestro analysis.');
    return this.debate.synthesis(id, body, { ...message, id: message.turnId });
  }
}
