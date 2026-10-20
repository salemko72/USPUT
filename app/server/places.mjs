export const places = [
  {
    id: "ilidza",
    name: "Ilidža",
    detail: "Tramvajski terminal",
    lat: 43.8293,
    lng: 18.3097,
  },
  {
    id: "nedzarici",
    name: "Nedžarići",
    detail: "Tramvajska stanica",
    lat: 43.8401,
    lng: 18.3445,
  },
  {
    id: "otoka",
    name: "Otoka",
    detail: "Kod tramvajske stanice",
    lat: 43.8485,
    lng: 18.3615,
  },
  {
    id: "cengic",
    name: "Čengić Vila",
    detail: "Kod tramvajske stanice",
    lat: 43.8507,
    lng: 18.373,
  },
  {
    id: "dolac",
    name: "Dolac Malta",
    detail: "Kod pošte",
    lat: 43.8526,
    lng: 18.3801,
  },
  {
    id: "pofalici",
    name: "Pofalići",
    detail: "Stanica kod poslovne zone",
    lat: 43.8557,
    lng: 18.3892,
  },
  {
    id: "grbavica",
    name: "Grbavica",
    detail: "Kod stadiona",
    lat: 43.8464,
    lng: 18.3874,
  },
  {
    id: "marijin",
    name: "Marijin Dvor",
    detail: "Kod tramvajske stanice",
    lat: 43.8553,
    lng: 18.4056,
  },
  {
    id: "skenderija",
    name: "Skenderija",
    detail: "Plato ispred centra",
    lat: 43.8531,
    lng: 18.4151,
  },
  {
    id: "centar",
    name: "Centar",
    detail: "Kod Velikog parka",
    lat: 43.8595,
    lng: 18.4189,
  },
];
export const getPlace = (id) => places.find((p) => p.id === id);
// Departure is interpreted as Sarajevo wall time. Intl resolves the daylight-saving offset.
export function departureMs(date, time) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time ?? "")
  )
    return NaN;
  const iso = `${date}T${time}:00Z`;
  const utc = Date.parse(iso);
  if (
    !Number.isFinite(utc) ||
    new Date(utc).toISOString().slice(0, 10) !== date
  )
    return NaN;
  let value = utc;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Sarajevo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
    const wall = Date.parse(parts.replace(" ", "T") + "Z");
    value += utc - wall;
  }
  const check = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sarajevo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return check === `${date} ${time}` ? value : NaN;
}
