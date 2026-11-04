import { ChatService } from '../chat/chat.service.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SpeechService } from './speech.service.js';
import { ListenService } from './listen.service.js';
import { isSpeechAgent } from './voices.js';

@Controller('speech')
export class SpeechController {
  constructor(
    @Inject(SpeechService) private readonly speech: SpeechService,
    @Inject(ChatService) private readonly chat: ChatService,
    @Inject(ListenService) private readonly listen: ListenService,
  ) {}

  @Get('status')
  status() {
    return this.speech.status();
  }

  @Get('listen/status')
  listenStatus() {
    return this.listen.status();
  }

  @Get('voices')
  voices(@Query('runId') runId?: string) {
    return this.speech.voices.view(typeof runId === 'string' && runId ? runId : 'hangout');
  }

  @Put('voices/:runId/:seat')
  selectVoice(@Param('runId') runId: string, @Param('seat') seat: string, @Body() body: unknown) {
    if (!isSpeechAgent(seat)) throw new BadRequestException('Choose seat a or b.');
    const alias =
      typeof body === 'object' && body !== null && 'alias' in body ? body.alias : undefined;
    return this.speech.voices.select(runId, seat, alias);
  }

  @Post('voices')
  addVoice(@Body() body: unknown) {
    const input =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    return this.speech.voices.add(input.alias, input.id);
  }

  @Delete('voices/:alias')
  removeVoice(@Param('alias') alias: string) {
    this.speech.voices.remove(alias);
    return { removed: alias };
  }

  @Post('stream')
  async stream(@Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    const input = this.speech.prepare(body, (reference) => this.chat.speechSegment(reference));
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once('aborted', abort);
    response.once('close', abort);
    response.status(200).set({
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    try {
      await this.speech.stream(input, controller.signal, (event) => {
        if (response.destroyed || controller.signal.aborted) return;
        // Keep a slow/abandoned client from building an unbounded server audio buffer.
        if (response.writableLength > 2 * 1024 * 1024) {
          controller.abort();
          response.end();
          return;
        }
        response.write(`${JSON.stringify(event)}\n`);
      });
    } finally {
      request.off('aborted', abort);
      response.off('close', abort);
      response.end();
    }
  }
}
