import { MatchAssessmentNote, matchCategoryLabel } from "./MatchAssessmentNote";
import "./match-assessment.css";
import { LiveLocationCard } from "./LiveLocationCard";
import type { LiveMapPoint } from "./Map";
import { CostSharingBadge } from "./CostSharingBadge";
import { displayVehicleLabel } from "./VehicleManager";
import { t } from "./i18n";
import { ConnectionPhotos } from "./Photos";
import {
  completePassengerQuery,
  preparePassengerQuery,
  hasPassengerOrigin,
  hasPassengerDestination,
} from "./passenger-query";
import { PassengerMeetingPicker } from "./PassengerMeetingPicker";
import { BookingDiscussion } from "./BookingDiscussion";
import "./booking-discussion.css";
import { NoShowReport, bookingLabel } from "./NoShowReport";
import { RideVehiclePhoto } from "./RideVehiclePhoto";
import { MeetingFeedback } from "./MeetingFeedback";
import {
  MeetingPointLabel,
  MeetingStopOption,
  isDemoMeetingPoint,
} from "./MeetingPointLabel";
import "./driver-request-status.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Clock3,
  Mail,
  ThumbsUp,
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
  RideSearchResults,
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
const availableSeats = (ride: Ride) =>
  ride.seatsAvailable ?? (ride.status === "open" ? (ride.seats ?? 1) : 0);
const seatsLabel = (count: number) =>
  t(
    count === 1
      ? "{count} slobodno mjesto"
      : count >= 2 && count <= 4
        ? "{count} slobodna mjesta"
        : "{count} slobodnih mjesta",
    { count },
  );
const seatsSummary = (ride: Ride) =>
  t("{available} od {capacity} mjesta slobodno", {
    available: availableSeats(ride),
    capacity: ride.seats ?? 1,
  });
