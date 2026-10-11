'use client';

import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import type { GenvrRuntime, RuntimeDiagnostics } from '@genvr/runtime';

const button = 'rounded-md bg-paper px-2 py-1 text-xs font-bold hover:bg-ink/10 disabled:opacity-40';
const bytes = (value: number) =>
  value >= 1048576 ? `${(value / 1048576).toFixed(2)} MiB` : `${(value / 1024).toFixed(1)} KiB`;
/** Only scans on opening or explicit refresh/probe. This panel has no background polling. */
export function ResourceDiagnostics({ runtime }: { runtime: RefObject<GenvrRuntime | null> }) {
  const [snapshot, setSnapshot] = useState<RuntimeDiagnostics | null>(null);
  const [view, setView] = useState<'resources' | 'items'>('resources');
  const [query, setQuery] = useState(''),
    [message, setMessage] = useState('');
  const scan = (instanceId?: string) => {
    try {
      if (!runtime.current) {
        setMessage('The runtime is not ready. Refresh when the world loads.');
        return;
      }
      setSnapshot(runtime.current.diagnostics(instanceId ? { instanceId } : undefined));
      setMessage('');
    } catch {
      setMessage('Resource inspection failed. Refresh or check Output for runtime errors.');
    }
  };
  useEffect(() => {
    scan();
  }, [runtime]);
  const exportSnapshot = () => {
    if (!snapshot) return;
    // Export constructed IDs/counts only, never raw userData, asset URLs or arbitrary status text.
    const safe = {
      ...snapshot,
      items: snapshot.items.map((item) => ({
        instanceId: item.instanceId,
        itemId: item.itemId,
        meshParts: item.meshParts,
        visibleTriangles: item.visibleTriangles,
        sharedBatch: item.sharedBatch,
        status: item.status,
      })),
      resources: snapshot.resources.map((resource) => ({
        id: resource.id,
        status: resource.status,
        objects: resource.objects,
        meshes: resource.meshes,
        visibleMeshes: resource.visibleMeshes,
        visibleTriangles: resource.visibleTriangles,
        geometryBytes: resource.geometryBytes,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'genvr-resource-diagnostics.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const search = query.trim().toLowerCase();
  const items =
    snapshot?.items.filter((item) =>
      `${item.name ?? ''} ${item.itemId} ${item.instanceId}`.toLowerCase().includes(search),
    ) ?? [];
  const resources =
    snapshot?.resources.filter((resource) =>
      `${resource.label} ${resource.id}`.toLowerCase().includes(search),
    ) ?? [];
  return (
    <section aria-label="Resource diagnostics" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-ink/10 px-3 py-2">
        <button
          type="button"
          className={button}
          aria-pressed={view === 'resources'}
          onClick={() => setView('resources')}
        >
          Systems
        </button>
        <button
          type="button"
          className={button}
          aria-pressed={view === 'items'}
          onClick={() => setView('items')}
        >
          Items
        </button>
        <input
          aria-label="Search resource diagnostics"
          placeholder="Name or instance ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 rounded-md bg-paper px-2 py-1 text-xs"
        />
        {view === 'items' ? (
          <button type="button" className={button} disabled={!search} onClick={() => scan(query.trim())}>
            Inspect instance ID
          </button>
        ) : null}
        <button type="button" className={`${button} inline-flex items-center gap-1`} onClick={() => scan()}>
          <RefreshCw aria-hidden className="size-3" />
          Refresh resources
        </button>
        <button
          type="button"
          className={`${button} inline-flex items-center gap-1`}
          disabled={!snapshot}
          onClick={exportSnapshot}
        >
          <Download aria-hidden className="size-3" />
          Export diagnostics
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2 text-xs">
        {message ? <p role="status">{message}</p> : null}
        {snapshot ? (
          <>
            <p className="mb-2 text-ink/60">
              {snapshot.backend} · {snapshot.paused ? 'Runtime paused' : 'Runtime rendering'} · scan{' '}
              {snapshot.scanMs.toFixed(2)}ms · geometry buffers {bytes(snapshot.geometryBytes)}
            </p>
            <p className="mb-2 text-ink/50">
              Scene inventory before camera culling and shadow passes. Buffer sizes describe CPU geometry
              storage; shared buffers are counted once overall. GPU timings and memory are not measured here.
            </p>
            {snapshot.truncated ? (
              <p role="status" className="mb-2 font-bold text-coral">
                Partial snapshot: scan limits reached. Inspect an exact instance ID for items beyond the list.
              </p>
            ) : null}
            {view === 'resources' ? (
              <table className="w-full text-left" aria-label="System geometry inventory">
                <thead className="text-ink/50">
                  <tr>
                    <th className="py-1">System</th>
                    <th>Mesh status</th>
                    <th>Meshes</th>
                    <th>Scene triangles</th>
                    <th>Buffers</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((resource) => (
                    <tr key={resource.id} className="border-t border-ink/10">
                      <td className="py-2 pr-2">
                        <span className="font-bold">{resource.label}</span>
                        <span className="block font-mono text-[10px] text-ink/50">{resource.id}</span>
                        {resource.detail ? (
                          <span className="block text-ink/50">{resource.detail}</span>
                        ) : null}
                      </td>
                      <td className="pr-2">{resource.status}</td>
                      <td className="pr-2 font-mono">
                        {resource.visibleMeshes}/{resource.meshes}
                      </td>
                      <td className="pr-2 font-mono">{resource.visibleTriangles.toLocaleString()}</td>
                      <td className="font-mono">{bytes(resource.geometryBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left" aria-label="Item geometry inventory">
                <thead className="text-ink/50">
                  <tr>
                    <th className="py-1">Item</th>
                    <th>Status</th>
                    <th>Parts</th>
                    <th>Scene triangles</th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.instanceId} className="border-t border-ink/10">
                      <td className="py-2 pr-2">
                        <span className="font-bold">{item.name ?? item.itemId}</span>
                        <span className="block font-mono text-[10px] text-ink/50">{item.instanceId}</span>
                        <span className="block text-ink/50">
                          {item.itemId}
                          {item.sharedBatch ? ' · shared instance batch' : ''}
                        </span>
                      </td>
                      <td className="pr-2">
                        {snapshot.truncated && item.status === 'not represented'
                          ? 'Not found in partial scan'
                          : item.status}
                      </td>
                      <td className="pr-2 font-mono">{item.meshParts}</td>
                      <td className="pr-2 font-mono">{item.visibleTriangles.toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          className={button}
                          onClick={() => runtime.current?.selectItems([item.instanceId])}
                        >
                          Show
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(view === 'items' ? items.length : resources.length) === 0 ? (
              <p className="py-2 text-ink/50">No matches in this snapshot. Clear the search and refresh.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
