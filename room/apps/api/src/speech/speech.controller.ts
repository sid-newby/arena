import { ChatService } from '../chat/chat.service.js';
import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SpeechService } from './speech.service.js';

@Controller('speech')
export class SpeechController {
  constructor(
    @Inject(SpeechService) private readonly speech: SpeechService,
    @Inject(ChatService) private readonly chat: ChatService,
  ) {}

  @Get('status')
  status() {
    return this.speech.status();
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
