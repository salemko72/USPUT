import { t } from "./i18n";
import { OwnPhoto } from "./Photos";
import { vehicleDescription } from "./VehicleManager";
import { VehicleManager } from "./VehicleManager";
import { useState } from "react";
import {
  LogOut,
  Mail,
  ShieldCheck,
  Leaf,
  ArrowUpRight,
  RotateCcw,
  UserRound,
} from "lucide-react";
import type { Service, User, Vehicle } from "./types";
import { Avatar, Button, ErrorBox, Modal } from "./ui";
export function Profile({
  user,
  service,
  demo,
  onUser,
  onLogout,
  onReset,
  onToast,
}: {
  user: User;
  service: Service;
  demo: boolean;
  onUser: (u: User) => void;
  onLogout: () => Promise<void>;
  onReset?: () => void;
  onToast: (s: string) => void;
}) {
  const [name, setName] = useState(user.name),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(""),
    [vehicle, setVehicle] = useState<Vehicle | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await service.profile(name);
      onUser(u);
      onToast(t("Ime je sačuvano."));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await onLogout();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="profile-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t("TVOJE MJESTO U PRIČI")}</span>
          <h1>
            {t(" Hej, ")}
            {user.name.split(" ")[0]}
            <span className="punctuation">.</span>
          </h1>
          <p>{t("Dobro društvo počinje tobom.")}</p>
        </div>
      </header>
      <div className="profile-layout">
        <section className="profile-card">
          <div className="profile-identity">
            <Avatar name={user.name} size="large" />
            <div>
              <h2>{user.name}</h2>
              <span className="small-pill">
                {demo ? t("Demo profil") : t("Prvi krug · beta")}
              </span>
            </div>
          </div>
          <form onSubmit={save}>
            <label className="field-label">
              {t(" Tvoje ime ")}
              <div className="input-wrap">
                <UserRound size={18} />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={60}
                  required
                  autoComplete="given-name"
                />
              </div>
            </label>
            <label className="field-label">
              {t(" Email ")}
              <div className="input-wrap disabled">
                <Mail size={18} />
                <input value={user.email || ""} readOnly type="email" />
              </div>
            </label>
            <p className="fine-print">
              {t(" Email je privatan i nije vidljiv saputnicima.")}{" "}
              {user.provider === "google"
                ? t("Prijava je povezana s Googleom.")
                : t("Email potvrda još nije uključena.")}
            </p>
            <ErrorBox error={error} />
            <Button variant="lime" busy={busy} type="submit">
              {t(" Sačuvaj promjene ")}
            </Button>
          </form>
          <OwnPhoto kind="avatar" demo={demo} />
          <VehicleManager service={service} onChange={setVehicle} />
          <OwnPhoto
            kind="vehicle"
            demo={demo}
            vehicleReady={!!vehicle}
            vehicleLabel={vehicle ? vehicleDescription(vehicle) : ""}
          />
          <button className="logout-button" onClick={logout} disabled={busy}>
            <LogOut size={18} />
            {t(" Odjavi se ")}
            <ArrowUpRight size={18} />
          </button>
        </section>
        <div className="profile-notes">
          <section className="community-card">
            <Leaf size={30} />
            <h2>
              {t(" Manje praznih ")}
              <br />
              {t(" mjesta. ")}
              <br />
              {t(" Više dobrih jutara. ")}
            </h2>
            <p>
              {t("Tvoja rutina ostaje tvoja. USPUT joj dodaje dobro društvo.")}
            </p>
            <span className="eyebrow">{t("BEZ NAPLATE. S RAZLOGOM.")}</span>
          </section>
          <button className="settings-row" onClick={() => setModal("privacy")}>
            <ShieldCheck size={22} />
            <span>
              <strong>{t("Privatnost i beta pravila")}</strong>
              <small>{t("Šta čuvamo i gdje smo sada")}</small>
            </span>
            <ArrowUpRight size={20} />
          </button>
          {demo && (
            <button className="settings-row" onClick={() => setModal("reset")}>
              <RotateCcw size={22} />
              <span>
                <strong>{t("Počni demo ispočetka")}</strong>
                <small>{t("Vrati probne vožnje i profil")}</small>
              </span>
              <ArrowUpRight size={20} />
            </button>
          )}
        </div>
      </div>
      {modal && (
        <Modal
          title={
            modal === "reset"
              ? t("Ponovo od početka?")
              : t("Tvoji podaci, tvoja stvar.")
          }
          onClose={() => setModal("")}
        >
          {modal === "reset" ? (
            <>
              <p>
                {t(
                  " Ovo briše samo probne dogovore i promjene demo profila iz ovog preglednika. ",
                )}
              </p>
              <Button
                onClick={() => {
                  onReset?.();
                  setModal("");
                }}
              >
                {t(" Resetuj demo ")}
              </Button>
            </>
          ) : (
            <>
              <p>
                {t(
                  "USPUT je razvojna beta. Stvarne vožnje još ne organizujemo.",
                )}
              </p>
              <p>
                {t(
                  " Za probni račun čuvamo ime, email, hash lozinke, sesiju, ponude i dogovore. Email nije javno prikazan; ime i podaci o ponudi jesu dostupni prijavljenim korisnicima. Dogovore vide samo učesnici. ",
                )}
              </p>
              <p>
                {t(
                  " Ako dodaš fotografije, čuvamo samo male kompresovane kopije u privatnom skladištu u EU. Saputnik ih može učitati tek nakon potvrđenog dogovora; otkazivanje ili završetak ukida pristup. Sliku možeš ukloniti u profilu. Već preuzetu kopiju nije moguće povući. ",
                )}
              </p>
              <p>
                {t(
                  " Za procjenu kompatibilnih ruta OSRM servisu šaljemo koordinate javnih probnih mjesta, bez tvog imena ili emaila. Vrijeme vožnje je procjena bez podataka o gužvi. ",
                )}
              </p>
              <p>
                {t(
                  "Za pretragu adresa šaljemo unesenu ulicu i grad geokoderu. Za putanje šaljemo koordinate servisu za cestovno i pješačko rutiranje, bez tvog imena ili emaila. Objavljena ponuda prikazuje približne lokacije koje potvrdiš.",
                )}
              </p>
              <p>
                {t(
                  " Nema automatskog praćenja, naplate niti provjere identiteta. Demo ostaje u ovom pregledniku. Za brisanje probnog računa kontaktiraj administratora projekta. ",
                )}
              </p>
              <p>
                {t(
                  " Prije stvarne probe objavit ćemo odgovornu osobu, rokove čuvanja, podršku i završna pravila. ",
                )}
              </p>
              <Button onClick={() => setModal("")}>{t("Razumijem")}</Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
