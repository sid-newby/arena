import { useEffect, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowUpRight, Check, Palette, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyTheme, defaultTheme, parseTheme, readTheme, themePresets } from '@/themes/theme';
import fonts from '@/themes/fonts.json';
import '@/themes/fonts.css';
import './theme-controls.css';

export function ThemeControls() {
  const [theme, setTheme] = useState(readTheme);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const title =
    theme.preset === 'lacquer'
      ? 'Black lacquer'
      : theme.preset === 'custom'
        ? 'Custom theme'
        : themePresets.find((p) => p.id === theme.preset)?.name;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm" className="theme-trigger">
          <Palette aria-hidden="true" />
          <span>Themes</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="theme-overlay" />
        <Dialog.Content className="theme-drawer">
          <div className="theme-heading">
            <Dialog.Title>Change the atmosphere.</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close themes">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="theme-description">
            42 tweakcn presets. One room. Colors and typography change together. The black lacquer
            and square edges stay.
          </Dialog.Description>
          <div className="theme-current">
            <span>{title}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTheme(defaultTheme);
                setError('');
              }}
            >
              <RotateCcw />
              Reset
            </Button>
          </div>
          <div className="theme-fonts">
            <label>
              Display type
              <select
                value={theme.display}
                onChange={(e) => setTheme({ ...theme, display: e.target.value })}
              >
                <option value="">Theme default</option>
                {fonts.map((font) => (
                  <option key={font}>{font}</option>
                ))}
              </select>
            </label>
            <label>
              Conversation type
              <select
                value={theme.body}
                onChange={(e) => setTheme({ ...theme, body: e.target.value })}
              >
                <option value="">Theme default</option>
                <option>Geist Variable</option>
                {fonts.map((font) => (
                  <option key={font}>{font}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="theme-search">
            Find a preset
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cyberpunk, Doom 64, Graphite…"
            />
          </label>
          <fieldset className="theme-presets">
            <legend className="sr-only">Theme presets</legend>
            {[
              {
                id: 'lacquer',
                name: 'Black lacquer',
                tokens: {
                  primary: '#75b9ff',
                  background: '#090a0c',
                  foreground: '#f4f4ef',
                  'chart-2': '#f49a68',
                },
              },
              ...themePresets,
            ]
              .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
              .map((preset) => (
                <button
                  key={preset.id}
                  className="theme-preset"
                  aria-pressed={theme.preset === preset.id}
                  onClick={() => setTheme({ ...theme, preset: preset.id, display: '', body: '' })}
                >
                  <span className="theme-swatches" aria-hidden="true">
                    {['primary', 'background', 'foreground', 'chart-2'].map((token) => (
                      <i
                        key={token}
                        style={{ background: preset.tokens[token as keyof typeof preset.tokens] }}
                      />
                    ))}
                  </span>
                  <span>{preset.name}</span>
                  {theme.preset === preset.id && <Check size={14} />}
                </button>
              ))}
          </fieldset>
          <div className="theme-import">
            <div className="theme-import-title">
              <h3>Make it yours</h3>
              <a href="https://tweakcn.com/editor/theme" target="_blank" rel="noreferrer">
                Open tweakcn <ArrowUpRight size={14} />
              </a>
            </div>
            <p>Generate or edit a theme in tweakcn, then paste its CSS or registry JSON here.</p>
            <label htmlFor="theme-source" className="sr-only">
              tweakcn theme export
            </label>
            <textarea
              id="theme-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Paste your tweakcn export…"
              rows={4}
            />
            <Button
              variant="outline"
              disabled={!source.trim()}
              onClick={() => {
                try {
                  setTheme({ preset: 'custom', display: '', body: '', custom: parseTheme(source) });
                  setError('Theme imported.');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not import theme.');
                }
              }}
            >
              Apply imported theme
            </Button>
            <output>{error}</output>
          </div>
          <p className="theme-credit">
            Presets by{' '}
            <a href="https://tweakcn.com" target="_blank" rel="noreferrer">
              tweakcn
            </a>
            . Changes are saved on this device.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
