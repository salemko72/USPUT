// Local distance minima along the entire polyline retain separate visits to one location.
export function routeProjections(point, coordinates, radius = Infinity) {
  const k = 111195,
    cos = Math.cos((coordinates[0][1] * Math.PI) / 180),
    samples = [];
  let along = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1],
      b = coordinates[i],
      ax = (a[0] - point.lng) * k * cos,
      ay = (a[1] - point.lat) * k,
      bx = (b[0] - point.lng) * k * cos,
      by = (b[1] - point.lat) * k;
    const dx = bx - ax,
      dy = by - ay,
      length = Math.hypot(dx, dy);
    if (!length) continue;
    const fraction = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (length * length)),
    );
    const projection = {
      distance: Math.hypot(ax + fraction * dx, ay + fraction * dy),
      along: along + fraction * length,
      lat: a[1] + fraction * (b[1] - a[1]),
      lng: a[0] + fraction * (b[0] - a[0]),
    };
    const previous = samples.at(-1);
    if (previous && Math.abs(previous.along - projection.along) < 0.01) {
      if (projection.distance < previous.distance)
        samples[samples.length - 1] = projection;
    } else samples.push(projection);
    along += length;
  }
  return samples.filter(
    (p, i) =>
      p.distance <= radius &&
      (!samples[i - 1] || p.distance <= samples[i - 1].distance + 0.001) &&
      (!samples[i + 1] || p.distance <= samples[i + 1].distance + 0.001),
  );
}
