import type { HumanBody } from './generate.js';

/** Fit closure to the current eye opening, preserving eye/lash topology and the rest of the face. */
export function fitEyelidBlink(body: HumanBody): Float32Array {
  const {positions: p, region, quads} = body;
  const edges = new Map<string, number>(), adjacent = new Map<number, Set<number>>();
  for (let q = 0; q < quads.length; q += 4) {
    const ids = Array.from(quads.subarray(q, q + 4));
    if (ids.some(v => region[v] !== 0)) continue;
    for (let k = 0; k < 4; k++) {
      const a = ids[k]!, b = ids[(k + 1) % 4]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
      if (!adjacent.has(a)) adjacent.set(a, new Set());
      if (!adjacent.has(b)) adjacent.set(b, new Set());
      adjacent.get(a)!.add(b); adjacent.get(b)!.add(a);
    }
  }
  const output = new Float32Array(p.length);
  const contour = new Float32Array(region.length * 2).fill(1);body.lidDistance=contour;
  for (const side of ['left', 'right'] as const) {
    const centre = body.face[`${side}Eye`]; if (!centre) continue;
    const rim = new Set<number>();
    const rimNeighbors = new Map<number, number[]>();
    for (const [key, uses] of edges) {
      if (uses !== 1) continue;
      const ids = key.split(':').map(Number);
      if (ids.every(v => Math.hypot(p[v * 3]! - centre[0], p[v * 3 + 1]! - centre[1], p[v * 3 + 2]! - centre[2]) < .035)) {
        const [a,b]=ids as [number,number];
        rimNeighbors.set(a,[...(rimNeighbors.get(a)??[]),b]);rimNeighbors.set(b,[...(rimNeighbors.get(b)??[]),a]);
      }
      for (const v of ids) if (Math.hypot(p[v * 3]! - centre[0], p[v * 3 + 1]! - centre[1], p[v * 3 + 2]! - centre[2]) < .035) rim.add(v);
    }
    if (rim.size < 12) return body.blink;
    // These measured rim points replace coarse helper boxes for the drawn lid contour.
    const middleY = [...rim].reduce((sum,v) => sum+p[v*3+1]!,0) / rim.size;
    for (const [part, upper] of [['UpperLid',true],['LowerLid',false]] as const) {
      const candidates = [...rim].filter(v => (p[v*3+1]! > middleY) === upper).sort((a,b) => Math.abs(p[a*3]! - centre[0]) - Math.abs(p[b*3]! - centre[0])).slice(0,4);
      if (candidates.length) body.face[`${side}${part}`] = [0,1,2].map(axis => candidates.reduce((sum,v) => sum+p[v*3+axis]!,0) / candidates.length) as [number,number,number];
    }
    const start = [...rim].reduce((a,b) => p[a*3]! < p[b*3]! ? a : b);
    const end = [...rim].reduce((a,b) => p[a*3]! > p[b*3]! ? a : b);
    const paths = (rimNeighbors.get(start)??[]).map(first => {
      const path=[start,first];
      while(path.at(-1)!==end && path.length<=rim.size){
        const at=path.at(-1)!, previous=path.at(-2)!;
        const next=(rimNeighbors.get(at)??[]).find(v=>v!==previous);
        if(next===undefined||path.includes(next))break;
        path.push(next);
      }
      return path;
    });
    if(paths.length!==2 || paths.some(path=>path.at(-1)!==end)) return body.blink;
    paths.sort((a,b)=>b.reduce((sum,v)=>sum+p[v*3+1]!,0)/b.length-a.reduce((sum,v)=>sum+p[v*3+1]!,0)/a.length);
    const upperPath=paths[0]!, lowerPath=paths[1]!.slice().sort((a,b)=>p[a*3]!-p[b*3]!);
    // Edge distances paint a thin actual lid margin instead of a guessed ellipse on the face.
    for(let v=0;v<region.length;v++) {
      if(region[v]!==0 || Math.sign(p[v*3]!)!==Math.sign(centre[0]))continue;
      if(Math.hypot(p[v*3]!-centre[0],p[v*3+1]!-centre[1],p[v*3+2]!-centre[2])>.05)continue;
      for(const [axis,path] of [[0,upperPath],[1,lowerPath]] as const){
        let distance=1;
        for(const n of path)distance=Math.min(distance,Math.hypot(p[v*3]!-p[n*3]!,p[v*3+1]!-p[n*3+1]!,p[v*3+2]!-p[n*3+2]!));
        contour[v*2+axis]=distance;
      }
    }
    const angles = new Map<number, number>([...rim].map(v=>[v,0]));
    for(const v of upperPath){
      if(v===start||v===end)continue;
      const x=p[v*3]!, y=p[v*3+1]!, z=p[v*3+2]!;
      let lowerY=p[lowerPath[0]!*3+1]!;
      for(let i=1;i<lowerPath.length;i++){
        const a=lowerPath[i-1]!,b=lowerPath[i]!;
        if(x>p[b*3]!)continue;
        const t=Math.max(0,Math.min(1,(x-p[a*3]!)/Math.max(.000001,p[b*3]!-p[a*3]!)));
        lowerY=p[a*3+1]!*(1-t)+p[b*3+1]!*t;break;
      }
      const ry=y-centre[1],rz=z-centre[2],radius=Math.hypot(ry,rz);
      const targetY=Math.max(-radius+.0001,lowerY-centre[1]-.0001);
      const targetZ=Math.sqrt(Math.max(0,radius*radius-targetY*targetY));
      angles.set(v,Math.atan2(ry*targetZ-rz*targetY,ry*targetY+rz*targetZ));
    }
    // Solve a smooth angular field on the socket with the rim fixed and the brow held still.
    const top = Math.max(...upperPath.map(v=>p[v*3+1]!)) + .009;
    const unknown: number[] = [];
    for(let v=0;v<region.length;v++) {
      if(region[v]!==0 || rim.has(v) || Math.sign(p[v*3]!)!==Math.sign(centre[0]))continue;
      if(p[v*3+1]!>top || p[v*3+1]!<centre[1]-.027 || p[v*3+2]!<centre[2]-.003)continue;
      if(Math.hypot(p[v*3]!-centre[0],p[v*3+1]!-centre[1],p[v*3+2]!-centre[2])>.036)continue;
      angles.set(v,0);unknown.push(v);
    }
    for(let iteration=0;iteration<220;iteration++) {
      let change=0;
      for(const v of unknown) {
        const neighbors=adjacent.get(v);if(!neighbors?.size)continue;
        let sum=0;for(const n of neighbors)sum+=angles.get(n)??0;
        const before=angles.get(v)!;
        const after=Math.max(0,before+(sum/neighbors.size-before)*1.25);
        angles.set(v,after);change=Math.max(change,Math.abs(after-before));
      }
      if(change<.00001)break;
    }
    // Lash cards inherit the closest rim's rotation, so they stay attached during the blink.
    for (let v = 0; v < region.length; v++) {
      if (region[v] !== 3 || Math.sign(p[v * 3]!) !== Math.sign(centre[0])) continue;
      let closest = -1, distance = Infinity;
      for (const n of rim) {
        if ((angles.get(n) ?? 0) <= 0) continue;
        const d = Math.hypot(p[v * 3]! - p[n * 3]!, p[v * 3 + 1]! - p[n * 3 + 1]!, p[v * 3 + 2]! - p[n * 3 + 2]!);
        if (d < distance) { closest = n; distance = d; }
      }
      if (closest >= 0) angles.set(v, angles.get(closest)!);
    }
    for (const [v, angle] of angles) {
      const y = p[v * 3 + 1]! - centre[1], z = p[v * 3 + 2]! - centre[2];
      output[v * 3 + 1] = y * Math.cos(angle) - z * Math.sin(angle) - y;
      output[v * 3 + 2] = y * Math.sin(angle) + z * Math.cos(angle) - z;
    }
  }
  return output;
}
