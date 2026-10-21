import { t } from "./i18n";
import { useEffect, useState } from "react";
import {
  Camera,
  ImagePlus,
  LoaderCircle,
  Trash2,
  LockKeyhole,
  UserRound,
  Car,
  ZoomIn,
} from "lucide-react";
import { Button, ErrorBox, Modal } from "./ui";
import {
  preparePhoto,
  getOwnPhotos,
  savePhoto,
  removePhoto,
  getRidePhotos,
  getDemoRidePhotos,
} from "./photo-client";
import type { PhotoKind, PhotoMeta, RidePhotos } from "./photo-client";
export function OwnPhoto({
  kind,
  demo,
  vehicleLabel = "",
  vehicleReady = true,
}: {
  kind: PhotoKind;
  demo: boolean;
  vehicleLabel?: string;
  vehicleReady?: boolean;
}) {
  const [photo, setPhoto] = useState<PhotoMeta | null>(null),
    [prepared, setPrepared] = useState<Awaited<
      ReturnType<typeof preparePhoto>
    > | null>(null),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [available, setAvailable] = useState(true),
    [removing, setRemoving] = useState(false);
  useEffect(() => {
    let active = true;
    getOwnPhotos(demo, vehicleLabel)
      .then((p) => {
        if (active) {
          setPhoto(p[kind]);
          setAvailable(p.available);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [demo, kind, vehicleLabel]);
  useEffect(() => {
    if (!prepared) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(prepared.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);
  async function choose(file?: File) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      setPrepared(await preparePhoto(file, kind));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!prepared) return;
    setBusy(true);
    setError("");
    try {
      setPhoto(await savePhoto(kind, prepared.blob, demo, vehicleLabel));
      setPrepared(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await removePhoto(kind, demo);
      setPhoto(null);
      setRemoving(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const avatar = kind === "avatar";
  return (
    <section
      className={"own-photo " + (avatar ? "avatar-photo" : "vehicle-photo")}
    >
      <header>
        <span className="eyebrow">
          {avatar ? t("FOTOGRAFIJA LICA") : t("FOTOGRAFIJA TVOG AUTA")}
        </span>
        <Camera size={18} />
      </header>
      <div className="own-photo-row">
        {photo ? (
          <img
            src={photo.url}
            alt={
              avatar
                ? t("Tvoja profilna fotografija")
                : t("Fotografija tvog automobila")
            }
            className={avatar ? "round" : ""}
          />
        ) : (
          <span className={"photo-placeholder " + (avatar ? "round" : "")}>
            {avatar ? <UserRound size={27} /> : <Car size={32} />}
          </span>
        )}
        <div>
          <strong>
            {avatar
              ? t("Da se lakše prepoznate.")
              : t("Baš auto kojim dolaziš.")}
          </strong>
          <p>
            {avatar
              ? t("Jasno lice, bez drugih osoba.")
              : t(
                  "Sprijeda i malo sa strane. Bez prolaznika i privatne adrese u kadru.",
                )}
          </p>
          <label
            className={
              "photo-file-button " +
              (busy || !available || !vehicleReady ? "disabled" : "")
            }
          >
            <ImagePlus size={14} />
            {photo ? t("Promijeni fotografiju") : t("Dodaj fotografiju")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              aria-label={
                avatar
                  ? t("Odaberi profilnu fotografiju")
                  : t("Odaberi fotografiju automobila")
              }
              disabled={busy || !available || !vehicleReady}
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {photo && (
          <button
            className="photo-remove"
            aria-label={
              avatar
                ? t("Ukloni profilnu fotografiju")
                : t("Ukloni fotografiju automobila")
            }
            onClick={() => setRemoving(true)}
            disabled={busy}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {busy && !prepared && (
        <div className="photo-loading">
          <LoaderCircle className="spin" size={15} />
          {t(" Pripremamo malu sliku… ")}
        </div>
      )}
      {!available && (
        <p className="fine-print">
          {t(
            " Skladište slika se priprema. Ostali dijelovi profila su dostupni. ",
          )}
        </p>
      )}
      {!vehicleReady && (
        <p className="fine-print">
          {t("Prvo dodaj marku, model i boju vozila.")}
        </p>
      )}
      <div className="photo-privacy">
        <LockKeyhole size={12} />
        {demo
          ? t("Demo slika ostaje u ovom pregledniku.")
          : t("Saputnici vide sliku tek nakon potvrde dogovora.")}
      </div>
      <ErrorBox error={error} />
      {prepared && (
        <Modal
          title={
            avatar
              ? t("Vidi li se lice jasno?")
              : t("Je li auto prepoznatljiv?")
          }
          onClose={() => {
            if (!busy) setPrepared(null);
          }}
        >
          <img
            className={"photo-preflight " + (avatar ? "round" : "")}
            src={preview}
            alt={t("Pregled kompresovane fotografije")}
          />
          <div className="photo-stats">
            <span>WebP</span>
            <span>{Math.max(1, Math.round(prepared.blob.size / 1024))} KB</span>
            <span>
              {prepared.width} × {prepared.height}
            </span>
          </div>
          <p>
            {t(
              " Ovo je slika koja se šalje. Original ostaje kod tebe; GPS i ostali metapodaci nisu uključeni. ",
            )}
          </p>
          <ErrorBox error={error} />
          <Button variant="lime" onClick={save} busy={busy}>
            {t(" Sačuvaj fotografiju ")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setPrepared(null)}
            disabled={busy}
          >
            {t(" Odaberi drugi kadar ")}
          </Button>
        </Modal>
      )}
      {removing && (
        <Modal
          title={t("Ukloniti fotografiju?")}
          onClose={() => setRemoving(false)}
        >
          <p>
            {t(
              " Drugi korisnici je više neće moći učitati iz aplikacije. Već preuzetu kopiju nije moguće povući s tuđeg uređaja. ",
            )}
          </p>
          <Button onClick={remove} busy={busy}>
            {t(" Da, ukloni fotografiju ")}
          </Button>
          <Button variant="outline" onClick={() => setRemoving(false)}>
            {t(" Zadrži fotografiju ")}
          </Button>
        </Modal>
      )}
    </section>
  );
}
export function ConnectionPhotos({
  rideId,
  demo,
  ownDriver,
  vehicleLabel,
  phase,
  showVehicle = true,
}: {
  rideId: string;
  demo: boolean;
  ownDriver: boolean;
  vehicleLabel: string;
  phase: string;
  showVehicle?: boolean;
}) {
  const [photos, setPhotos] = useState<RidePhotos | null>(null),
    [zoom, setZoom] = useState<PhotoMeta | null>(null);
  useEffect(() => {
    let alive = true;
    setPhotos(null);
    if (demo) {
      setPhotos(getDemoRidePhotos(ownDriver, vehicleLabel));
      return;
    }
    getRidePhotos(rideId)
      .then((p) => {
        if (alive) setPhotos(p);
      })
      .catch(() => {
        if (alive) setPhotos(null);
      });
    return () => {
      alive = false;
    };
  }, [rideId, demo, ownDriver, vehicleLabel, phase]);
  if (!photos) return null;
  const face = ownDriver ? photos.passengerAvatar : photos.driverAvatar;
  return (
    <section className="connection-photos">
      <header>
        <span className="eyebrow">{t("PREPOZNAJTE SE")}</span>
        <LockKeyhole size={14} />
      </header>
      <div className="recognition-person">
        {face ? (
          <button
            aria-label={t("Povećaj fotografiju saputnika")}
            onClick={() => setZoom(face)}
          >
            <img
              src={face.url}
              alt={
                ownDriver ? t("Fotografija putnika") : t("Fotografija vozača")
              }
            />
          </button>
        ) : (
          <span className="photo-placeholder round">
            <UserRound size={25} />
          </span>
        )}
        <div>
          <strong>{ownDriver ? t("Tvoj saputnik") : t("Tvoj vozač")}</strong>
          <p>
            {face
              ? t("Fotografija dostupna samo za potvrđen dogovor.")
              : t("Profilna fotografija još nije dodana.")}
          </p>
        </div>
      </div>
      {showVehicle &&
        !ownDriver &&
        (photos.vehicle ? (
          <button
            className="recognition-car"
            onClick={() => setZoom(photos.vehicle)}
            aria-label={t("Povećaj fotografiju automobila")}
          >
            <img
              src={photos.vehicle.url}
              alt={t("Automobil za dogovorenu vožnju")}
            />
            <span>
              <ZoomIn size={15} />
              {t(" Pogledaj auto ")}
            </span>
          </button>
        ) : (
          <div className="recognition-no-car">
            <Car size={23} />
            <p>{t("Vozač još nije dodao fotografiju ovog auta.")}</p>
          </div>
        ))}
      <p className="fine-print">
        {t(
          " Fotografija pomaže prepoznavanju. Nije potvrda identiteta ili vlasništva. ",
        )}
      </p>
      {zoom && (
        <Modal title={t("Za lakši susret.")} onClose={() => setZoom(null)}>
          <img
            className="photo-zoom"
            src={zoom.url}
            alt={t("Povećana fotografija za dogovoreni susret")}
          />
        </Modal>
      )}
    </section>
  );
}
