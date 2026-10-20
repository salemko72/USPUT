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
import type { Service, User } from "./types";
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
  onReset: () => void;
  onToast: (s: string) => void;
}) {
  const [name, setName] = useState(user.name),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const u = await service.profile(name);
      onUser(u);
      onToast("Ime je sačuvano.");
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
          <span className="eyebrow">TVOJE MJESTO U PRIČI</span>
          <h1>
            Hej, {user.name.split(" ")[0]}
            <span className="punctuation">.</span>
          </h1>
          <p>Dobro društvo počinje tobom.</p>
        </div>
      </header>
      <div className="profile-layout">
        <section className="profile-card">
          <div className="profile-identity">
            <Avatar name={user.name} size="large" />
            <div>
              <h2>{user.name}</h2>
              <span className="small-pill">
                {demo ? "Demo profil" : "Prvi krug · beta"}
              </span>
            </div>
          </div>
          <form onSubmit={save}>
            <label className="field-label">
              Tvoje ime
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
              Email
              <div className="input-wrap disabled">
                <Mail size={18} />
                <input value={user.email || ""} readOnly type="email" />
              </div>
            </label>
            <p className="fine-print">
              Email je privatan i nije vidljiv saputnicima.{" "}
              {user.provider === "google"
                ? "Prijava je povezana s Googleom."
                : "Email potvrda još nije uključena."}
            </p>
            <ErrorBox error={error} />
            <Button variant="lime" busy={busy} type="submit">
              Sačuvaj promjene
            </Button>
          </form>
          <button className="logout-button" onClick={logout} disabled={busy}>
            <LogOut size={18} />
            Odjavi se
            <ArrowUpRight size={18} />
          </button>
        </section>
        <div className="profile-notes">
          <section className="community-card">
            <Leaf size={30} />
            <h2>
              Manje praznih
              <br />
              mjesta.
              <br />
              Više dobrih jutara.
            </h2>
            <p>Tvoja rutina ostaje tvoja. USPUT joj dodaje dobro društvo.</p>
            <span className="eyebrow">BEZ NAPLATE. S RAZLOGOM.</span>
          </section>
          <button className="settings-row" onClick={() => setModal("privacy")}>
            <ShieldCheck size={22} />
            <span>
              <strong>Privatnost i beta pravila</strong>
              <small>Šta čuvamo i gdje smo sada</small>
            </span>
            <ArrowUpRight size={20} />
          </button>
          {demo && (
            <button className="settings-row" onClick={() => setModal("reset")}>
              <RotateCcw size={22} />
              <span>
                <strong>Počni demo ispočetka</strong>
                <small>Vrati probne vožnje i profil</small>
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
              ? "Ponovo od početka?"
              : "Tvoji podaci, tvoja stvar."
          }
          onClose={() => setModal("")}
        >
          {modal === "reset" ? (
            <>
              <p>
                Ovo briše samo probne dogovore i promjene demo profila iz ovog
                preglednika.
              </p>
              <Button
                onClick={() => {
                  onReset();
                  setModal("");
                }}
              >
                Resetuj demo
              </Button>
            </>
          ) : (
            <>
              <p>USPUT je razvojna beta. Stvarne vožnje još ne organizujemo.</p>
              <p>
                Za probni račun čuvamo ime, email, hash lozinke, sesiju, ponude
                i dogovore. Email nije javno prikazan; ime i podaci o ponudi
                jesu dostupni prijavljenim korisnicima. Dogovore vide samo
                učesnici.
              </p>
              <p>
                Nema automatskog praćenja, naplate niti provjere identiteta.
                Demo ostaje u ovom pregledniku. Za brisanje probnog računa
                kontaktiraj administratora projekta.
              </p>
              <p>
                Prije stvarne probe objavit ćemo odgovornu osobu, rokove
                čuvanja, podršku i završna pravila.
              </p>
              <Button onClick={() => setModal("")}>Razumijem</Button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
