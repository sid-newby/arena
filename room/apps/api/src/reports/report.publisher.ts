import { ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { open, mkdir, readFile, rename, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  deriveReportData,
  METRIC_POLICY_VERSION,
  REPORT_LIMITS,
  reportManifestSchema,
  reportSnapshotSchema,
  reportDataSchema,
  type ReportAssets,
  type ReportRenderer,
  type ReportGeneration,
  type ReportManifest,
} from '@lilbits/reporting';
import {
  ReportRepository,
  ReportSelectionException,
  sha256,
  sourceFactsHash,
} from './report.repository.js';

export interface ReportRuntime {
  renderReport: ReportRenderer;
  reportAssets: ReportAssets;
}
export type PublicationBoundary = 'snapshot' | 'data' | 'html' | 'manifest' | 'renamed' | 'ready';
export class ReportPublisher {
  private running: Promise<void> | null = null;
  private stopped = false;
  private readonly pending: ReportGeneration[] = [];
  constructor(
    private readonly repository: ReportRepository,
    private readonly root: string,
    private readonly runtime: () => Promise<ReportRuntime>,
    private readonly fault?: (boundary: PublicationBoundary) => void,
  ) {}
  async recover() {
    for (const generation of this.repository.unfinished()) {
      if (generation.status === 'queued') {
        this.fail(generation, 'restart-before-capture');
        continue;
      }
      let manifest: ReportManifest;
      try {
        manifest = await this.integrity(generation);
      } catch {
        this.fail(generation, 'restart-during-generation');
        await this.removeStaging(generation);
        continue;
      }
      this.ready(generation, manifest);
    }
  }
  request(anchorRunId: string, body: unknown) {
    const generation = this.repository.accept(anchorRunId, body);
    if (generation.status === 'queued' && !this.pending.some((g) => g.id === generation.id))
      this.pending.push(generation);
    if (!this.running) {
      this.running = new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => this.drain())
        .catch(() => {
          new Logger(ReportPublisher.name).error(
            'Report worker storage failure; unfinished generations require restart recovery.',
          );
        })
        .finally(() => {
          this.running = null;
        });
    }
    return generation;
  }
  async idle() {
    await this.running;
  }
  async close() {
    this.stopped = true;
    await this.running;
  }
  private async drain() {
    while (!this.stopped) {
      const next = this.pending.shift();
      if (!next) break;
      if (this.repository.get(next.anchorRunId, next.id).status !== 'queued') continue;
      await this.publish(next);
    }
  }
  private directory(g: ReportGeneration) {
    return join(this.root, 'runs', g.anchorRunId, 'report', g.id);
  }
  private staging(g: ReportGeneration) {
    return join(this.root, 'runs', g.anchorRunId, 'report', `.${g.id}.staging`);
  }
  private async removeStaging(g: ReportGeneration) {
    const stage = this.staging(g);
    try {
      if ((await readFile(join(stage, '.owner'), 'utf8')) === g.id)
        await rm(stage, { recursive: true, force: true });
    } catch {}
  }
  private fail(g: ReportGeneration, errorCode: string) {
    this.repository.update({
      id: g.id,
      anchorRunId: g.anchorRunId,
      requestId: g.requestId,
      createdAt: g.createdAt,
      selection: g.selection,
      resolvedRunIds: g.resolvedRunIds,
      status: 'failed',
      errorCode,
    });
  }
  private ready(g: ReportGeneration, manifest: ReportManifest) {
    const base = `/api/runs/${g.anchorRunId}/reports/${g.id}`;
    this.repository.update({
      id: g.id,
      anchorRunId: g.anchorRunId,
      requestId: g.requestId,
      createdAt: g.createdAt,
      selection: g.selection,
      resolvedRunIds: manifest.resolvedRunIds,
      status: 'ready',
      capturedAt: manifest.capturedAt,
      manifestHash: sha256(JSON.stringify(manifest)),
      previewUrl: base + '/preview',
      downloadUrl: base + '/download',
    });
  }
  private async write(directory: string, name: string, content: string) {
    const file = await open(join(directory, name), 'wx', 0o600);
    try {
      await file.writeFile(content);
      await file.sync();
    } finally {
      await file.close();
    }
  }
  private async publish(original: ReportGeneration) {
    let generation = original;
    try {
      generation = { ...original, status: 'building' };
      this.repository.update(generation);
      const snapshot = this.repository.capture(generation);
      generation = { ...generation, resolvedRunIds: snapshot.resolvedRunIds };
      this.repository.update(generation);
      const snapshotText = JSON.stringify(snapshot),
        factsHash = sourceFactsHash(snapshot);
      const data = reportDataSchema.parse(
        deriveReportData(snapshot, { version: METRIC_POLICY_VERSION, sourceFactsHash: factsHash }),
      );
      const { renderReport, reportAssets: assets } = await this.runtime();
      const { html } = renderReport(data, assets);
      if (Buffer.byteLength(html) > REPORT_LIMITS.htmlBytes) throw new Error('html-size-limit');
      const parent = join(this.root, 'runs', generation.anchorRunId, 'report');
      await mkdir(parent, { recursive: true, mode: 0o700 });
      const stage = this.staging(generation);
      await mkdir(stage, { mode: 0o700 });
      await this.write(stage, '.owner', generation.id);
      await this.write(stage, 'snapshot.json', snapshotText);
      this.fault?.('snapshot');
      const dataText = JSON.stringify(data);
      await this.write(stage, 'report-data.json', dataText);
      this.fault?.('data');
      await this.write(stage, 'index.html', html);
      this.fault?.('html');
      const manifest: ReportManifest = {
        schemaVersion: 1,
        generationId: generation.id,
        anchorRunId: generation.anchorRunId,
        capturedAt: snapshot.capturedAt,
        timeZone: snapshot.timeZone,
        selection: snapshot.selection,
        resolvedRunIds: snapshot.resolvedRunIds,
        metricPolicyVersion: METRIC_POLICY_VERSION,
        rendererVersion: assets.rendererVersion,
        rendererBuild: assets.rendererBuild,
        themeAdapterHash: assets.themeAdapterHash,
        cssHash: assets.cssHash,
        dependencies: assets.dependencies,
        sourceFactsHash: factsHash,
        fingerprint: sha256(
          JSON.stringify([
            factsHash,
            METRIC_POLICY_VERSION,
            assets.rendererVersion,
            assets.rendererBuild,
            assets.themeAdapterHash,
            assets.cssHash,
          ]),
        ),
        sourceRevisions: snapshot.runs.map((r) => ({
          runId: r.id,
          taskRevisions: r.tasks.map((t) => t.revision),
          outcomeRevisions: r.outcomes.map((o) => o.revision),
        })),
        files: {
          'snapshot.json': sha256(snapshotText),
          'report-data.json': sha256(dataText),
          'index.html': sha256(html),
        },
        exclusions: data.exclusions,
      };
      await this.write(
        stage,
        'manifest.json',
        JSON.stringify(reportManifestSchema.parse(manifest)),
      );
      this.fault?.('manifest');
      const stagedDirectory = await open(stage, 'r');
      try {
        await stagedDirectory.sync();
      } finally {
        await stagedDirectory.close();
      }
      await rename(stage, this.directory(generation));
      await rm(join(this.directory(generation), '.owner'));
      const parentDirectory = await open(parent, 'r');
      try {
        await parentDirectory.sync();
      } finally {
        await parentDirectory.close();
      }
      this.fault?.('renamed');
      const verified = await this.integrity(generation);
      this.ready(generation, verified);
      this.fault?.('ready');
    } catch (error) {
      let manifest: ReportManifest;
      try {
        manifest = await this.integrity(generation);
      } catch {
        this.fail(
          generation,
          error instanceof ReportSelectionException
            ? error.code
            : error instanceof Error && error.message === 'html-size-limit'
              ? 'html-size-limit'
              : 'generation-failed',
        );
        await this.removeStaging(generation);
        return;
      }
      try {
        this.ready(generation, manifest);
      } catch {}
    }
  }
  async integrity(generation: ReportGeneration): Promise<ReportManifest> {
    const directory = this.directory(generation),
      stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid report directory.');
    const manifestPath = join(directory, 'manifest.json'),
      manifestStat = await lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink())
      throw new Error('Invalid report manifest file.');
    const manifestText = await readFile(manifestPath, 'utf8'),
      manifest = reportManifestSchema.parse(JSON.parse(manifestText));
    if (manifest.generationId !== generation.id || manifest.anchorRunId !== generation.anchorRunId)
      throw new Error('Report manifest identity mismatch.');
    for (const [name, hash] of Object.entries(manifest.files)) {
      const path = join(directory, name),
        s = await lstat(path);
      if (!s.isFile() || s.isSymbolicLink() || sha256(await readFile(path)) !== hash)
        throw new Error('Report integrity mismatch.');
    }
    const snapshot = reportSnapshotSchema.parse(
        JSON.parse(await readFile(join(directory, 'snapshot.json'), 'utf8')),
      ),
      data = reportDataSchema.parse(
        JSON.parse(await readFile(join(directory, 'report-data.json'), 'utf8')),
      );
    if (
      sourceFactsHash(snapshot) !== manifest.sourceFactsHash ||
      data.sourceFactsHash !== manifest.sourceFactsHash ||
      snapshot.generationId !== generation.id ||
      data.generationId !== generation.id
    )
      throw new Error('Report source mismatch.');
    if (generation.status === 'ready' && sha256(manifestText) !== generation.manifestHash)
      throw new Error('Report manifest hash mismatch.');
    return manifest;
  }
  async file(anchorRunId: string, id: string, name: string) {
    if (!['index.html', 'snapshot.json', 'report-data.json', 'manifest.json'].includes(name))
      throw new NotFoundException('Unknown report file.');
    const generation = this.repository.get(anchorRunId, id);
    if (generation.status !== 'ready')
      throw new ConflictException('Report generation is not ready.');
    await this.integrity(generation);
    return readFile(join(this.directory(generation), name));
  }
}
