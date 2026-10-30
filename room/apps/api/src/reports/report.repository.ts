import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { z } from 'zod';
import {
  REPORT_LIMITS,
  reportGenerationSchema,
  reportRequestSchema,
  reportSnapshotSchema,
  reportSourcesSchema,
  decisionSchema,
  candidateSchema,
  tokensSchema,
  type ReportGeneration,
  type ReportRequest,
  type ReportSelection,
  type ReportSnapshot,
  type ReportList,
  type ReportSources,
} from '@lilbits/reporting';

const record = (value: SQLOutputValue | undefined) =>
  z.record(z.string(), z.unknown()).parse(JSON.parse(String(value)));
const numberOrNull = (v: SQLOutputValue | undefined) =>
  v === null || v === undefined ? null : Number(v);
const stringOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
const numeric = (v: unknown) => (typeof v === 'number' ? v : null);
export const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
export function canonicalRequest(value: unknown): ReportRequest {
  const parsed = reportRequestSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid report request.');
  const request = parsed.data;
  if (request.selection.kind === 'manual')
    request.selection.runIds = [...new Set(request.selection.runIds)].toSorted();
  if (request.selection.kind === 'date-range')
    request.selection.excludeRunIds = [...new Set(request.selection.excludeRunIds)].toSorted();
  return request;
}
export function sourceFactsHash(snapshot: ReportSnapshot) {
  return sha256(JSON.stringify({ schemaVersion: snapshot.schemaVersion, runs: snapshot.runs }));
}
export class ReportSelectionException extends BadRequestException {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export class ReportRepository {
  constructor(private readonly db: DatabaseSync) {
    db.exec(
      'CREATE TABLE IF NOT EXISTS report_generations(id TEXT PRIMARY KEY,anchor_run_id TEXT NOT NULL,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,body_json TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(anchor_run_id,request_id)); CREATE INDEX IF NOT EXISTS report_generation_history ON report_generations(anchor_run_id,created_at,id);',
    );
  }
  private anchor(id: string) {
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(id) ||
      !this.db.prepare('SELECT id FROM runs WHERE id=?').get(id)
    )
      throw new NotFoundException('Unknown report anchor run.');
  }
  sources(anchorRunId: string): ReportSources {
    this.anchor(anchorRunId);
    const rows = this.db
      .prepare(`
      WITH identities AS (
        SELECT run_id,
          json_extract(attribution_json, '$.provider') AS provider,
          json_extract(attribution_json, '$.model') AS model
        FROM state_attempts WHERE json_valid(attribution_json)
          AND json_type(attribution_json, '$.provider') = 'text'
          AND json_type(attribution_json, '$.model') = 'text'
        UNION
        SELECT run_id,
          json_extract(body_json, '$.candidates.a.provider'),
          json_extract(body_json, '$.candidates.a.model')
        FROM state_outcome_revisions WHERE json_valid(body_json)
          AND json_type(body_json, '$.candidates.a.provider') = 'text'
          AND json_type(body_json, '$.candidates.a.model') = 'text'
        UNION
        SELECT run_id,
          json_extract(body_json, '$.candidates.b.provider'),
          json_extract(body_json, '$.candidates.b.model')
        FROM state_outcome_revisions WHERE json_valid(body_json)
          AND json_type(body_json, '$.candidates.b.provider') = 'text'
          AND json_type(body_json, '$.candidates.b.model') = 'text'
      )
      SELECT r.id AS run_id, i.provider, i.model
      FROM runs r LEFT JOIN identities i ON i.run_id = r.id
      ORDER BY r.id, i.provider, i.model
    `)
      .all();
    const sources = new Map<string, ReportSources[number]>();
    for (const row of rows) {
      const runId = String(row.run_id);
      const source = sources.get(runId) ?? { runId, models: [] };
      if (
        typeof row.provider === 'string' &&
        row.provider.trim() &&
        typeof row.model === 'string' &&
        row.model.trim()
      ) {
        source.models.push({ provider: row.provider, model: row.model });
      }
      sources.set(runId, source);
    }
    return reportSourcesSchema.parse([...sources.values()]);
  }
  accept(anchorRunId: string, value: unknown): ReportGeneration {
    this.anchor(anchorRunId);
    const request = canonicalRequest(value),
      inputHash = sha256(JSON.stringify(request.selection));
    const prior = this.db
      .prepare('SELECT * FROM report_generations WHERE anchor_run_id=? AND request_id=?')
      .get(anchorRunId, request.requestId);
    if (prior) {
      if (prior.input_hash !== inputHash)
        throw new ConflictException('Report request ID was reused with a different selection.');
      return reportGenerationSchema.parse(JSON.parse(String(prior.body_json)));
    }
    if (
      request.selection.kind === 'manual' &&
      request.selection.runIds.some(
        (id) => !this.db.prepare('SELECT id FROM runs WHERE id=?').get(id),
      )
    )
      throw new BadRequestException('A selected report source does not exist.');
    this.validateSelection(anchorRunId, request.selection);
    const count = Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM report_generations WHERE json_extract(body_json,'$.status') IN ('queued','building')",
        )
        .get()?.n,
    );
    if (count >= REPORT_LIMITS.queued)
      throw new ServiceUnavailableException('Report generation queue is full.');
    const generation: ReportGeneration = {
      id: randomUUID(),
      anchorRunId,
      requestId: request.requestId,
      createdAt: Date.now(),
      selection: request.selection,
      resolvedRunIds: [],
      status: 'queued',
    };
    this.db
      .prepare('INSERT INTO report_generations VALUES (?,?,?,?,?,?)')
      .run(
        generation.id,
        anchorRunId,
        request.requestId,
        inputHash,
        JSON.stringify(generation),
        generation.createdAt,
      );
    return generation;
  }
  update(generation: ReportGeneration) {
    this.db
      .prepare('UPDATE report_generations SET body_json=? WHERE id=?')
      .run(JSON.stringify(reportGenerationSchema.parse(generation)), generation.id);
  }
  get(anchorRunId: string, id: string): ReportGeneration {
    this.anchor(anchorRunId);
    const row = this.db
      .prepare('SELECT body_json FROM report_generations WHERE anchor_run_id=? AND id=?')
      .get(anchorRunId, id);
    if (!row) throw new NotFoundException('Unknown report generation.');
    return reportGenerationSchema.parse(JSON.parse(String(row.body_json)));
  }
  list(anchorRunId: string, before?: string, limit = 20): ReportList {
    this.anchor(anchorRunId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('Report history limit must be 1 through 100.');
    let cursor: [number, string] | null = null;
    if (before) {
      try {
        cursor = z
          .tuple([z.number().int().nonnegative(), z.string()])
          .parse(JSON.parse(Buffer.from(before, 'base64url').toString()));
      } catch {
        throw new BadRequestException('Invalid report history cursor.');
      }
    }
    const rows = cursor
      ? this.db
          .prepare(
            'SELECT body_json FROM report_generations WHERE anchor_run_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?',
          )
          .all(anchorRunId, cursor[0], cursor[0], cursor[1], limit + 1)
      : this.db
          .prepare(
            'SELECT body_json FROM report_generations WHERE anchor_run_id=? ORDER BY created_at DESC,id DESC LIMIT ?',
          )
          .all(anchorRunId, limit + 1);
    const generations = rows
      .slice(0, limit)
      .map((r) => reportGenerationSchema.parse(JSON.parse(String(r.body_json))));
    const last = generations.at(-1);
    return {
      generations,
      nextBefore:
        rows.length > limit && last
          ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString('base64url')
          : null,
    };
  }
  unfinished(): ReportGeneration[] {
    return this.db
      .prepare(
        "SELECT body_json FROM report_generations WHERE json_extract(body_json,'$.status') IN ('queued','building') ORDER BY created_at,id",
      )
      .all()
      .map((r) => reportGenerationSchema.parse(JSON.parse(String(r.body_json))));
  }
  private resolve(anchorRunId: string, selection: ReportSelection): string[] {
    let ids: string[];
    switch (selection.kind) {
      case 'current':
        ids = [anchorRunId];
        break;
      case 'manual':
        ids = selection.runIds;
        break;
      case 'date-range': {
        const excluded = new Set(selection.excludeRunIds);
        ids = this.db
          .prepare('SELECT id FROM runs WHERE created_at>=? AND created_at<? ORDER BY id')
          .all(Date.parse(selection.fromInclusive), Date.parse(selection.toExclusive))
          .map((r) => String(r.id))
          .filter((id) => !excluded.has(id));
        break;
      }
    }
    if (!ids.length)
      throw new ReportSelectionException('empty-selection', 'No runs match this report selection.');
    if (ids.length > REPORT_LIMITS.runs)
      throw new ReportSelectionException('run-limit', 'Report run limit exceeded.');
    return [...new Set(ids)].toSorted();
  }
  private validateSelection(anchor: string, selection: ReportSelection) {
    const ids = this.resolve(anchor, selection);
    const count = ids.reduce(
      (total, id) =>
        total +
        Number(
          this.db.prepare('SELECT COUNT(*) AS n FROM state_attempts WHERE run_id=?').get(id)?.n ??
            0,
        ),
      0,
    );
    if (count > REPORT_LIMITS.attempts)
      throw new ReportSelectionException('attempt-limit', 'Report attempt limit exceeded.');
    return ids;
  }
  capture(generation: ReportGeneration): ReportSnapshot {
    if (this.db.isTransaction) throw new Error('Report capture requires its own read transaction.');
    this.db.exec('BEGIN');
    try {
      const ids = this.validateSelection(generation.anchorRunId, generation.selection);
      let attemptCount = 0;
      const runs = ids.map((id) => {
        const row = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);
        if (!row) throw new BadRequestException('A selected report source does not exist.');
        const taskRows = this.db
          .prepare('SELECT * FROM state_task_revisions WHERE run_id=? ORDER BY revision')
          .all(id);
        const tasks = taskRows.map((r) => {
          const t = record(r.task_json);
          const source = z.object({ revision: z.string() }).nullable().parse(t.source);
          const safe = {
            question: t.question,
            criteria: t.criteria,
            mode: t.mode,
            profile: t.profile,
            expectedArtifact: t.expectedArtifact,
            sourceRevision: source?.revision ?? null,
          };
          return {
            revision: Number(r.revision),
            question: safe.question,
            criteria: safe.criteria,
            mode: safe.mode,
            profile: safe.profile,
            expectedArtifact: safe.expectedArtifact,
            sourceRevision: safe.sourceRevision,
            definitionHash: sha256(JSON.stringify({ version: 1, ...safe })),
            origin: String(r.origin),
            createdAt: Number(r.created_at),
          };
        });
        const observations = new Map<string, unknown[]>();
        for (const r of this.db
          .prepare(
            'SELECT u.* FROM state_usage_observations u JOIN state_attempts a ON a.id=u.attempt_id WHERE a.run_id=? ORDER BY u.id',
          )
          .all(id)) {
          const body = record(r.body_json);
          const v = {
            sequence: Number(r.id),
            observedAt: Number(r.created_at),
            key: body.key,
            source: body.source,
            scope: body.scope,
            coverage: body.coverage,
            completeness: body.completeness,
            requestedModel: body.requestedModel,
            actualModel: body.actualModel,
            tokens: tokensSchema.parse(body.tokens),
            providerDurationMs: body.providerDurationMs,
          };
          const key = String(r.attempt_id);
          observations.set(key, [...(observations.get(key) ?? []), v]);
        }
        const tools = new Map<string, unknown[]>();
        for (const r of this.db
          .prepare(
            'SELECT t.* FROM state_tool_calls t JOIN state_attempts a ON a.id=t.attempt_id WHERE a.run_id=? ORDER BY t.started_at,t.id',
          )
          .all(id)) {
          const key = String(r.attempt_id),
            v = {
              id: String(r.id),
              name: String(r.name),
              status: String(r.status),
              startedAt: Number(r.started_at),
              finishedAt: numberOrNull(r.finished_at),
              elapsedMs: numberOrNull(r.elapsed_ms),
            };
          tools.set(key, [...(tools.get(key) ?? []), v]);
        }
        const sourceAttempts = this.db
          .prepare(
            'SELECT a.*,p.profile FROM state_attempts a LEFT JOIN binding_policies p ON p.binding_id=a.binding_id WHERE a.run_id=? ORDER BY a.requested_at,a.id',
          )
          .all(id);
        attemptCount += sourceAttempts.length;
        if (attemptCount > REPORT_LIMITS.attempts)
          throw new ReportSelectionException('attempt-limit', 'Report attempt limit exceeded.');
        const attempts = sourceAttempts.map((r) => {
          const a = record(r.attribution_json);
          return {
            id: String(r.id),
            turnId: String(r.turn_id),
            bindingId: stringOrNull(r.binding_id),
            role: String(r.role),
            provider: stringOrNull(a.provider),
            model: stringOrNull(a.model),
            effort: stringOrNull(a.effort),
            instructionsVersion: stringOrNull(a.instructionsVersion),
            toolPolicyVersion: numeric(a.toolPolicyVersion),
            toolProfile: stringOrNull(r.profile),
            configRevision: numeric(a.configRevision),
            taskRevision: numeric(a.taskRevision),
            phase: stringOrNull(a.stage),
            trigger: stringOrNull(a.trigger) ?? 'unknown',
            origin: stringOrNull(a.origin) ?? 'unknown',
            originalAuthor: stringOrNull(a.originalAuthor),
            attributionSource: stringOrNull(a.attributionSource) ?? 'recorded-binding',
            parentTurnId: stringOrNull(a.parentTurnId),
            retryOf: stringOrNull(a.retryOf),
            requestedAt: numberOrNull(r.requested_at),
            startedAt: numberOrNull(r.started_at),
            firstTextAt: numberOrNull(r.first_text_at),
            finishedAt: numberOrNull(r.finished_at),
            elapsedMs: numberOrNull(r.elapsed_ms),
            status: String(r.status),
            usage: observations.get(String(r.id)) ?? [],
            tools: tools.get(String(r.id)) ?? [],
          };
        });
        const outcomes = this.db
          .prepare('SELECT * FROM state_outcome_revisions WHERE run_id=? ORDER BY revision')
          .all(id)
          .map((r) => {
            const o = record(r.body_json),
              c = z.object({ a: candidateSchema, b: candidateSchema }).parse(o.candidates);
            return {
              revision: Number(r.revision),
              kind: String(r.kind),
              proposalRevision: numeric(o.proposalRevision),
              sourceMaestroTurnId: o.sourceMaestroTurnId,
              taskRevision: o.taskRevision,
              decision: decisionSchema.parse(o.decision),
              candidates: { a: c.a, b: c.b },
              createdAt: Number(r.created_at),
            };
          });
        return {
          id,
          createdAt: Number(row.created_at),
          kind: String(row.kind),
          state: String(row.state),
          revision: Number(row.revision),
          tasks,
          attempts,
          outcomes,
        };
      });
      const snapshot = reportSnapshotSchema.parse({
        schemaVersion: 1,
        generationId: generation.id,
        anchorRunId: generation.anchorRunId,
        capturedAt: Date.now(),
        timeZone:
          generation.selection.kind === 'date-range' ? generation.selection.timeZone : 'UTC',
        selection: generation.selection,
        resolvedRunIds: ids,
        runs,
      });
      this.db.exec('COMMIT');
      return snapshot;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
