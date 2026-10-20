'use client';

import { useState } from 'react';
import { FlaskConical } from 'lucide-react';

/** Opens my motion lab from a world project: the one lab (made the first time), after this project is saved. */
export interface LabProjects {
  openMine(): Promise<void>;
}

/**
 * The Lab tab in a world project (Mohamed, 2026-10-20: "the Lab tab must always show"; "one lab is enough"). The lab is
 * its own project so tests never change the world (Q-LAB-1); the tab opens it at once. This page shows only while it
 * opens, or when it could not.
 */
export function LabPicker({ projects, error }: { projects?: LabProjects | undefined; error?: string | null }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-surface p-6">
      <section aria-label="Motion lab" className="w-full max-w-sm space-y-3 rounded-2xl border border-ink/10 bg-paper p-5 text-ink">
        <h2 className="flex items-center gap-2 text-sm font-black"><FlaskConical className="size-5" aria-hidden />Motion lab</h2>
        <p className="text-xs text-ink/60">The lab is its own project, so tests never change this world.</p>
        {projects ? <button type="button" onClick={() => { setProblem(null); void projects.openMine().catch((e) => setProblem(e instanceof Error ? e.message : String(e))); }}
          className="w-full rounded-lg bg-ink py-2 text-xs font-bold text-on-brand">Open my motion lab</button> : <p className="text-xs text-ink/50">The lab is not available here.</p>}
        {problem ?? error ? <p role="alert" className="text-xs font-semibold text-coral">{problem ?? error}</p> : null}
      </section>
    </div>
  );
}
