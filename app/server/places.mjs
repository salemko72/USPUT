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
  {
    id: "bistrik",
    name: "Bistrik",
    detail:
      "Područje Bistrika · orijentaciona tačka, potvrdi tačno mjesto susreta",
    lat: 43.8547,
    lng: 18.4331,
    kind: "area",
  },
  {
    id: "alifakovac",
    name: "Alifakovac",
    detail:
      "Područje Alifakovca · orijentaciona tačka, potvrdi tačno mjesto susreta",
    lat: 43.8572,
    lng: 18.4362,
    kind: "area",
  },
  {
    id: "bascarsija",
    name: "Baščaršija",
    detail:
      "Područje Baščaršije · orijentaciona tačka, potvrdi tačno mjesto susreta",
    lat: 43.8598,
    lng: 18.4314,
    kind: "area",
  },
  {
    id: "logavina",
    name: "Logavina",
    detail:
      "Područje Logavine · orijentaciona tačka, potvrdi tačno mjesto susreta",
    lat: 43.8638,
    lng: 18.4263,
    kind: "area",
  },
  {
    id: "katedrala",
    name: "Katedrala",
    detail:
      "Orijentir u pješačkoj zoni · nije potvrđeno mjesto zaustavljanja vozila",
    lat: 43.8594,
    lng: 18.4256,
    kind: "landmark",
  },
  {
    id: "kovacici",
    name: "Kovačići",
    detail:
      "Područje Kovačića · orijentaciona tačka, potvrdi tačno mjesto susreta",
    lat: 43.8502,
    lng: 18.4027,
    kind: "area",
  },
  {
    id: "sirokaca",
    name: "Širokača",
    detail:
      "Područje Širokače · orijentaciona tačka, potvrdi tačno mjesto susreta",
    lat: 43.85,
    lng: 18.4297,
    kind: "area",
  },
].map((place) => ({ ...place, city: "Sarajevo", countryCode: "BA" }));
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
