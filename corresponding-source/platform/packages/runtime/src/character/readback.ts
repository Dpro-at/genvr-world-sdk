/** GPU readbacks may align rows to 256 bytes. Canvas ImageData always needs tightly packed rows. */
export function previewRGBA(source: Uint8Array, width: number, height: number, flipY = false) {
  const rowBytes = width * 4;
  const stride = source.length === rowBytes * height ? rowBytes : Math.ceil(rowBytes / 256) * 256;
  if (source.length < (height - 1) * stride + rowBytes) throw new Error('Incomplete preview pixels.');
  const result = new Uint8ClampedArray(rowBytes * height);
  for (let y = 0; y < height; y++) result.set(source.subarray(y * stride, y * stride + rowBytes), (flipY ? height - y - 1 : y) * rowBytes);
  return result;
}
