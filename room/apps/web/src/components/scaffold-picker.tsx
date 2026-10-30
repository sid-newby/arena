import { useEffect, useState } from 'react';
import { api } from '@/lib/agents';

function parseCatalog(value: unknown): string[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('scaffolds' in value) ||
    !Array.isArray(value.scaffolds)
  )
    throw new Error('Scaffold catalog is unreadable.');
  return value.scaffolds.map((item: unknown) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)
    )
      throw new Error('Scaffold catalog is unreadable.');
    return item.id;
  });
}
export function ScaffoldPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api('/api/runs/scaffolds', parseCatalog, { signal: controller.signal })
      .then(setCatalog)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Unable to load scaffolds.');
      });
    return () => controller.abort();
  }, []);
  return (
    <label>
      Start from a scaffold
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">No scaffold. Use a repository or empty workspace.</option>
        {value && !catalog.includes(value) && <option value={value}>{value} · unavailable</option>}
        {catalog.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      {error && <output>{error}</output>}
    </label>
  );
}
