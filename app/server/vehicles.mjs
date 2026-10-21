import catalog from "./vehicle-catalog.json" with { type: "json" };
export const colors = [
  { id: "crna", name: "Crna", hex: "#262a29" },
  { id: "bijela", name: "Bijela", hex: "#fafafa" },
  { id: "siva", name: "Siva", hex: "#858b8b" },
  { id: "srebrna", name: "Srebrna", hex: "#c8cdd0" },
  { id: "zlatna", name: "Zlatna", hex: "#c5a45b" },
  { id: "plava", name: "Plava", hex: "#3f6ca3" },
  { id: "crvena", name: "Crvena", hex: "#b94743" },
  { id: "zelena", name: "Zelena", hex: "#4e755b" },
  { id: "smedja", name: "Smeđa", hex: "#866a50" },
  { id: "bez", name: "Bež", hex: "#d7c7a4" },
  { id: "zuta", name: "Žuta", hex: "#e8cf4c" },
  { id: "narandzasta", name: "Narandžasta", hex: "#d88a44" },
  { id: "ljubicasta", name: "Ljubičasta", hex: "#826a9b" },
  { id: "druga", name: "Druga", hex: "#c1bcae" },
];
const fold = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function validateVehicle(body) {
  const brand = catalog.brands.find((b) => b.id === body.makeId);
  const manual = body.makeId === "other";
  const make =
    manual && typeof body.make === "string" ? body.make.trim() : brand?.name;
  if (!make || make.length < 2 || make.length > 80)
    throw new TypeError("Odaberi marku vozila ili je unesi ručno.");
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model || model.length > 80)
    throw new TypeError("Unesi model vozila (najviše 80 znakova).");
  const canonical = brand?.models.find((m) => fold(m) === fold(model));
  if (!manual && !canonical && body.manualModel !== true)
    throw new TypeError("Odaberi model sa liste ili uključi ručni unos.");
  if (!colors.some((c) => c.id === body.color))
    throw new TypeError("Odaberi boju vozila.");
  return {
    makeId: manual ? "other" : brand.id,
    make,
    model: canonical || model,
    color: body.color,
    manualModel: !canonical,
  };
}
export const vehicleView = (r) =>
  r
    ? {
        id: r.id,
        makeId: r.make_id,
        make: r.make,
        model: r.model,
        color: r.color,
        manualModel: !!r.manual_model,
      }
    : null;
export const vehicleLabel = (v) =>
  `${v.make} ${v.model} · ${colors.find((c) => c.id === v.color)?.name || v.color}`;
