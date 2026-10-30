import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/agents';
import type { ProviderCatalog, ProviderConfig, SeatId } from '@/lib/run-workflow';

export function RunSeatModel({
  seat,
  value,
  catalogs,
  onChange,
}: {
  seat: SeatId;
  value: ProviderConfig;
  catalogs: Partial<Record<'codex' | 'anthropic', ProviderCatalog>>;
  onChange: (value: ProviderConfig) => void;
}) {
  const catalog = catalogs[value.provider];
  const models = catalog?.models ?? [];
  const selected = models.find((model) => model.id === value.model);
  return (
    <fieldset className="run-seat-model">
      <legend>Seat {seat.toUpperCase()}</legend>
      <label>
        Provider
        <select
          value={value.provider}
          onChange={(event) => {
            const provider = event.target.value === 'anthropic' ? 'anthropic' : 'codex';
            const model = catalogs[provider]?.models[0];
            onChange({
              provider,
              model: model?.id ?? '',
              effort: model?.efforts.includes('high') ? 'high' : (model?.efforts[0] ?? 'high'),
            });
          }}
        >
          <option value="codex">Codex subscription</option>
          <option value="anthropic">Anthropic subscription</option>
        </select>
      </label>
      <label>
        Model
        <select
          value={value.model}
          disabled={!models.length}
          onChange={(event) => {
            const model = models.find((entry) => entry.id === event.target.value);
            if (model)
              onChange({
                ...value,
                model: model.id,
                effort: model.efforts.includes(value.effort)
                  ? value.effort
                  : (model.efforts[0] ?? 'high'),
              });
          }}
        >
          {!selected && <option value={value.model}>{value.model || 'Choose a model'}</option>}
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Effort
        <select
          value={value.effort}
          disabled={!selected?.efforts.length}
          onChange={(event) => {
            const effort = selected?.efforts.find((entry) => entry === event.target.value);
            if (effort) onChange({ ...value, effort });
          }}
        >
          {!selected?.efforts.includes(value.effort) && (
            <option value={value.effort}>{value.effort} · check availability</option>
          )}
          {selected?.efforts.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

type FolderPage = {
  path: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  truncated: boolean;
  hasGitMarker: boolean;
};

const folderStartKey = 'lilbits-folder-start';

function rememberedFolder(): string | undefined {
  try {
    return localStorage.getItem(folderStartKey) || undefined;
  } catch {
    return undefined;
  }
}

function parseFolderPage(value: unknown): FolderPage {
  if (
    !value ||
    typeof value !== 'object' ||
    !('path' in value) ||
    typeof value.path !== 'string' ||
    !('parent' in value) ||
    (value.parent !== null && typeof value.parent !== 'string') ||
    !('directories' in value) ||
    !Array.isArray(value.directories) ||
    !('truncated' in value) ||
    typeof value.truncated !== 'boolean' ||
    !('hasGitMarker' in value) ||
    typeof value.hasGitMarker !== 'boolean'
  )
    throw new Error('The folder browser returned an unreadable response.');
  const directories: FolderPage['directories'] = [];
  for (const entry of value.directories) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('name' in entry) ||
      typeof entry.name !== 'string' ||
      !('path' in entry) ||
      typeof entry.path !== 'string'
    )
      throw new Error('The folder browser returned an unreadable response.');
    directories.push({ name: entry.name, path: entry.path });
  }
  return {
    path: value.path,
    parent: value.parent,
    directories,
    truncated: value.truncated,
    hasGitMarker: value.hasGitMarker,
  };
}

export function RepositoryBrowser({
  onSelect,
  onClose,
}: {
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState<FolderPage>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [requested, setRequested] = useState<string | undefined>(rememberedFolder);
  const initialFolder = useRef(requested);
  const folderNameId = useId();
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const query = requested ? `?${new URLSearchParams({ path: requested })}` : '';
    void api(`/api/runs/repositories/browse${query}`, parseFolderPage, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setPage(result);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (initialFolder.current && requested === initialFolder.current) {
          initialFolder.current = undefined;
          setRequested(undefined);
        } else {
          setError(cause instanceof Error ? cause.message : 'Could not browse this folder.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requested]);
  function navigate(path: string) {
    initialFolder.current = undefined;
    setError(undefined);
    setPage(undefined);
    setLoading(true);
    setRequested(path);
  }
  async function create() {
    if (!page || !folderName.trim() || creating) return;
    setCreating(true);
    setError(undefined);
    try {
      const result = await api('/api/runs/repositories/folders', parseFolderPage, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: page.path, name: folderName.trim() }),
      });
      setFolderName('');
      setNewFolder(false);
      navigate(result.path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the folder.');
    } finally {
      setCreating(false);
    }
  }
  return (
    <section className="run-folder-browser" aria-label="Browse folders">
      <div className="run-folder-heading">
        <strong>Browse folders</strong>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      {error && (
        <p className="run-error" role="alert">
          {error}
        </p>
      )}
      {loading && <output className="run-muted">Loading folders…</output>}
      {page && !loading && (
        <>
          <p className="run-folder-path">{page.path}</p>
          <p className="run-muted">
            {page.hasGitMarker
              ? 'Git repository detected.'
              : 'Select this folder, or open a subfolder.'}
          </p>
          <div className="run-folder-actions">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!page.parent}
              onClick={() => {
                if (page.parent) navigate(page.parent);
              }}
            >
              Parent folder
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNewFolder(true)}>
              New folder
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                try {
                  localStorage.setItem(folderStartKey, page.parent ?? page.path);
                } catch {
                  // The selection remains available for this run.
                }
                onSelect(page.path);
              }}
            >
              Use this folder
            </Button>
          </div>
          {newFolder && (
            <div className="run-folder-actions">
              <label htmlFor={folderNameId}>
                Folder name
                <Input
                  id={folderNameId}
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                />
              </label>
              <Button
                type="button"
                size="sm"
                disabled={creating || !folderName.trim()}
                onClick={() => void create()}
              >
                {creating ? 'Creating…' : 'Create folder'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setNewFolder(false)}>
                Cancel
              </Button>
            </div>
          )}
          <ul className="run-folder-list" aria-label="Subfolders">
            {page.directories.map((directory) => (
              <li key={directory.path}>
                <button type="button" onClick={() => navigate(directory.path)}>
                  {directory.name}
                </button>
              </li>
            ))}
          </ul>
          {!page.directories.length && <p className="run-muted">No visible subfolders.</p>}
          {page.truncated && (
            <p className="run-muted">
              Some folders are not shown. Enter a path directly to reach them.
            </p>
          )}
        </>
      )}
    </section>
  );
}
