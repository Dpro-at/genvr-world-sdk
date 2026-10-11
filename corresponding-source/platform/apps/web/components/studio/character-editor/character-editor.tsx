'use client';

import { PersonStanding, Ruler, Palette, Save, ScanFace, Sparkles, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { CharacterStageView } from './character-stage-view';
import { BodySection, ColorSection, FaceSection, MovesSection, RecipeSection, ShapeSection } from './character-controls';
import { useCharacterEditor, type CharacterEditor } from './use-character-editor';

export { CharacterControls, CharacterMoves } from './character-controls';
export { CharacterStageView } from './character-stage-view';
export { useCharacterEditor, type CharacterEditor } from './use-character-editor';

type Tab = 'body' | 'shape' | 'face' | 'colors' | 'moves' | 'save';
const TABS: Array<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: 'body', label: 'Body', Icon: PersonStanding },
  { id: 'shape', label: 'Shape', Icon: Ruler },
  { id: 'face', label: 'Face', Icon: ScanFace },
  { id: 'colors', label: 'Colours', Icon: Palette },
  { id: 'moves', label: 'Moves', Icon: Sparkles },
  { id: 'save', label: 'Save', Icon: Save },
];

/**
 * The character editor in its simple layout (CHAR-01): phones and tablets get the stage on top and one section at a
 * time below; wide screens put the sections beside the stage. The Studio on a computer uses the pro layout instead
 * (the same pieces in its resizable docks); the player's Avatar button opens this one later (phase 2).
 */
export function SimpleCharacterEditor({ editor: given }: { editor?: CharacterEditor }) {
  const own = useCharacterEditor();
  const editor = given ?? own;
  const [tab, setTab] = useState<Tab>('body');
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-paper md:flex-row">
      <div className="h-[52dvh] min-h-0 shrink-0 md:h-full md:flex-1">
        <CharacterStageView editor={editor} compact />
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-surface md:w-96 md:flex-none md:border-l md:border-ink/10">
        <div
          role="tablist"
          aria-label="Character"
          className="m-2 grid shrink-0 grid-cols-6 gap-1 rounded-2xl bg-paper p-1"
        >
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold ${
                tab === entry.id ? 'bg-surface text-ink shadow' : 'text-ink/60 hover:text-ink'
              }`}
            >
              <entry.Icon className="size-5" aria-hidden />
              {entry.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4 [scrollbar-width:none]">
          {tab === 'body' ? <BodySection editor={editor} /> : null}
          {tab === 'shape' ? <ShapeSection editor={editor} /> : null}
          {tab === 'face' ? <FaceSection editor={editor} /> : null}
          {tab === 'colors' ? <ColorSection editor={editor} /> : null}
          {tab === 'moves' ? <MovesSection editor={editor} columns="grid-cols-4 md:grid-cols-3" /> : null}
          {tab === 'save' ? <RecipeSection editor={editor} /> : null}
        </div>
      </div>
    </div>
  );
}
