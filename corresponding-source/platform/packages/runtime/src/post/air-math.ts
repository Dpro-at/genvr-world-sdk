/** Tidewater AirHaze/PostFX equations, MIT, DRG Software Solutions LLC (4811ba48).
 * Standard depth adaptation lives in the GPU pass; these physical quantities are coordinate independent. */
export const HAZE = { marineSigma: 1.5e-4, marineHeight: 110, aerosolSigma: 3.2e-5,
  aerosolHeight: 1400, density: 1.6, steps: 16, marchDistance: 2500, near: 900, far: 60000 } as const;
export function layerOpticalDepth(sigma: number, height: number, cameraHeight: number, vertical: number, distance: number): number {
  const k = vertical * distance / height;
  return Math.exp(-cameraHeight / height) * sigma *
    (Math.abs(k) < 1e-3 ? distance : -height * Math.expm1(-k) / vertical);
}
export function hazeInScatter(cameraHeight: number, vertical: number, distance: number, density: number = HAZE.density): number {
  return -Math.expm1(-(layerOpticalDepth(HAZE.marineSigma, HAZE.marineHeight, cameraHeight, vertical, distance) +
    layerOpticalDepth(HAZE.aerosolSigma, HAZE.aerosolHeight, cameraHeight, vertical, distance)) * density);
}
export function hazePhase(cosine: number): number {
  const g = 0.62, g2 = g * g;
  return 0.7 * 3 * (1 - g2) / (8 * Math.PI * (2 + g2)) * (cosine * cosine + 1) /
    Math.pow(Math.max(1 + g2 - cosine * 2 * g, 1e-4), 1.5) + 0.3 / (4 * Math.PI);
}
export function marchHaze(cameraHeight: number, vertical: number, distance: number, jitter: number,
  visibility: (distance: number) => number, density: number = HAZE.density): [number, number] {
  const end = Math.min(distance, HAZE.marchDistance);
  let lit = 0, all = 0, tau = 0, previous = 0;
  for (let i = 0; i < HAZE.steps; i++) {
    const u = (i + jitter) / HAZE.steps, t = u * u * end, dt = u * 2 / HAZE.steps * end;
    const height = Math.max(cameraHeight + vertical * t, 0);
    const sigma = (Math.exp(-height / HAZE.marineHeight) * HAZE.marineSigma +
      Math.exp(-height / HAZE.aerosolHeight) * HAZE.aerosolSigma) * density;
    tau += sigma * (t - previous); previous = t;
    const weight = sigma * Math.exp(-tau) * dt;
    all += weight; lit += weight * visibility(t);
  }
  return [lit / Math.max(all, 1e-12), all / Math.max(hazeInScatter(Math.max(cameraHeight, 0), vertical, end, density), 1e-12)];
}
export function aoDepthWeight(relative: number): number { return 1 / (relative * 40 + 1) ** 2; }
export function aoMultiBounce(ao: number): number { return Math.max(ao, ((ao * 0.382 - 1.036) * ao + 1.654) * ao); }
export function historyAccepts(previousDistance: number, expectedDistance: number): boolean {
  return Math.abs(previousDistance - expectedDistance) < expectedDistance * 0.05 + 0.3;
}