function MatchSummary({
  match,
  demo = false,
}: {
  match: RouteMatch;
  demo?: boolean;
}) {
  return (
    <div className="route-match-summary">
      <MatchAssessmentNote assessment={match.assessment} />
      <strong>
        {t(" Susret: ")}
        <MeetingPointLabel point={match.pickup} demo={demo} />
        {t(" · oko ")}
        {pickupTime(match.pickupAt)}
      </strong>
      <span>
        {t(match.exitOptional ? "Okvirni izlazak: " : "Izlazak: ")}
        <MeetingPointLabel point={match.dropoff} demo={demo} />
      </span>
      <span>
        {t(" Vozaču +")}
        {match.extraMinutes}
        {t(" min · zajedno oko ")}
        {match.rideMinutes} min
      </span>
      {match.pickupWalkUnknown && (
        <span>{t("Bez početne adrese ne računamo hodanje do susreta.")}</span>
      )}
      {!match.pickupWalkUnknown && match.walkToMinutes !== undefined && (
        <span>
          {t("Hodanje do susreta")}: {match.walkToMinutes} min ·{" "}
          {t("od izlaska do cilja")}: {match.walkFromMinutes} min
        </span>
      )}
      <small>
        {match.provider === "openrouteservice"
          ? "© openrouteservice.org by HeiGIT · Map data © OpenStreetMap contributors"
          : "OSRM / FOSSGIS · © OpenStreetMap contributors"}
      </small>
      <small>
        {t(
          " Cestovna procjena bez podataka o gužvi. Potvrdite gdje se može stati. ",
        )}
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
      {selected && <span className="ride-tag">{t("Tvoj smjer")}</span>}
      <div className="ride-card-main">
        <Avatar userId={ride.driver.id} name={ride.driver.name} />
        <div className="ride-person">
          <strong>{ride.driver.name}</strong>
          <span className="ride-time">
            {ride.match ? pickupTime(ride.match.pickupAt) : ride.time}
          </span>
        </div>
        <span className="car-illustration">
          <RideVehiclePhoto ride={ride} offer compact />
          <small>{displayVehicleLabel(ride.car)}</small>
        </span>
      </div>
      <div className="ride-direction">
        {ride.from.name}
        <ArrowRight size={13} />
        {ride.to.name}
      </div>
      {ride.match && <MatchSummary match={ride.match} demo={ride.demo} />}
      {!ride.match && ride.routingUnavailable && (
        <p className="unverified-match-note">
          {t(
            "Ruta je u blizini, ali proračun nije pouzdan. Prije slanja zahtjeva ponovo provjeri susret.",
          )}
        </p>
      )}
      <p className="cost-sharing-summary">
        <CostSharingBadge shared={ride.costSharing} />
      </p>
      <div className="ride-card-bottom">
        <div className="chips">
          <span>
            <MapPin size={14} />
            {t(" Na stanici ")}
          </span>
          <span>
            <UserRound size={14} />
            {seatsLabel(availableSeats(ride))}
          </span>
        </div>
        <button
          className="round-open"
          aria-label={t("Pogledaj vožnju")}
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
  const [rides, setRides] = useState<RideSearchResults | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [showMore, setShowMore] = useState(false);
  useEffect(() => {
    let active = true;
    setRides(null);
    setShowMore(false);
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
  const category = (ride: Ride) =>
    ride.match?.assessment?.category || (ride.match ? "fits" : "unverified");
  const extraCount = rides?.filter((r) => category(r) === "more").length || 0;
  return (
    <div className="results-page">
      <header className="page-heading">
        <Back onClick={onBack} />
        <div>
          <span className="eyebrow">{t("ISTI PUT, NOVO DRUŠTVO")}</span>
          <h1>
            {t(" Usput ti je")}
            <span className="punctuation">.</span>
          </h1>
        </div>
        {rides && (
          <span className="count-pill">
            {rides.length} {rides.length === 1 ? t("ponuda") : t("ponude")}
          </span>
        )}
      </header>
      <div className="results-layout">
        <div className="results-map-panel">
          {rides?.length ? (
            <RouteMap
              from={rides[0].from}
              to={rides[0].to}
              geometry={rides[0].match?.geometry}
              provider={rides[0].match?.provider}
              large
            />
          ) : (
            <div className="search-summary">
              <MapPin size={28} />
              <h2>{t("Tvoj svakodnevni smjer.")}</h2>
              <p>
                {t(" Tražimo ponude za ")}
                {dateLabel(query.date).toLowerCase()}
                {t(", oko")} {query.time}.
              </p>
            </div>
          )}
          <div className="map-caption">
            <Leaf size={19} />
            <div>
              <strong>{t("Malo bliže. Malo zajedno.")}</strong>
              <p>
                {t(
                  "Provjeri dijeljenje troškova na ponudi. Povratak se dogovara posebno.",
                )}
              </p>
            </div>
          </div>
        </div>
        <section className="results-list">
          <div className="list-heading">
            <h2>{t("Vožnje za tebe")}</h2>
            <span>{dateLabel(query.date)}</span>
          </div>
          {rides?.routingUnavailable && (
            <ErrorBox
              error={t(
                "Cestovni ili pješački servis nije dostupan za dio ponuda. Rezultati mogu biti nepotpuni; pokušaj ponovo.",
              )}
            />
          )}
          {error ? (
            <>
              <ErrorBox error={error} />
              <Button variant="outline" onClick={() => setRetry((x) => x + 1)}>
                {t(" Pokušaj ponovo ")}
              </Button>
            </>
          ) : !rides ? (
            <Loading />
          ) : rides.length ? (
            <>
              {(["fits", "maybe", "unverified"] as const).map((group) => {
                const items = rides.filter((r) => category(r) === group);
                return (
                  items.length > 0 && (
                    <section
                      className={`match-results-group ${group}`}
                      key={group}
                      aria-label={t(matchCategoryLabel[group])}
                    >
                      <h3>
                        {t(matchCategoryLabel[group])}{" "}
                        <span>{items.length}</span>
                      </h3>
                      {items.map((ride) => (
                        <RideCard
                          key={ride.id}
                          ride={ride}
                          selected={ride.id === rides[0].id}
                          onOpen={() => onRide(ride.id)}
                        />
                      ))}
                    </section>
                  )
                );
              })}
              {extraCount > 0 && (
                <div className="extra-match-results">
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => setShowMore(!showMore)}
                    aria-expanded={showMore}
                  >
                    {t(
                      showMore ? "Sakrij dodatne ponude" : "Prikaži još ponuda",
                    )}{" "}
                    ({extraCount})
                  </button>
                  <p>
                    {t(
                      "Veća vremenska odstupanja, do 60 minuta ranije ili kasnije.",
                    )}
                  </p>
                  {showMore && (
                    <section
                      className="match-results-group more"
                      aria-label={t("Dodatne ponude")}
                    >
                      <h3>{t("Dodatne ponude")}</h3>
                      {rides
                        .filter((r) => category(r) === "more")
                        .map((ride) => (
                          <RideCard
                            key={ride.id}
                            ride={ride}
                            onOpen={() => onRide(ride.id)}
                          />
                        ))}
                    </section>
                  )}
                </div>
              )}
            </>
          ) : (
            <Empty
              title={t(
                rides.routingUnavailable
                  ? "Proračun trenutno nije dostupan."
                  : "Još nema tvog spoja.",
              )}
            >
              <p>
                {t(
                  " Za ova mjesta i vrijeme još nema slobodne ponude. Probaj drugo vrijeme ili ponudi svoje mjesto. ",
                )}
              </p>
              <Button variant="lime" onClick={onBack}>
                {t(" Promijeni pretragu ")}
              </Button>
            </Empty>
          )}
          <p className="fine-print">
            {rides?.some((r) => r.match)
              ? t(
                  "Poredak uzima u obzir stvarnu trasu, hodanje, dodatno vrijeme vozača i dolazak po tebe. Procjene ne uključuju gužvu.",
                )
              : t(
                  "Rezultati zavise od dostupnosti cestovnog i pješačkog proračuna.",
                )}
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
  const [locationsByBooking, setLocationsByBooking] = useState<
    Record<string, LiveMapPoint[]>
  >({});
  const updateLocations = useCallback(
    (bookingId: string, positions: LiveMapPoint[]) =>
      setLocationsByBooking((old) =>
        JSON.stringify(old[bookingId] || []) === JSON.stringify(positions)
          ? old
          : { ...old, [bookingId]: positions },
      ),
    [],
  );
  const [stopSelection, setStopSelection] = useState<Partial<Search>>({});
  const [preparedQuery, setPreparedQuery] = useState<Search | undefined>(() =>
    completePassengerQuery(query) ? query : undefined,
  );
  const selectedQuery = useMemo(
    () =>
      preparedQuery
        ? { ...preparedQuery, meetingProposal: "1", ...stopSelection }
        : undefined,
    [preparedQuery, stopSelection],
  );
  const loadVersion = useRef(0);
  const [matchBusy, setMatchBusy] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null),
    [booking, setBooking] = useState<Booking | undefined>(),
    [requests, setRequests] = useState<Booking[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [cancel, setCancel] = useState(false);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const [r, m] = await Promise.all([
      service.ride(id, selectedQuery),
      service.mine(),
    ]);
    if (version !== loadVersion.current) return;
    setRide(r);
    const existingBooking = m.bookings.find(
      (b) => b.ride.id === id && b.passenger.id === user.id,
    );
    if (r.driver.id !== user.id && !existingBooking && !preparedQuery) {
      setPreparedQuery(preparePassengerQuery(query, r));
      setMatchBusy(true);
    } else setMatchBusy(false);
    setBooking(
      m.bookings.find((b) => b.ride.id === id && b.passenger.id === user.id),
    );
    setRequests(m.bookings.filter((b) => b.ride.id === id));
  }, [id, service, user.id, selectedQuery, preparedQuery]);
  useEffect(() => {
    let alive = true;
    load().catch((e) => {
      if (alive) setError(e.message);
      if (alive) setMatchBusy(false);
    });
    const interval = setInterval(() => load().catch(() => {}), 15000);
    const refresh = () => load().catch(() => {});
    window.addEventListener("focus", refresh);
    window.addEventListener("usput:booking-changed", refresh);
    return () => {
      alive = false;
      loadVersion.current++;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("usput:booking-changed", refresh);
    };
  }, [load]);
  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      window.dispatchEvent(new Event("usput:booking-changed"));
      await load();
      onToast(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setCancel(false);
    }
  }
  const focusMeeting =
    new URLSearchParams(window.location.hash.split("?")[1] || "").get(
      "focus",
    ) === "meeting";
  useEffect(() => {
    if (ride && focusMeeting)
      requestAnimationFrame(() =>
        document
          .getElementById("agreed-meeting-map")
          ?.scrollIntoView({ block: "start" }),
      );
  }, [ride?.id, focusMeeting]);
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
  const driverRequestState =
    !own && !inactive && !finished
      ? booking?.status === "pending"
        ? "pending"
        : confirmed
          ? "accepted"
          : undefined
      : undefined;
  const agreed =
    booking?.match ||
    (own
      ? requests.find((b) =>
          ["accepted", "ready", "completed"].includes(b.status),
        )?.match
      : ride.match);
  const activeLocationBookings = own
    ? requests.filter((b) => ["accepted", "ready"].includes(b.status))
    : booking && ["accepted", "ready"].includes(booking.status)
      ? [booking]
      : [];
  const newestLocations = new Map<string, LiveMapPoint>();
  for (const point of activeLocationBookings.flatMap(
    (b) => locationsByBooking[b.id] || [],
  )) {
    const previous = newestLocations.get(point.userId);
    if (!previous || point.capturedAt > previous.capturedAt)
      newestLocations.set(point.userId, point);
  }
  const livePositions = [...newestLocations.values()];
  const pickup = agreed?.pickup || ride.from,
    dropoff = agreed?.dropoff || ride.to;
  const title = finished
    ? t("Lijep put. Hvala!")
    : inactive
      ? t("Plan se promijenio.")
      : confirmed
        ? t("Dogovoreno.")
        : own
          ? t("Tvoja vožnja.")
          : booking?.status === "pending"
            ? t("Još jedan korak.")
            : t("Tvoj smjer. Tvoj izbor.");
  return (
    <div className="details-page">
      <header className="page-heading">
        <Back onClick={onBack} />
        <div>
          <span className="eyebrow">
            {own
              ? t("SLOBODNO MJESTO, DOBRA PRILIKA")
              : confirmed
                ? t("ISTI SMJER. DOBAR DOGOVOR.")
                : t("BEZ NAPLATE. BEZ KOMPLIKACIJA.")}
          </span>
          <h1>{title}</h1>
          <p>
            {dateLabel(ride.date)} ·{" "}
            {agreed
              ? t("Susret oko ") + pickupTime(agreed.pickupAt)
              : ride.time}
          </p>
        </div>
      </header>
      {!own && confirmed && (
        <section
          className="action-card arrival-priority"
          aria-label={t("Javi da si na mjestu.")}
        >
          <span className="eyebrow">
            <MapPin size={14} />
            {booking.status === "ready"
              ? t("SPREMNI ZA SUSRET")
              : t("KAD STIGNEŠ DO MJESTA SUSRETA")}
          </span>
          <h2>
            {booking.status === "ready"
              ? t("Vozač zna da si tu.")
              : t("Javi da si na mjestu.")}
          </h2>
          <p>
            {booking.status === "ready"
              ? t("Sačekaj na dogovorenom, sigurnom mjestu.")
              : t(
                  "Potvrdi tek kad stigneš. GPS ne označava automatski da si na mjestu.",
                )}
          </p>
          {booking.status === "accepted" ? (
            <Button
              variant="lime"
              busy={busy}
              onClick={() =>
                action(
                  () => service.booking(booking.id, "ready"),
                  t("Spremnost je potvrđena."),
                )
              }
            >
              <Check size={20} />
              {t(" Na mjestu sam ")}
            </Button>
          ) : (
            <div className="ready-confirmation">
              <CheckCheck size={20} />
              {t(" Na mjestu si. ")}
            </div>
          )}
          <button
            className="cancel-link"
            onClick={() => setCancel(true)}
            disabled={busy}
          >
            {t(" Otkaži vožnju ")}
          </button>
        </section>
      )}
      <div className="details-layout">
        <section className="detail-map" id="agreed-meeting-map" tabIndex={-1}>
          {!own && !booking && selectedQuery ? (
            <PassengerMeetingPicker
              ride={ride}
              query={selectedQuery}
              sourceIsMeetingPoint={!hasPassengerOrigin(query)}
              destinationIsMeetingPoint={!hasPassengerDestination(query)}
              checking={matchBusy}
              sending={busy}
              canSend={
                ride.status === "open" &&
                availableSeats(ride) > 0 &&
                !!ride.match &&
                !matchBusy &&
                !busy
              }
              error={
                error ||
                (ride.status !== "open" || availableSeats(ride) < 1
                  ? t("Ova vožnja više nije dostupna.")
                  : "") ||
                (!matchBusy && !ride.match
                  ? t(
                      "Pin mora biti uz trasu, u smjeru vožnje i unutar odabranog hodanja.",
                    )
                  : "")
              }
              onSend={() => {
                if (busy || matchBusy || !ride.match) return;
                return action(
                  () => service.request(ride.id, selectedQuery),
                  t("Mjesto susreta je poslano vozaču. Čekamo potvrdu."),
                );
              }}
              onChange={(change) => {
                setMatchBusy(true);
                setStopSelection((old) => ({ ...old, ...change }));
              }}
            />
          ) : (
            <RouteMap
              from={pickup}
              to={dropoff}
              positions={livePositions}
              animated={false}
              focusPoint={focusMeeting ? pickup : undefined}
              geometry={agreed?.geometry || ride.geometry}
              provider={agreed?.provider || ride.routeProvider}
              stops={ride.meetingStops}
              large
            />
          )}
          {booking?.status === "pending" && (
            <p className="meeting-send-status" role="status">
              {t(
                booking.proposal?.authorId === ride.driver.id
                  ? "Druga osoba predlaže mjesto susreta. Pregledaj pin prije potvrde."
                  : "Mjesto susreta je poslano vozaču. Čekamo potvrdu.",
              )}
            </p>
          )}
          <div className="meeting-label">
            <MapPin size={19} />
            <div>
              <span>{t("MJESTO SUSRETA")}</span>
              <strong>
                <MeetingPointLabel point={pickup} demo={ride.demo} />
              </strong>
              <p>
                {ride.demo || isDemoMeetingPoint(pickup)
                  ? t(
                      "Demo/test: izmišljena vožnja. Tačka nije provjerena za sigurno zaustavljanje.",
                    )
                  : pickup.detail}
              </p>
            </div>
          </div>
          <p className="fine-print">
            {t(
              agreed?.geometry || ride.geometry
                ? "Prikazana je cestovna trasa, bez navigacije uživo. Zajedno potvrdite gdje se može stati."
                : " Prikaz je skica, nije navigacija. Mjesta su probni prijedlozi. Prije stvarne vožnje provjeri gdje je sigurno stati. ",
            )}
          </p>
        </section>
        <div className="details-info">
          <section className="driver-card">
            <div className="driver-heading">
              <span
                className="driver-request-avatar"
                data-request-state={driverRequestState}
              >
                <Avatar userId={ride.driver.id} name={ride.driver.name} />
              </span>
              <div>
                <h2>{own ? t("Ti voziš") : ride.driver.name}</h2>
                {(!confirmed || own || inactive || finished) && (
                  <p>{displayVehicleLabel(ride.car)}</p>
                )}
              </div>
              {driverRequestState === "pending" && (
                <span
                  className="request-sent-indicator"
                  role="status"
                  aria-label={t("Zahtjev poslan — čeka se odgovor vozača.")}
                >
                  <span className="request-sent-symbol" aria-hidden="true">
                    <Mail size={22} strokeWidth={2} />
                  </span>
                  <span className="request-sent-caption" aria-hidden="true">
                    {t("Zahtjev je\nposlan")}
                  </span>
                </span>
              )}
              {driverRequestState === "accepted" && (
                <span
                  className="request-accepted-indicator"
                  role="status"
                  aria-label={t(
                    "Zahtjev prihvaćen — vozač je potvrdio vožnju.",
                  )}
                >
                  <span className="request-accepted-symbol" aria-hidden="true">
                    <ThumbsUp size={22} strokeWidth={2} />
                  </span>
                  <span className="request-accepted-caption" aria-hidden="true">
                    {t("Zahtjev\nprihvaćen")}
                  </span>
                </span>
              )}
              {own && finished && (
                <span className="confirmed-icon">
                  <Check size={24} />
                </span>
              )}
            </div>
            {confirmed && !own && !inactive && !finished && (
              <div className="ride-vehicle-recognition">
                <RideVehiclePhoto
                  ride={ride}
                  viewerId={user.id}
                  bookingStatus={booking?.status}
                />
                <div>
                  <small>{t("Auto koji dolazi")}</small>
                  <strong>{displayVehicleLabel(ride.car)}</strong>
                </div>
              </div>
            )}
            <RouteLine from={ride.from.name} to={ride.to.name} />
            {ride.meetingStops && (
              <details className="published-meeting-stops">
                <summary>{t("Vozačeva mjesta ulaska i izlaska")}</summary>
                <ol>
                  {ride.meetingStops.map((p) => (
                    <li key={p.stopId}>
                      <strong>
                        <MeetingPointLabel point={p} demo={ride.demo} />
                      </strong>
                      {p.approach && <small>{p.approach}</small>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {!own && !booking && selectedQuery && !matchBusy && !ride.match && (
              <ErrorBox
                error={
                  ride.routingUnavailable
                    ? t(
                        "Cestovni ili pješački proračun trenutno nije dostupan. Ponovi pretragu.",
                      )
                    : t(
                        "Pin mora biti uz trasu, u smjeru vožnje i unutar odabranog hodanja.",
                      )
                }
              />
            )}
            {agreed && <MatchSummary match={agreed} demo={ride.demo} />}
            <div className="ride-facts">
              <span>
                <Clock3 size={16} />
                {agreed ? t("Polazak vozača ") : ""}
                {ride.time}
              </span>
              <span>
                <UserRound size={16} />
                {seatsSummary(ride)}
              </span>
              <span>
                <Leaf size={16} />
                <CostSharingBadge shared={ride.costSharing} />
              </span>
            </div>
            {ride.note && <p className="driver-note">“{ride.note}”</p>}
          </section>
          {booking?.status === "completed" && (
            <MeetingFeedback key={booking.id} booking={booking} />
          )}
          {own &&
            requests
              .filter((b) => b.status === "completed")
              .map((b) => <MeetingFeedback key={b.id} booking={b} />)}
          {(confirmed ||
            (own &&
              requests.some((b) =>
                ["accepted", "ready"].includes(b.status),
              ))) && (
            <ConnectionPhotos
              rideId={ride.id}
              demoDriverId={ride.demo ? ride.driver.id : undefined}
              demo={demo}
              ownDriver={own}
              vehicleLabel={ride.car}
              phase={booking?.status || requests.map((b) => b.status).join(",")}
              showVehicle={false}
            />
          )}
          <ErrorBox error={error} />
          {own ? (
            <section className="action-card driver-actions">
              <span className="eyebrow">
                {["open", "matched"].includes(ride.status)
                  ? seatsSummary(ride)
                  : t(statusText[ride.status])}
              </span>
              <h2>
                {ride.status === "open"
                  ? t("Nekome ćeš biti usput.")
                  : ride.status === "matched"
                    ? t("Društvo je dogovoreno.")
                    : t("Vožnja je zatvorena.")}
              </h2>
              {requests.length === 0 && (
                <p>
                  {t(
                    " Zahtjevi putnika pojavit će se ovdje. Ti biraš i potvrđuješ saputnika. ",
                  )}
                </p>
              )}
              {requests.map((b) => (
                <div className="request-row" key={b.id}>
                  <div>
                    <Avatar
                      userId={b.passenger.id}
                      name={b.passenger.name}
                      size="small"
                    />
                    <span>
                      <strong>{b.passenger.name}</strong>
                      <small>{bookingLabel(b, statusText[b.status])}</small>
                    </span>
                  </div>
                  {b.match && <MatchSummary match={b.match} demo={ride.demo} />}
                  {b.status === "pending" &&
                    b.proposal?.authorId !== user.id && (
                      <div className="request-actions">
                        <button
                          aria-label={t("Odbij zahtjev: ") + b.passenger.name}
                          onClick={() =>
                            action(
                              () => service.booking(b.id, "decline"),
                              t("Zahtjev je odbijen."),
                            )
                          }
                          disabled={busy}
                        >
                          <X size={18} />
                        </button>
                        <Button
                          variant="lime"
                          busy={busy}
                          disabled={
                            availableSeats(ride) < 1 ||
                            !["open", "matched"].includes(ride.status)
                          }
                          onClick={() =>
                            action(
                              () =>
                                service.booking(b.id, "accept", {
                                  expectedVersion: b.proposal?.version,
                                }),
                              t(
                                "Vožnja je dogovorena. Uvijek sačekaj obostranu potvrdu.",
                              ),
                            )
                          }
                        >
                          <Check size={18} />
                          {t(" Prihvati ")}
                        </Button>
                      </div>
                    )}
                  {["accepted", "ready"].includes(b.status) && (
                    <LiveLocationCard
                      booking={b}
                      viewerId={user.id}
                      onPositions={updateLocations}
                    />
                  )}
                  <BookingDiscussion
                    booking={b}
                    viewerId={user.id}
                    service={service}
                    onRefresh={load}
                  />
                  <NoShowReport
                    booking={b}
                    viewerId={user.id}
                    onReport={() =>
                      action(
                        () => service.booking(b.id, "no-show"),
                        t("Prijava nedolaska je zabilježena."),
                      )
                    }
                  />
                  {["accepted", "ready"].includes(b.status) && (
                    <Button
                      variant="lime"
                      busy={busy}
                      onClick={() =>
                        action(
                          () => service.booking(b.id, "complete"),
                          t("Hvala što ste podijelili put."),
                        )
                      }
                    >
                      <CheckCheck size={18} />
                      {t(" Završi vožnju ")}
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
                  {t(" Otkaži ponudu ")}
                </button>
              )}
            </section>
          ) : finished ? (
            <section className="action-card thank-you">
              <CheckCheck size={36} />
              <h2>
                {t(" Jedno mjesto. ")}
                <br />
                {t(" Dobar dan. ")}
              </h2>
              <p>
                {t("Hvala što ste podijelili put. Povratak je novi dogovor.")}
              </p>
              <Button variant="lime" onClick={onTrips}>
                {t(" Moje vožnje ")}
              </Button>
            </section>
          ) : inactive ? (
            <section className="action-card">
              <h2>
                {booking?.status === "declined"
                  ? t("Ovaj put se nije poklopilo.")
                  : t("Vožnja je otkazana.")}
              </h2>
              <p>
                {t(
                  " Nema potvrđene vožnje. Pripremi drugi plan ili potraži novu ponudu. ",
                )}
              </p>
              <Button variant="lime" onClick={onBack}>
                {t(" Nazad na pretragu ")}
              </Button>
            </section>
          ) : booking?.status === "pending" ? (
            <section className="action-card">
              <span className="pending-pulse" />
              <h2>
                {booking.proposal?.authorId === ride.driver.id
                  ? t("Potvrdi predloženi susret")
                  : t("Zahtjev je poslan.")}
              </h2>
              <p>
                {t(
                  " Čekamo potvrdu vozača. Ovo još nije dogovorena vožnja — imaj rezervni plan. ",
                )}
              </p>
              {(demo || ride.demo) && (
                <div className="demo-simulation">
                  <span>{t("DEMO · ISPROBAJ SLJEDEĆI KORAK")}</span>
                  <p>{t("Samo demo vožnja — izmišljeni vozač.")}</p>
                  <Button
                    variant="lime"
                    busy={busy}
                    onClick={() =>
                      action(
                        () =>
                          service.booking(
                            booking.id,
                            ride.demo ? "simulate-accept" : "accept",
                            { expectedVersion: booking.proposal?.version },
                          ),
                        t("Demo: vozač je potvrdio zahtjev."),
                      )
                    }
                  >
                    {t(" Simuliraj prihvatanje ")}
                  </Button>
                </div>
              )}
              <button
                className="cancel-link"
                disabled={busy}
                onClick={() => setCancel(true)}
              >
                {t(" Povuci zahtjev ")}
              </button>
            </section>
          ) : null}
          {!own &&
            booking &&
            ["accepted", "ready"].includes(booking.status) && (
              <LiveLocationCard
                booking={booking}
                viewerId={user.id}
                onPositions={updateLocations}
              />
            )}
          {!own && booking && (
            <BookingDiscussion
              booking={booking}
              viewerId={user.id}
              service={service}
              onRefresh={load}
            />
          )}
          {!own && booking && (
            <NoShowReport
              booking={booking}
              viewerId={user.id}
              onReport={() =>
                action(
                  () => service.booking(booking.id, "no-show"),
                  t("Prijava nedolaska je zabilježena."),
                )
              }
            />
          )}
        </div>
      </div>
      {cancel && (
        <Modal
          title={own ? t("Otkazati ponudu?") : t("Otkazati dogovor?")}
          onClose={() => setCancel(false)}
        >
          <p>
            {own
              ? t("Putnici će vidjeti da je ponuda otkazana.")
              : t(
                  "Vozač će vidjeti promjenu. Zamjenska vožnja nije garantovana.",
                )}
          </p>
          <Button
            busy={busy}
            onClick={() =>
              action(
                () =>
                  own
                    ? service.cancelRide(ride.id)
                    : service.booking(booking!.id, "cancel"),
                t("Otkazivanje je sačuvano."),
              )
            }
          >
            {t(" Da, otkaži ")}
          </Button>
          <Button variant="outline" onClick={() => setCancel(false)}>
            {t(" Zadrži dogovor ")}
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
  onRepeat,
}: {
  service: Service;
  user: User;
  onRide: (id: string) => void;
  onHome: () => void;
  onRepeat?: (ride: Ride) => void;
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
    window.addEventListener("focus", load);
    window.addEventListener("usput:booking-changed", load);
    return () => {
      clearInterval(i);
      window.removeEventListener("focus", load);
      window.removeEventListener("usput:booking-changed", load);
    };
  }, [load]);
  const bookings =
      data?.bookings.filter((b) => b.passenger.id === user.id) || [],
    offered = data?.rides || [];
  return (
    <div className="trips-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{t("DOGOVORI KOJI ZNAČE")}</span>
          <h1>
            {t(" Tvoj mali krug")}
            <span className="punctuation">.</span>
          </h1>
          <p>{t("Jedno mjesto. Puno dobrih jutara.")}</p>
        </div>
        <button
          className="icon-button"
          aria-label={t("Osvježi vožnje")}
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
            {t(" Putujem ")}
            <span>{bookings.length}</span>
          </button>
          <button
            className={tab === "driver" ? "selected" : ""}
            onClick={() => setTab("driver")}
          >
            <Car size={18} />
            {t(" Vozim ")}
            <span>{offered.length}</span>
          </button>
        </div>
        <button className="text-button" onClick={onHome}>
          <Plus size={18} />
          {t(" Nova vožnja ")}
        </button>
      </div>
      <ErrorBox error={error} />
      {!data && !error ? (
        <Loading />
      ) : tab === "passenger" ? (
        bookings.length ? (
          <div className="trip-grid">
            {bookings.map((b) => (
              <article className="trip-card passenger-trip" key={b.id}>
                <button
                  type="button"
                  className="trip-card-main-action"
                  onClick={() => onRide(b.ride.id)}
                >
                  <div className="trip-card-top">
                    <span className={"status status-" + b.status}>
                      {bookingLabel(b, statusText[b.status])}
                    </span>
                    <RideVehiclePhoto
                      ride={b.ride}
                      viewerId={user.id}
                      bookingStatus={b.status}
                      offer
                      compact
                    />
                    <ArrowUpRight size={20} />
                  </div>
                  <h2>
                    {dateLabel(b.ride.date)} <span>{b.ride.time}</span>
                  </h2>
                  <RouteLine from={b.ride.from.name} to={b.ride.to.name} />
                </button>
                <div className="trip-person">
                  <button
                    type="button"
                    className="trip-driver"
                    onClick={() => onRide(b.ride.id)}
                  >
                    <Avatar
                      userId={b.ride.driver.id}
                      size="small"
                      name={b.ride.driver.name}
                    />
                    <span>
                      <strong>{b.ride.driver.name}</strong>
                      <small>{displayVehicleLabel(b.ride.car)}</small>
                    </span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty title={t("Tvoj prvi dogovor te čeka.")}>
            <p>
              {t(
                " Pronađi nekoga ko već ide tvojim smjerom. Slobodno mjesto može biti početak dobrog dana. ",
              )}
            </p>
            <Button variant="lime" arrow onClick={onHome}>
              {t(" Pronađi vožnju ")}
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
              <article className="trip-card offered-trip" key={r.id}>
                <button
                  className="trip-card-main-action"
                  onClick={() => onRide(r.id)}
                >
                  <div className="trip-card-top">
                    <RideVehiclePhoto
                      ride={r}
                      viewerId={user.id}
                      offer
                      compact
                    />
                    <span className={"status status-" + r.status}>
                      {t(statusText[r.status])}
                    </span>
                    {requests > 0 && (
                      <span className="count-pill">
                        {requests}
                        {t(" na čekanju")}
                      </span>
                    )}
                    <ArrowUpRight size={20} />
                  </div>
                  <h2>
                    {dateLabel(r.date)} <span>{r.time}</span>
                  </h2>
                  <RouteLine from={r.from.name} to={r.to.name} />
                  <p className="fine-print">{seatsSummary(r)}</p>
                  <div className="trip-person">
                    <Car size={21} />
                    <span>{r.car}</span>
                    <span className="small-pill">{t("Ti voziš")}</span>
                  </div>
                </button>
                {onRepeat && ["completed", "cancelled"].includes(r.status) && (
                  <button
                    className="repeat-ride-button"
                    type="button"
                    onClick={() => onRepeat(r)}
                  >
                    <RefreshCw size={17} aria-hidden="true" />
                    {t("Ponovi vožnju")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty title={t("Imaš jedno slobodno mjesto?")}>
          <p>
            {t("Objavi svoju uobičajenu rutu. Ti biraš vrijeme i saputnika.")}
          </p>
          <Button variant="lime" onClick={onHome}>
            {t(" Ponudi vožnju ")}
          </Button>
        </Empty>
      )}
    </div>
  );
}
