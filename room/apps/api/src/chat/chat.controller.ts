import { Body, Controller, Delete, Get, Inject, Param, Post, Sse } from '@nestjs/common';
import { ChatService } from './chat.service.js';

@Controller('agents')
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}
  @Get()
  list() {
    return this.chat.list();
  }
  @Get(':id')
  snapshot(@Param('id') id: string) {
    return this.chat.snapshot(this.chat.agent(id));
  }
  @Post('conversation/stop')
  stopConversation() {
    return this.chat.stopConversation();
  }
  @Post(':id/turns')
  submit(@Param('id') id: string, @Body() body: unknown) {
    return this.chat.submit(this.chat.agent(id), body);
  }
  @Delete(':id/turns/current')
  stop(@Param('id') id: string) {
    return this.chat.stop(this.chat.agent(id));
  }
  @Sse(':id/events')
  events(@Param('id') id: string) {
    return this.chat.events(this.chat.agent(id));
  }
}
