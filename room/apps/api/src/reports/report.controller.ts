import { Body, Controller, Get, Inject, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportService } from './report.service.js';
export const REPORT_CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; object-src 'none'; sandbox allow-scripts";
@Controller('runs/:anchorRunId/reports')
export class ReportController {
  constructor(@Inject(ReportService) private readonly reports: ReportService) {}
  @Post() generate(
    @Param('anchorRunId') anchor: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = this.reports.publisher.request(anchor, body);
    response.status(result.status === 'queued' || result.status === 'building' ? 202 : 200);
    return result;
  }
  @Get() list(
    @Param('anchorRunId') anchor: string,
    @Query('before') before?: string,
    @Query('limit') limit = '20',
  ) {
    return this.reports.repository.list(anchor, before, Number(limit));
  }
  @Get('sources') sources(@Param('anchorRunId') anchor: string) {
    return this.reports.repository.sources(anchor);
  }
  @Get(':generationId') get(
    @Param('anchorRunId') anchor: string,
    @Param('generationId') id: string,
  ) {
    return this.reports.repository.get(anchor, id);
  }
  @Get(':generationId/preview') async preview(
    @Param('anchorRunId') anchor: string,
    @Param('generationId') id: string,
    @Res() response: Response,
  ) {
    const file = await this.reports.publisher.file(anchor, id, 'index.html');
    response
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': REPORT_CSP,
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      })
      .send(file);
  }
  @Get(':generationId/download') async download(
    @Param('anchorRunId') anchor: string,
    @Param('generationId') id: string,
    @Res() response: Response,
  ) {
    const file = await this.reports.publisher.file(anchor, id, 'index.html');
    response
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="index.html"',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      })
      .send(file);
  }
  @Get(':generationId/files/:name') async file(
    @Param('anchorRunId') anchor: string,
    @Param('generationId') id: string,
    @Param('name') name: string,
    @Res() response: Response,
  ) {
    if (!['snapshot.json', 'report-data.json', 'manifest.json'].includes(name)) {
      response.status(404).end();
      return;
    }
    const file = await this.reports.publisher.file(anchor, id, name);
    response
      .set({
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      })
      .send(file);
  }
}
