/** Tidewater PostFX.js, pinned 4811ba48, MIT; source equations for CPU/GPU parity. */
export const FINAL_DEFAULTS = { bloom: 0.05, vignette: 0.28, saturation: 1.06, contrast: 1.04,
  warmth: 0.02, grain: 0.012, sharpen: 0.45, exposure: 0.55 } as const;
export const luminance = (c: readonly number[]): number => c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
/** Source tap order a..i are the2px3x3 grid; j..m are the1px diagonals. */
export function bloomDown13(taps:readonly (readonly number[])[],first=false):number[]{
 const sum=(ids:number[],weight:number)=>[0,1,2].map(c=>ids.reduce((s,i)=>s+taps[i]![c]!,0)*weight);
 if(first){const groups=[[9,10,11,12],[0,1,3,4],[1,2,4,5],[3,4,6,7],[4,5,7,8]].map((ids,i)=>{
  const c=sum(ids,.25),k=(i===0?.5:.125)/(luminance(c)+1);return c.map(v=>v*k);
 });const s=[0,1,2].map(c=>groups.reduce((a,g)=>a+g[c]!,0));return s.map(v=>v/Math.max(1-luminance(s),.02));}
 return [0,1,2].map(c=>taps[4]![c]!*.125+[0,2,6,8].reduce((s,i)=>s+taps[i]![c]!,0)*.03125+[1,3,5,7].reduce((s,i)=>s+taps[i]![c]!,0)*.0625+[9,10,11,12].reduce((s,i)=>s+taps[i]![c]!,0)*.125);
}
/** Center and its north/west/east/south neighbors, before the HDR proxy. */
export function rcasHDR(center:readonly number[],neighbors:readonly (readonly number[])[],sharpen=.45,sky=false):number[]{
 const proxy=(c:readonly number[])=>c.map(v=>v/(Math.max(...c)+1)),e=proxy(center),n=neighbors.map(proxy);
 const lobes=[0,1,2].map(c=>{
  const mn=Math.min(...n.map(v=>v[c]!)),mx=Math.max(...n.map(v=>v[c]!));
  return Math.max(-Math.min(mn,e[c]!)/(mx*4+1e-5),(1-Math.max(mx,e[c]!))/(mn*4-4));
 });const lobe=Math.max(-.1875,Math.min(Math.max(...lobes),0))*sharpen*(sky?.3:1);
 const r=e.map((v,c)=>Math.max(0,(n.reduce((a,b)=>a+b[c]!,0)*lobe+v)/(lobe*4+1)));
 return r.map(v=>v/Math.max(1-Math.max(...r),.001));
}
export function acesFilmic(color: readonly number[], exposure = 0.55): number[] {
  const v = color.map(c => c * exposure / 0.6);
  const a = [0.59719*v[0]!+0.35458*v[1]!+0.04823*v[2]!, 0.076*v[0]!+0.90834*v[1]!+0.01566*v[2]!, 0.0284*v[0]!+0.13383*v[1]!+0.83777*v[2]!]
    .map(c => (c*(c+0.0245786)-0.000090537)/(c*(0.983729*c+0.432951)+0.238081));
  return [1.60475*a[0]!-0.53108*a[1]!-0.07367*a[2]!, -0.10208*a[0]!+1.10813*a[1]!-0.00605*a[2]!, -0.00327*a[0]!-0.07276*a[1]!+1.07602*a[2]!].map(c=>Math.max(0,Math.min(1,c)));
}
export function postHash(x:number,y:number,frame:number):number {
  let v=(Math.imul(x,1664525)+Math.imul(y,1013904223)+Math.imul(frame,2654435761))>>>0;
  v^=v>>>16;v=Math.imul(v,0x7feb352d);v^=v>>>15;v=Math.imul(v,0x846ca68b);v^=v>>>16;
  return (v>>>8)/16777216;
}
export function adaptExposure(current:number,average:number,dt:number,night=0,enabled=true):number {
  if(!enabled)return 1;
  const ratio=0.25/Math.max(average,1e-4),partial=ratio>1?ratio**0.8:ratio;
  const target=Math.max(0.6,Math.min(6+(2-6)*night,partial));
  const k=1-Math.exp(-dt*(target>current?1.6:1.1));
  return 2**(Math.log2(Math.max(current,1e-3))*(1-k)+Math.log2(target)*k);
}
export function gradeDisplay(input:readonly number[],uv:readonly number[],pixel:readonly number[],frame=0,adaptation=1):number[] {
  let c=input.map((v,i)=>v*adaptation*(i===0?1.02:i===2?0.98:1));
  const l=luminance(c);c=c.map(v=>Math.max(0,l+(v-l)*1.06));
  const radius=Math.hypot(uv[0]!-0.5,(uv[1]!-0.5)*0.8),t=Math.max(0,Math.min(1,(radius-0.25)/0.5));
  const vig=1-t*t*(3-2*t)*0.28;
  const x=pixel[0]!,y=pixel[1]!,n=(postHash(x,y,frame)+postHash(x+7919,y+104729,frame)-1)*0.5;
  c=c.map(v=>(v/0.18)**1.04*0.18*vig*(1+n*0.012));
  const dq=(postHash(x+31337,y+271,frame)+postHash(x+1013,y+65537,frame)-1)/255;
  return acesFilmic(c).map(v=>(v<=0.0031308?v*12.92:1.055*v**(1/2.4)-0.055)+dq);
}
