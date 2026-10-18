import { useState, type ReactNode } from 'react';
import type { PresentationSpec } from '@genvr/assistant';
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const rows = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter(row => row && typeof row === 'object') : [];
/** Local component registry: specifications contain data, never executable markup or scripts. */
export function SpecRenderer({ spec }: { spec: PresentationSpec }) {
  const render = (id: string): ReactNode => {
    const node = spec.elements[id]; if (!node) return null;
    return <CardNode key={id} type={node.type} p={node.props}>{node.children.map(render)}</CardNode>;
  };
  return <div className="space-y-2 text-xs text-gray-200">{render(spec.root)}</div>;
}
function CardNode({ type, p, children }: { type: string; p: Record<string, unknown>; children: ReactNode }) {
  const [selected, setSelected] = useState(text(p.value));
  const heading = text(p.title ?? p.label ?? p.name);
  const description = text(p.description ?? p.content ?? p.text);
  const items = rows(p.items ?? p.options);
  if (type === 'Metric') return <div><div className="text-gray-400 text-[10px]">{text(p.label)}</div><div className="text-2xl font-bold">{text(p.value)}</div><div className={p.trend === 'down' ? 'text-red-400' : 'text-green-400'}>{text(p.detail)}</div></div>;
  if (['LineChart', 'AreaChart', 'BarChart', 'PieChart'].includes(type)) return <Chart type={type} p={p} />;
  if (type === 'Heading') return <h3 className="font-bold text-sm">{text(p.text)}</h3>;
  if (type === 'Separator') return <hr className="border-gray-700" />;
  if (type === 'Text' || type === 'MarkdownBlock' || type === 'MDCBlock') return <p className="whitespace-pre-wrap">{description || text(p.markdown ?? p.source)}</p>;
  if (type === 'Link') { const href = text(p.href); return /^https?:\/\//.test(href) ? <a href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline">{text(p.text)}</a> : <span>{text(p.text)}</span>; }
  if (type === 'ProgressBar') return <label className="block">{heading}<progress className="w-full" max={Number(p.max) || 100} value={Number(p.value) || 0} /></label>;
  if (type === 'Table') { const data = rows(p.data), columns = rows(p.columns); return <div className="overflow-auto"><table className="w-full text-[10px]"><thead><tr>{columns.map(c => <th key={text(c.key)} className="text-left p-1">{text(c.label)}</th>)}</tr></thead><tbody>{data.map((r, i) => <tr key={i} className="border-t border-gray-700">{columns.map(c => <td key={text(c.key)} className="p-1">{text(r[text(c.key)])}</td>)}</tr>)}</tbody></table></div>; }
  if (type === 'WeatherCard') return <div className="rounded-lg bg-sky-950 p-3"><strong>{text(p.location)}</strong><div className="text-3xl">{text(p.temperature)}°{text(p.unit)}</div><p>{text(p.condition)}</p><p>Humidity {text(p.humidity)}% · Wind {text(p.wind)}</p></div>;
  if (type === 'CalendarView') return <div><strong>{heading}</strong><div className="grid grid-cols-7 gap-1 mt-2">{Array.from({ length: 31 }, (_, i) => <span key={i} className="bg-gray-800 text-center rounded p-1">{i + 1}</span>)}</div><p className="mt-2">{Array.isArray(p.selectedDates) ? p.selectedDates.map(text).join(', ') : ''}</p></div>;
  if (['CheckboxList', 'SwitchRow', 'ToggleButton'].includes(type)) return <div>{heading}{(items.length ? items : [{ label: description || heading }]).map((r, i) => <label className="flex gap-2 py-1" key={i}><input type="checkbox" defaultChecked={Boolean(r.checked ?? p.checked)} disabled={Boolean(r.disabled)} />{text(r.label)}</label>)}</div>;
  if (['RadioGroup', 'ToggleGroup', 'DropdownList', 'Tabs'].includes(type)) return <div>{heading}<select aria-label={heading || type} className="w-full bg-gray-800 rounded p-1" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose</option>{items.map((r, i) => <option key={i} value={text(r.value ?? r.id)}>{text(r.label ?? r.title)}</option>)}</select>{children}</div>;
  if (type === 'SliderRow') return <label>{heading}<input aria-label={heading} type="range" className="w-full" min={Number(p.min) || 0} max={Number(p.max) || 100} defaultValue={Number(p.value) || 0} /></label>;
  if (type === 'JsonViewer') return <pre className="whitespace-pre-wrap text-[10px]">{JSON.stringify(p.data, null, 2)}</pre>;
  if (type === 'OTPDisplay') return <div className="text-xl tracking-widest font-mono">{text(p.code)}</div>;
  if (['Accordion', 'CollapsibleSection', 'HoverCard'].includes(type)) return <details><summary>{heading || text(p.trigger)}</summary><p>{description}</p>{items.map((r, i) => <p key={i}>{text(r.title)} {text(r.content)}</p>)}{children}</details>;
  if (type === 'SkeletonBlock') return <div className="h-12 rounded bg-gray-700 animate-pulse" />;
  if (type === 'Button') return <button className="bg-blue-600 rounded px-3 py-1" onClick={() => setSelected('Selected')}>{selected || heading || text(p.text)}</button>;
  if (type === 'Badge') return <span className="inline-block rounded-full bg-blue-900 px-2 py-1">{text(p.text)}</span>;
  if (type === 'Stack' || type === 'Grid') return <div style={{ display: 'grid', gap: 8, gridTemplateColumns: type === 'Grid' ? `repeat(${Math.max(1, Math.min(4, Number(p.columns) || 1))}, minmax(0,1fr))` : undefined }}>{children}</div>;
  return <section className="rounded border border-gray-700 p-2 space-y-1">{heading ? <strong>{heading}</strong> : null}{description ? <p className="whitespace-pre-wrap">{description}</p> : null}{items.map((r, i) => <div key={i} className="py-1 border-b border-gray-800">{text(r.title ?? r.label ?? r.name)} {text(r.description ?? r.content ?? r.date)}</div>)}{children}</section>;
}
function Chart({ type, p }: { type: string; p: Record<string, unknown> }) {
  const data = rows(p.data).slice(0, 100), key = text(p.yKey ?? p.valueKey) || 'value';
  const values = data.map(row => Number(row[key])).map(v => Number.isFinite(v) ? v : 0);
  const low = Math.min(0, ...values), high = Math.max(low + 1, ...values), height = 100;
  const y = (v: number) => height - (v - low) / (high - low) * height;
  const points = values.map((v, i) => `${i * 250 / Math.max(1, values.length - 1)},${y(v)}`).join(' ');
  const color = /^#[\da-f]{3,8}$/i.test(text(p.color)) ? text(p.color) : '#60a5fa';
  return <figure><figcaption>{text(p.title)}</figcaption><svg role="img" aria-label={text(p.title) || type} viewBox="0 0 250 105" className="w-full h-28"><title>{type}: {values.join(', ')}</title>{type === 'BarChart' || type === 'PieChart' ? values.map((v, i) => <rect key={i} x={i * 250 / Math.max(1, values.length)} y={y(v)} width={220 / Math.max(1, values.length)} height={height - y(v)} fill={color} />) : <><polyline points={points} fill="none" stroke={color} strokeWidth="2" />{type === 'AreaChart' ? <polygon points={`0,100 ${points} 250,100`} fill={color} opacity=".2" /> : null}</>}</svg><div className="flex justify-between text-[9px] text-gray-400">{data.slice(0, 8).map((r, i) => <span key={i}>{text(r[text(p.xKey ?? p.nameKey)] ?? r.name)}</span>)}</div></figure>;
}
