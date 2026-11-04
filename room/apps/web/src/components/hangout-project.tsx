import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { FolderOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RepositoryBrowser } from '@/components/run-setup';
import { changeProject, loadProject } from '@/lib/hangout-project';

export function HangoutProject() {
  const [open, setOpen] = useState(false);
  const [project, setProject] = useState<string | null>();
  const [draft, setDraft] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [pending, setPending] = useState<'loading' | 'saving' | null>('loading');
  const [error, setError] = useState('');
  const read = useRef<AbortController>(undefined);
  const load = useCallback(() => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    void loadProject(controller.signal)
      .then((path) => {
        if (controller.signal.aborted) return;
        setProject(path);
        setDraft(path ?? '');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setProject(undefined);
        setError(cause instanceof Error ? cause.message : 'Could not load the project.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(null);
      });
  }, []);
  useEffect(() => {
    load();
    return () => read.current?.abort();
  }, [load]);
  function refresh() {
    setPending('loading');
    setError('');
    load();
  }
  async function save(path: string | null) {
    if (pending || project === undefined) return;
    setPending('saving');
    setError('');
    try {
      const active = await changeProject(path);
      setProject(active);
      setDraft(active ?? '');
      setBrowsing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The project could not be changed.');
    } finally {
      setPending(null);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setBrowsing(false);
        if (next && pending !== 'saving') refresh();
      }}
    >
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm" title={project ?? 'Open project'}>
          <FolderOpen aria-hidden="true" />
          <span className="max-w-28 truncate">
            {project ? (project.split('/').filter(Boolean).at(-1) ?? '/') : 'Open project'}
          </span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="theme-overlay" />
        <Dialog.Content className="theme-drawer">
          <div className="theme-heading">
            <Dialog.Title>Room project</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close project settings">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="theme-description">
            Astra and Fable can read and edit files in this shared folder. Changes appear in your
            project. If a dev server is watching this folder, it may run edits immediately.
          </Dialog.Description>
          <output className="block my-5 border-y border-border py-3 wrap-anywhere">
            {pending === 'loading' ? (
              'Checking the room project…'
            ) : project ? (
              <>
                Shared folder
                <br />
                <strong>{project}</strong>
              </>
            ) : project === null ? (
              'No project is open.'
            ) : (
              'Project status unavailable.'
            )}
          </output>
          <form
            className="grid gap-3"
            aria-busy={pending !== null}
            onSubmit={(event) => {
              event.preventDefault();
              void save(draft);
            }}
          >
            <label className="theme-search">
              Absolute folder path
              <input
                placeholder="/Users/sidnewby/Prog/…"
                autoCapitalize="none"
                spellCheck={false}
                value={draft}
                disabled={pending !== null}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={pending !== null}
                aria-expanded={browsing}
                onClick={() => setBrowsing((value) => !value)}
              >
                Browse folders
              </Button>
              <Button
                size="sm"
                type="submit"
                disabled={
                  pending !== null || project === undefined || !draft.trim() || draft === project
                }
              >
                {project ? 'Switch project' : 'Open project'}
              </Button>
              {project && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => void save(null)}
                >
                  Detach project
                </Button>
              )}
            </div>
            {pending === 'saving' && <output>Updating the shared folder…</output>}
          </form>
          {browsing && (
            <RepositoryBrowser
              onClose={() => setBrowsing(false)}
              onSelect={(path) => {
                setDraft(path);
                setBrowsing(false);
              }}
            />
          )}
          {error && (
            <div className="mt-4">
              <p role="alert">{error}</p>
              {project === undefined && (
                <Button size="sm" variant="outline" onClick={refresh}>
                  Retry
                </Button>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
