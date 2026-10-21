import { t } from "./i18n";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Home,
  Users,
  UserRound,
  X,
  LoaderCircle,
  Car,
  Check,
  MapPin,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useCurrentUserPhoto } from "./AvatarPhotoContext";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={"brand " + (light ? "light" : "")}>
      USPUT
      <span className="brand-dot" />
    </span>
  );
}
export function Button({
  children,
  onClick,
  type = "button",
  variant = "dark",
  arrow = false,
  disabled = false,
  busy = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "dark" | "lime" | "outline" | "white";
  arrow?: boolean;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      className={`button ${variant} ${className}`}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? <LoaderCircle className="spin" size={20} /> : children}
      {arrow && !busy && (
        <span className="button-arrow">
          <ArrowUpRight size={22} />
        </span>
      )}
    </button>
  );
}
export function Avatar({
  name,
  userId,
  size = "normal",
}: {
  name: string;
  userId?: string;
  size?: "normal" | "large" | "small";
}) {
  const photo = useCurrentUserPhoto(userId);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span
      aria-hidden="true"
      className={`avatar ${size} tone-${name.charCodeAt(0) % 4}`}
    >
      {photo && photo.url !== failedUrl ? (
        <img
          key={photo.id}
          src={photo.url}
          alt=""
          onError={() => setFailedUrl(photo.url)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "inherit",
          }}
        />
      ) : (
        name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
      )}
    </span>
  );
}
export function Back({
  onClick,
  label = t("Nazad"),
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button className="icon-button" aria-label={label} onClick={onClick}>
      <ArrowLeft size={21} />
    </button>
  );
}
export function Dock({
  active,
  onNav,
}: {
  active: string;
  onNav: (s: string) => void;
}) {
  return (
    <nav className="dock" aria-label={t("Glavna navigacija")}>
      {[
        [Home, t("Početna"), "home"],
        [Users, t("Vožnje"), "trips"],
        [UserRound, t("Profil"), "profile"],
      ].map(([Icon, label, path]) => {
        const I = Icon as typeof Home;
        return (
          <button
            key={String(path)}
            className={active === path ? "active" : ""}
            aria-current={active === path ? "page" : undefined}
            onClick={() => onNav(String(path))}
          >
            <span>
              <I size={22} />
            </span>
            <small>{String(label)}</small>
          </button>
        );
      })}
    </nav>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="modal-shade"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t(title)}
      >
        <button
          className="icon-button modal-close"
          aria-label={t("Zatvori")}
          autoFocus
          onClick={onClose}
        >
          <X />
        </button>
        <h2>{t(title)}</h2>
        {children}
      </section>
    </div>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error-box" role="alert">
      {t(error)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      <span>{t("Samo trenutak…")}</span>
    </div>
  );
}
export function Empty({
  title,
  children,
  icon = "car",
}: {
  title: string;
  children: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        {icon === "check" ? <Check size={32} /> : <Car size={32} />}
      </span>
      <h2>{t(title)}</h2>
      {children}
    </div>
  );
}
export function RouteLine({ from, to }: { from: string; to: string }) {
  return (
    <div className="route-line">
      <div>
        <span className="route-dot" />
        {from}
      </div>
      <i />
      <div>
        <MapPin size={16} />
        {to}
      </div>
    </div>
  );
}
export function Toast({ text }: { text: string }) {
  return text ? (
    <div className="toast" role="status">
      <Check size={18} />
      {t(text)}
    </div>
  ) : null;
}
export { ArrowRight };
