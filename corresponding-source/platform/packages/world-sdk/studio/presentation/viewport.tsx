import { useEffect, useState, useSyncExternalStore } from 'react';
import { AvatarPresentation } from '../../src/avatar-presentation';
import * as FX from './effects';
import { NotifStack } from './notifications';
import { SpecRenderer } from './cards';

/** Hosts may hide screen effects or notifications, or keep only some notification types. */
export function PresentationViewport({ controller, agents = [], compact = false, showEffects = true, showNotifications = true, notificationFilter }: { controller: AvatarPresentation; agents?: Array<{ id: string; name: string }>; compact?: boolean; showEffects?: boolean; showNotifications?: boolean; notificationFilter?: (type: string) => boolean }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const [error, setError] = useState(''), [reduced, setReduced] = useState(false);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  const execute = (event: unknown) => { setError(controller.execute(event) ?? ''); };
  const fx = state.effects;
  const run = async (task: () => Promise<unknown>) => { try { await task(); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); } };
  return <div className="absolute inset-0 pointer-events-none overflow-hidden" data-avatar-presentation data-compact={compact || undefined}>
    <style>{`[data-avatar-presentation][data-compact] .w-72 {width:100%;} [data-avatar-presentation][data-compact] .top-16 {top:8px;left:2px;right:4px;max-width:none!important;} [data-avatar-presentation][data-compact] [data-presentation-cards] {left:2px;right:4px;} @keyframes notif-slide { from { transform:translateX(110%); opacity:0 } to { transform:translateX(0); opacity:1 } } [data-avatar-presentation] .w-72 { width:min(18rem,calc(100vw - 24px)); } @media(prefers-reduced-motion:reduce){[data-avatar-presentation] *{animation:none!important;transition:none!important}}`}</style>
    {!reduced && showEffects ? <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      {fx.matrix !== undefined ? <FX.MatrixRain opacity={fx.matrix} /> : null}
      {fx.emoji !== undefined ? <FX.EmojiRain pack={['🎉', '✨', '🎊', '🥳']} onDone={() => execute({ kind: 'effect', effect: 'emoji', enabled: false })} /> : null}
      {fx.snow !== undefined ? <FX.SnowEffect opacity={fx.snow} /> : null}
      {fx.fireflies !== undefined ? <FX.FirefliesEffect opacity={fx.fireflies} /> : null}
      {fx.starfield !== undefined ? <FX.StarfieldEffect opacity={fx.starfield} /> : null}
      {fx.rain !== undefined ? <FX.RainEffect opacity={fx.rain} /> : null}
      {fx.fire !== undefined ? <FX.FireEffect opacity={fx.fire} /> : null}
      {fx.lightning !== undefined ? <FX.LightningEffect opacity={fx.lightning} /> : null}
      {fx.aurora !== undefined ? <FX.AuroraEffect opacity={fx.aurora} /> : null}
      {fx.glitch !== undefined ? <FX.GlitchEffect intensity={fx.glitch} /> : null}
      {fx.scanlines !== undefined ? <FX.ScanlinesEffect opacity={fx.scanlines} /> : null}
      {fx.hologram !== undefined ? <FX.HologramEffect opacity={fx.hologram} /> : null}
      {fx.vignette !== undefined ? <FX.VignettePulseEffect opacity={fx.vignette} /> : null}
      {fx.confetti !== undefined ? <FX.ConfettiEffect onDone={() => execute({ kind: 'effect', effect: 'confetti', enabled: false })} /> : null}
    </div> : null}
    {showNotifications ? <div className="absolute inset-0" >
      <NotifStack notifs={notificationFilter ? state.notifications.filter(n => notificationFilter(n.type)) : state.notifications} onDismiss={controller.dismiss} onApprove={id => { void run(() => controller.approve(id)); }} onUpdate={async (id, changes) => { if (changes.repliedWith) { try { await controller.reply(id, changes.repliedWith); } catch (e) { setError(String(e)); throw e; } } }} onAiReply={async notice => { try { return await controller.options.actions?.draftReply?.(notice) ?? ''; } catch (e) { setError(String(e)); return ''; } }} />
      <div className="absolute right-2 bottom-3 z-40 space-y-2 max-h-[45%] overflow-y-auto" data-presentation-cards>
        {state.cards.map(item => <section key={item.id} className="pointer-events-auto bg-gray-900/97 backdrop-blur border border-gray-700 rounded-xl shadow-2xl w-72 overflow-hidden" style={{ animation: 'notif-slide .3s ease forwards' }}><div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/80"><span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wide">{item.title}</span><button aria-label="Dismiss card" className="text-gray-500 hover:text-white" onClick={() => controller.dismiss(item.id)}>✕</button></div><div className="p-3 overflow-auto max-h-80"><SpecRenderer spec={item.spec} /></div></section>)}
      </div>
    </div> : null}
    {error ? <div role="alert" className="pointer-events-auto absolute left-2 bottom-2 z-50 bg-red-950 text-white rounded p-2 text-xs max-w-72" onClick={() => setError('')}>{error}</div> : null}
    <output className="sr-only" aria-live="polite">{state.lastAction}</output>
  </div>;
}
