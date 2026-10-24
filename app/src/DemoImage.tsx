import { t } from "./i18n";
import "./demo-image.css";
const cells: Record<string, number> = {
  "usput-demo-kerim-v1": 0,
  "usput-demo-senad-v1": 2,
  "usput-demo-vesna-v1": 1,
  "usput-demo-amar-v1": 0,
  "usput-demo-lejla-v1": 3,
  "usput-demo-damir-v1": 2,
  "usput-demo-putnica-ana-v1": 1,
  "usput-demo-putnik-marko-v1": 0,
};
const cars: Record<string, number> = {
  "usput-demo-kerim-v1": 0,
  "usput-demo-senad-v1": 1,
  "usput-demo-vesna-v1": 3,
  "usput-demo-amar-v1": 2,
  "usput-demo-lejla-v1": 1,
  "usput-demo-damir-v1": 0,
};
export function hasDemoImage(id?: string) {
  return !!id && Object.hasOwn(cells, id);
}
export function DemoImage({
  userId,
  car = false,
}: {
  userId: string;
  car?: boolean;
}) {
  const cell = (car ? cars : cells)[userId];
  if (cell === undefined) return null;
  return (
    <span
      className="demo-generated-image"
      role="img"
      aria-label={t(
        car
          ? "AI ilustracija demo automobila"
          : "AI ilustracija izmišljene osobe",
      )}
      title={t(
        "Demo ilustracija; nije stvarna osoba ni fotografija konkretnog vozila.",
      )}
      style={{ backgroundPosition: `${(cell * 100) / 3}% ${car ? 100 : 0}%` }}
    />
  );
}
