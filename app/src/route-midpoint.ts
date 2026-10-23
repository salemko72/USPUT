export function routeMidpoint(
  geometry: number[][],
): { lat: number; lng: number } | null {
  if (geometry.length < 2) return null;
  const distances = geometry.slice(1).map((b, i) => {
    const a = geometry[i];
    return Math.hypot(
      (b[0] - a[0]) * Math.cos(((a[1] + b[1]) * Math.PI) / 360),
      b[1] - a[1],
    );
  });
  let remaining = distances.reduce((n, d) => n + d, 0) / 2;
  for (let i = 0; i < distances.length; i++) {
    if (remaining <= distances[i]) {
      const a = geometry[i],
        b = geometry[i + 1],
        f = distances[i] ? remaining / distances[i] : 0;
      return {
        lat: Math.round((a[1] + (b[1] - a[1]) * f) * 1e5) / 1e5,
        lng: Math.round((a[0] + (b[0] - a[0]) * f) * 1e5) / 1e5,
      };
    }
    remaining -= distances[i];
  }
  return { lat: geometry.at(-1)![1], lng: geometry.at(-1)![0] };
}
