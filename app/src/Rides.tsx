import { ConnectionPhotos } from "./Photos";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Clock3,
  Car,
  UserRound,
  MapPin,
  Check,
  Footprints,
  Plus,
  RefreshCw,
  ArrowRight,
  CheckCheck,
  Leaf,
  X,
} from "lucide-react";
import type {
  Ride,
  Booking,
  Service,
  User,
  Search,
  MyRides,
  RouteMatch,
} from "./types";
import { dateLabel } from "./types";
import {
  Avatar,
  Back,
  Button,
  Empty,
  ErrorBox,
  Loading,
  Modal,
  RouteLine,
} from "./ui";
import { RouteMap } from "./Map";
export const statusText: Record<string, string> = {
  pending: "Čeka potvrdu",
  accepted: "Dogovoreno",
  ready: "Putnik je na mjestu",
  completed: "Završeno",
  cancelled: "Otkazano",
  declined: "Nije prihvaćeno",
  open: "Slobodno mjesto",
  matched: "Dogovoreno",
};
const pickupTime = (value: number) =>
  new Intl.DateTimeFormat("bs-BA", {
    timeZone: "Europe/Sarajevo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
function MatchSummary({ match }: { match: RouteMatch }) {
  return (
    <div className="route-match-summary">
      <strong>
        Susret: {match.pickup.name} · oko {pickupTime(match.pickupAt)}
      </strong>
      <span>Izlazak: {match.dropoff.name}</span>
      <span>
        Vozaču +{match.extraMinutes} min · zajedno oko {match.rideMinutes} min
      </span>
      <small>
        Cestovna procjena bez podataka o gužvi. Potvrdite gdje se može stati.
      </small>
    </div>
  );
}
export function RideCard({
  ride,
  selected = false,
  onOpen,
}: {
  ride: Ride;
  selected?: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={`ride-card ${selected ? "selected" : ""}`}>
      {selected && <span className="ride-tag">Tvoj smjer</span>}
      <div className="ride-card-main">
        <Avatar name={ride.driver.name} />
        <div className="ride-person">
          <strong>{ride.driver.name}</strong>
          <span className="ride-time">
            {ride.match ? pickupTime(ride.match.pickupAt) : ride.time}
          </span>
        </div>
        <span className="car-illustration">
          <Car strokeWidth={1.35} size={64} />
          <small>{ride.car}</small>
        </span>
      </div>
      <div className="ride-direction">
        {ride.from.name}
        <ArrowRight size={13} />
        {ride.to.name}
      </div>
      {ride.match && <MatchSummary match={ride.match} />}
      <div className="ride-card-bottom">
        <div className="chips">
          <span>
            <MapPin size={14} /> Na stanici
          </span>
          <span>
            <UserRound size={14} /> 1 mjesto
          </span>
        </div>
        <button
          className="round-open"
          aria-label="Pogledaj vožnju"
          onClick={onOpen}
        >
          <ArrowUpRight size={22} />
        </button>
      </div>
    </article>
  );
}
export function Results({
  service,
  query,
  onBack,
  onRide,
}: {
  service: Service;
  query: Search;
  onBack: () => void;
  onRide: (id: string) => void;
}) {
  const [rides, setRides] = useState<Ride[] | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRides(null);
    setError("");
    service
      .search(query)
      .then((r) => {
        if (active) setRides(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [service, query, retry]);
  return (
    <div className="results-page">
      <header className="page-heading">
        <Back onClick={onBack} />
        <div>
          <span className="eyebrow">ISTI PUT, NOVO DRUŠTVO</span>
          <h1>
            Usput ti je<span className="punctuation">.</span>
          </h1>
        </div>
        {rides && (
          <span className="count-pill">
            {rides.length} {rides.length === 1 ? "ponuda" : "ponude"}
          </span>
        )}
      </header>
      <div className="results-layout">
        <div className="results-map-panel">
          {rides?.length ? (
            <RouteMap from={rides[0].from} to={rides[0].to} large />
          ) : (
            <div className="search-summary">
              <MapPin size={28} />
              <h2>Tvoj svakodnevni smjer.</h2>
              <p>
                Tražimo ponude za {dateLabel(query.date).toLowerCase()}, oko{" "}
                {query.time}.
              </p>
            </div>
          )}
          <div className="map-caption">
            <Leaf size={19} />
            <div>
              <strong>Malo bliže. Malo zajedno.</strong>
              <p>Vožnje su besplatne. Povratak se dogovara posebno.</p>
            </div>
          </div>
        </div>
        <section className="results-list">
          <div className="list-heading">
            <h2>Vožnje za tebe</h2>
            <span>{dateLabel(query.date)} · ± 60 min</span>
          </div>
          {error ? (
            <>
              <ErrorBox error={error} />
              <Button variant="outline" onClick={() => setRetry((x) => x + 1)}>
                Pokušaj ponovo
              </Button>
            </>
          ) : !rides ? (
            <Loading />
          ) : rides.length ? (
            rides.map((ride, i) => (
              <RideCard
                key={ride.id}
                ride={ride}
                selected={i === 0}
                onOpen={() => onRide(ride.id)}
              />
            ))
          ) : (
            <Empty title="Još nema tvog spoja.">
              <p>
                Za ova mjesta i vrijeme još nema slobodne ponude. Probaj drugo
                vrijeme ili ponudi svoje mjesto.
              </p>
              <Button variant="lime" onClick={onBack}>
                Promijeni pretragu
              </Button>
            </Empty>
          )}
          <p className="fine-print">
            {rides?.some((r) => r.match)
              ? "Poredak uzima u obzir cestovnu rutu, dodatno vrijeme vozača i dolazak po tebe. Procjene ne uključuju gužvu. Izračun: OSRM / FOSSGIS, podaci © OpenStreetMap contributors."
              : "Prikazana su podudaranja istih mjesta. Cestovni proračun trenutno nije dostupan ili je ovo demo."}
          </p>
        </section>
      </div>
    </div>
  );
}
export function RideDetails({
  id,
  query,
  service,
  user,
  demo,
  onBack,
  onTrips,
  onToast,
}: {
  id: string;
  query?: Search;
  service: Service;
  user: User;
  demo: boolean;
  onBack: () => void;
  onTrips: () => void;
  onToast: (s: string) => void;
}) {
  const [ride, setRide] = useState<Ride | null>(null),
    [booking, setBooking] = useState<Booking | undefined>(),
    [requests, setRequests] = useState<Booking[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cancel, setCancel] = useState(false);
  const load = useCallback(async () => {
    const [r, m] = await Promise.all([service.ride(id, query), service.mine()]);
    setRide(r);
    setBooking(
      m.bookings.find((b) => b.ride.id === id && b.passenger.id === user.id),
    );
    setRequests(m.bookings.filter((b) => b.ride.id === id));
  }, [id, service, user.id, query?.from, query?.to, query?.date, query?.time]);
  useEffect(() => {
    let alive = true;
    load().catch((e) => {
      if (alive) setError(e.message);
    });
    const interval = setInterval(() => load().catch(() => {}), 15000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [load]);
  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      onToast(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setCancel(false);
    }
  }
  if (!ride)
    return (
      <>
        <Back onClick={onBack} />
        {error ? <ErrorBox error={error} /> : <Loading />}
      </>
    );
  const own = ride.driver.id === user.id,
    confirmed = booking && ["accepted", "ready"].includes(booking.status),
    finished = booking?.status === "completed" || ride.status === "completed",
    inactive =
      ride.status === "cancelled" ||
      booking?.status === "cancelled" ||
      booking?.status === "declined";
  const agreed =
    booking?.match ||
    (own
      ? requests.find((b) =>
          ["accepted", "ready", "completed"].includes(b.status),
        )?.match
      : ride.match);
  const pickup = agreed?.pickup || ride.from,
    dropoff = agreed?.dropoff || ride.to;
  const title = finished
    ? "Lijep put. Hvala!"
    : inactive
      ? "Plan se promijenio."
      : confirmed
        ? "Dogovoreno."
        : own
          ? "Tvoja vožnja."
          : booking?.status === "pending"
            ? "Još jedan korak."
            : "Tvoj smjer. Tvoj izbor.";
  return (
    <div className="details-page">
      <header className="page-heading">
        <Back onClick={onBack} />
        <div>
          <span className="eyebrow">
            {own
              ? "SLOBODNO MJESTO, DOBRA PRILIKA"
              : confirmed
                ? "ISTI SMJER. DOBAR DOGOVOR."
                : "BEZ NAPLATE. BEZ KOMPLIKACIJA."}
          </span>
          <h1>{title}</h1>
          <p>
            {dateLabel(ride.date)} ·{" "}
            {agreed ? "Susret oko " + pickupTime(agreed.pickupAt) : ride.time}
          </p>
        </div>
      </header>
      <div className="details-layout">
        <section className="detail-map">
          <RouteMap from={pickup} to={dropoff} large />
          <div className="meeting-label">
            <MapPin size={19} />
            <div>
              <span>MJESTO SUSRETA</span>
              <strong>{pickup.name}</strong>
              <p>{pickup.detail}</p>
            </div>
          </div>
          <p className="fine-print">
            Prikaz je skica, nije navigacija. Mjesta su probni prijedlozi. Prije
            stvarne vožnje provjeri gdje je sigurno stati.
          </p>
        </section>
        <div className="details-info">
          <section className="driver-card">
            <div className="driver-heading">
              <Avatar name={ride.driver.name} />
              <div>
                <h2>{own ? "Ti voziš" : ride.driver.name}</h2>
                <p>{ride.car}</p>
              </div>
              {(confirmed || finished) && (
                <span className="confirmed-icon">
                  <Check size={24} />
                </span>
              )}
            </div>
            <RouteLine from={ride.from.name} to={ride.to.name} />
            {agreed && <MatchSummary match={agreed} />}
            <div className="ride-facts">
              <span>
                <Clock3 size={16} />
                {agreed ? "Polazak vozača " : ""}
                {ride.time}
              </span>
              <span>
                <UserRound size={16} />1 mjesto
              </span>
              <span>
                <Leaf size={16} />
                Besplatno
              </span>
            </div>
            {ride.note && <p className="driver-note">“{ride.note}”</p>}
          </section>
          {(confirmed ||
            (own &&
              requests.some((b) =>
                ["accepted", "ready"].includes(b.status),
              ))) && (
            <ConnectionPhotos
              rideId={ride.id}
              demo={demo}
              ownDriver={own}
              vehicleLabel={ride.car}
              phase={booking?.status || requests.map((b) => b.status).join(",")}
            />
          )}
          <ErrorBox error={error} />
          {own ? (
            <section className="action-card driver-actions">
              <span className="eyebrow">{statusText[ride.status]}</span>
              <h2>
                {ride.status === "open"
                  ? "Nekome ćeš biti usput."
                  : ride.status === "matched"
                    ? "Društvo je dogovoreno."
                    : "Vožnja je zatvorena."}
              </h2>
              {requests.length === 0 && (
                <p>
                  Zahtjevi putnika pojavit će se ovdje. Ti biraš i potvrđuješ
                  saputnika.
                </p>
              )}
              {requests.map((b) => (
                <div className="request-row" key={b.id}>
                  <div>
                    <Avatar name={b.passenger.name} size="small" />
                    <span>
                      <strong>{b.passenger.name}</strong>
                      <small>{statusText[b.status]}</small>
                    </span>
                  </div>
                  {b.match && <MatchSummary match={b.match} />}
                  {b.status === "pending" && (
                    <div className="request-actions">
                      <button
                        aria-label={"Odbij zahtjev: " + b.passenger.name}
                        onClick={() =>
                          action(
                            () => service.booking(b.id, "decline"),
                            "Zahtjev je odbijen.",
                          )
                        }
                        disabled={busy}
                      >
                        <X size={18} />
                      </button>
                      <Button
                        variant="lime"
                        busy={busy}
                        onClick={() =>
                          action(
                            () => service.booking(b.id, "accept"),
                            "Vožnja je dogovorena. Uvijek sačekaj obostranu potvrdu.",
                          )
                        }
                      >
                        <Check size={18} />
                        Prihvati
                      </Button>
                    </div>
                  )}
                  {["accepted", "ready"].includes(b.status) && (
                    <Button
                      variant="lime"
                      busy={busy}
                      onClick={() =>
                        action(
                          () => service.booking(b.id, "complete"),
                          "Hvala što ste podijelili put.",
                        )
                      }
                    >
                      <CheckCheck size={18} />
                      Završi vožnju
                    </Button>
                  )}
                </div>
              ))}
              {["open", "matched"].includes(ride.status) && (
                <button
                  className="cancel-link"
                  disabled={busy}
                  onClick={() => setCancel(true)}
                >
                  Otkaži ponudu
                </button>
              )}
            </section>
          ) : finished ? (
            <section className="action-card thank-you">
              <CheckCheck size={36} />
              <h2>
                Jedno mjesto.
                <br />
                Dobar dan.
              </h2>
              <p>Hvala što ste podijelili put. Povratak je novi dogovor.</p>
              <Button variant="lime" onClick={onTrips}>
                Moje vožnje
              </Button>
            </section>
          ) : inactive ? (
            <section className="action-card">
              <h2>
                {booking?.status === "declined"
                  ? "Ovaj put se nije poklopilo."
                  : "Vožnja je otkazana."}
              </h2>
              <p>
                Nema potvrđene vožnje. Pripremi drugi plan ili potraži novu
                ponudu.
              </p>
              <Button variant="lime" onClick={onBack}>
                Nazad na pretragu
              </Button>
            </section>
          ) : confirmed ? (
            <section className="action-card">
              <span className="eyebrow">
                <MapPin size={14} />
                {booking.status === "ready"
                  ? "SPREMNI ZA SUSRET"
                  : "KAD STIGNEŠ DO MJESTA SUSRETA"}
              </span>
              <h2>
                {booking.status === "ready"
                  ? "Vozač zna da si tu."
                  : "Javi da si na mjestu."}
              </h2>
              <p>
                {booking.status === "ready"
                  ? "Sačekaj na dogovorenom, sigurnom mjestu."
                  : "Potvrdi tek kad stigneš. Bez automatskog praćenja lokacije."}
              </p>
              {booking.status === "accepted" ? (
                <Button
                  variant="lime"
                  busy={busy}
                  onClick={() =>
                    action(
                      () => service.booking(booking.id, "ready"),
                      "Spremnost je potvrđena.",
                    )
                  }
                >
                  <Check size={20} />
                  Na mjestu sam
                </Button>
              ) : (
                <div className="ready-confirmation">
                  <CheckCheck size={20} />
                  Na mjestu si.
                </div>
              )}
              <button
                className="cancel-link"
                onClick={() => setCancel(true)}
                disabled={busy}
              >
                Otkaži vožnju
              </button>
            </section>
          ) : booking?.status === "pending" ? (
            <section className="action-card">
              <span className="pending-pulse" />
              <h2>Zahtjev je poslan.</h2>
              <p>
                Čekamo potvrdu vozača. Ovo još nije dogovorena vožnja — imaj
                rezervni plan.
              </p>
              {demo && (
                <div className="demo-simulation">
                  <span>DEMO · ISPROBAJ SLJEDEĆI KORAK</span>
                  <Button
                    variant="lime"
                    busy={busy}
                    onClick={() =>
                      action(
                        () => service.booking(booking.id, "accept"),
                        "Demo: vozač je potvrdio zahtjev.",
                      )
                    }
                  >
                    Simuliraj potvrdu vozača
                  </Button>
                </div>
              )}
              <button
                className="cancel-link"
                disabled={busy}
                onClick={() => setCancel(true)}
              >
                Povuci zahtjev
              </button>
            </section>
          ) : (
            <section className="action-card">
              <span className="eyebrow">PRVI KORAK JE TVOJ</span>
              <h2>Ideš u istom smjeru?</h2>
              <p>Pošalji zahtjev. Vožnja vrijedi tek kada je vozač prihvati.</p>
              <Button
                variant="lime"
                busy={busy}
                disabled={ride.status !== "open"}
                onClick={() =>
                  action(async () => {
                    await service.request(ride.id, query);
                  }, "Zahtjev je poslan vozaču.")
                }
                arrow
              >
                Pošalji zahtjev
              </Button>
              <small>Jedan putnik · povratak se dogovara posebno</small>
            </section>
          )}
        </div>
      </div>
      {cancel && (
        <Modal
          title={own ? "Otkazati ponudu?" : "Otkazati dogovor?"}
          onClose={() => setCancel(false)}
        >
          <p>
            {own
              ? "Putnici će vidjeti da je ponuda otkazana."
              : "Vozač će vidjeti promjenu. Zamjenska vožnja nije garantovana."}
          </p>
          <Button
            busy={busy}
            onClick={() =>
              action(
                () =>
                  own
                    ? service.cancelRide(ride.id)
                    : service.booking(booking!.id, "cancel"),
                "Otkazivanje je sačuvano.",
              )
            }
          >
            Da, otkaži
          </Button>
          <Button variant="outline" onClick={() => setCancel(false)}>
            Zadrži dogovor
          </Button>
        </Modal>
      )}
    </div>
  );
}
export function Trips({
  service,
  user,
  onRide,
  onHome,
}: {
  service: Service;
  user: User;
  onRide: (id: string) => void;
  onHome: () => void;
}) {
  const [data, setData] = useState<MyRides | null>(null),
    [tab, setTab] = useState<"passenger" | "driver">("passenger"),
    [error, setError] = useState("");
  const load = useCallback(
    () =>
      service
        .mine()
        .then(setData)
        .catch((e) => setError(e.message)),
    [service],
  );
  useEffect(() => {
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [load]);
  const bookings =
      data?.bookings.filter((b) => b.passenger.id === user.id) || [],
    offered = data?.rides || [];
  return (
    <div className="trips-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">DOGOVORI KOJI ZNAČE</span>
          <h1>
            Tvoj mali krug<span className="punctuation">.</span>
          </h1>
          <p>Jedno mjesto. Puno dobrih jutara.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Osvježi vožnje"
          onClick={() => load()}
        >
          <RefreshCw size={20} />
        </button>
      </header>
      <div className="trips-toolbar">
        <div className="role-switch">
          <button
            className={tab === "passenger" ? "selected" : ""}
            onClick={() => setTab("passenger")}
          >
            <UserRound size={17} />
            Putujem <span>{bookings.length}</span>
          </button>
          <button
            className={tab === "driver" ? "selected" : ""}
            onClick={() => setTab("driver")}
          >
            <Car size={18} />
            Vozim <span>{offered.length}</span>
          </button>
        </div>
        <button className="text-button" onClick={onHome}>
          <Plus size={18} /> Nova vožnja
        </button>
      </div>
      <ErrorBox error={error} />
      {!data && !error ? (
        <Loading />
      ) : tab === "passenger" ? (
        bookings.length ? (
          <div className="trip-grid">
            {bookings.map((b) => (
              <button
                className="trip-card"
                key={b.id}
                onClick={() => onRide(b.ride.id)}
              >
                <div className="trip-card-top">
                  <span className={"status status-" + b.status}>
                    {statusText[b.status]}
                  </span>
                  <ArrowUpRight size={20} />
                </div>
                <h2>
                  {dateLabel(b.ride.date)} <span>{b.ride.time}</span>
                </h2>
                <RouteLine from={b.ride.from.name} to={b.ride.to.name} />
                <div className="trip-person">
                  <Avatar size="small" name={b.ride.driver.name} />
                  <span>{b.ride.driver.name}</span>
                  <Car size={18} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty title="Tvoj prvi dogovor te čeka.">
            <p>
              Pronađi nekoga ko već ide tvojim smjerom. Slobodno mjesto može
              biti početak dobrog dana.
            </p>
            <Button variant="lime" arrow onClick={onHome}>
              Pronađi vožnju
            </Button>
          </Empty>
        )
      ) : offered.length ? (
        <div className="trip-grid">
          {offered.map((r) => {
            const requests =
              data?.bookings.filter(
                (b) => b.ride.id === r.id && b.status === "pending",
              ).length || 0;
            return (
              <button
                className="trip-card"
                key={r.id}
                onClick={() => onRide(r.id)}
              >
                <div className="trip-card-top">
                  <span className={"status status-" + r.status}>
                    {statusText[r.status]}
                  </span>
                  {requests > 0 && (
                    <span className="count-pill">{requests} na čekanju</span>
                  )}
                  <ArrowUpRight size={20} />
                </div>
                <h2>
                  {dateLabel(r.date)} <span>{r.time}</span>
                </h2>
                <RouteLine from={r.from.name} to={r.to.name} />
                <div className="trip-person">
                  <Car size={21} />
                  <span>{r.car}</span>
                  <span className="small-pill">Ti voziš</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty title="Imaš jedno slobodno mjesto?">
          <p>Objavi svoju uobičajenu rutu. Ti biraš vrijeme i saputnika.</p>
          <Button variant="lime" onClick={onHome}>
            Ponudi vožnju
          </Button>
        </Empty>
      )}
    </div>
  );
}
