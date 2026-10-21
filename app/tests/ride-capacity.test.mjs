import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleApi } from "../server/api.mjs";
import { adaptSqlite } from "../server/db.mjs";
import { getPlace } from "../server/places.mjs";

let sqlite, env;
const passengers = ["one", "two", "three", "four", "five", "six"];
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8"),
  );
  env = {
    DB: adaptSqlite(sqlite),
    OPENROUTESERVICE_API_KEY: "fixture-only",
    ROUTING_FETCH: async (_, options) => {
      const points = JSON.parse(options.body).coordinates;
      return Response.json({
        features: [
          {
            geometry: { coordinates: points },
            properties: {
              summary: {
                duration: (points.length - 1) * 200,
                distance: (points.length - 1) * 1000,
              },
              segments: points
                .slice(1)
                .map(() => ({ duration: 200, distance: 1000 })),
              way_points: points.map((_, i) => i),
            },
          },
        ],
      });
    },
  };
  for (const id of [
    "driver",
    "other-driver",
    "usput-demo-senad-v1",
    ...passengers,
  ]) {
    sqlite
      .prepare("INSERT INTO users(id,name,email,created_at) VALUES(?,?,?,?)")
      .run(id, id, id + "@example.test", Date.now());
    sqlite
      .prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)")
      .run(
        createHash("sha256")
          .update("session-" + id)
          .digest("hex"),
        id,
        Date.now() + 600000,
      );
  }
});
afterEach(() => sqlite.close());

async function call(
  path,
  user = "driver",
  body,
  method = body === undefined ? "GET" : "POST",
) {
  const response = await handleApi(
    new Request("http://localhost:8787/api" + path, {
      method,
      headers: {
        Origin: "http://localhost:8787",
        "Content-Type": "application/json",
        ...(user ? { Cookie: "usput_session=session-" + user } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env,
  );
  return { status: response.status, data: await response.json() };
}

function offer() {
  return {
    from: "cengic",
    to: "marijin",
    date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    time: "07:30",
    car: "VW Golf · sivi",
    note: "Bez pušenja",
  };
}

async function publish(patch = {}) {
  const input = { ...offer(), ...patch };
  const preview = await call("/routes/preview", "driver", {
    ...input,
    meetingStops: [getPlace(input.from), getPlace(input.to)],
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  return call("/rides", "driver", {
    ...input,
    meetingStops: preview.data.meetingStops,
    previewToken: preview.data.previewToken,
    stopsConfirmed: true,
    routeConfirmed: true,
  });
}

test("published capacity defaults to one passenger and exposes the offered free seats", async () => {
  for (const seats of [undefined, 1, 3, 7]) {
    const response = await publish(seats === undefined ? {} : { seats });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    assert.equal(response.data.ride.seats, seats ?? 1);
    assert.equal(response.data.ride.seatsAvailable, seats ?? 1);
  }
});

test("publishing rejects capacities that are not integer passenger counts from one to seven", async () => {
  for (const seats of [
    0,
    8,
    -1,
    1.5,
    "3",
    "",
    null,
    {},
    [],
    true,
    "NaN",
    NaN,
    Infinity,
  ]) {
    const response = await publish({ seats });
    assert.equal(
      response.status,
      400,
      "accepted invalid capacity " + JSON.stringify(seats),
    );
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM rides").get().n, 0);
});

function seedRide(seats = 3, patch = {}) {
  const input = offer();
  const row = {
    id: crypto.randomUUID(),
    driver_id: "driver",
    seats,
    status: "open",
    departure: Date.now() + 86400000 * 2,
    ...patch,
  };
  sqlite
    .prepare(
      "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,seats,status,created_at) VALUES(?,?,'cengic','marijin',?,'07:30',?,'VW Golf',?,?,?)",
    )
    .run(
      row.id,
      row.driver_id,
      input.date,
      row.departure,
      row.seats,
      row.status,
      Date.now(),
    );
  return row;
}

function seedBooking(ride, passenger, status = "pending") {
  const id = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES(?,?,?,?,?)",
    )
    .run(id, ride.id, passenger, status, Date.now());
  return id;
}

const action = (id, name, user = "driver") =>
  call(`/bookings/${id}/${name}`, user, {});
const status = (table, id) =>
  sqlite.prepare(`SELECT status FROM ${table} WHERE id=?`).get(id).status;
const confirmed = (ride) =>
  sqlite
    .prepare(
      "SELECT COUNT(*) AS n FROM bookings WHERE ride_id=? AND status IN ('accepted','ready','completed')",
    )
    .get(ride.id).n;

function pauseBatch(match) {
  const original = env.DB.batch.bind(env.DB);
  let release, arrive;
  const gate = new Promise((resolve) => (release = resolve));
  const reached = new Promise((resolve) => (arrive = resolve));
  env.DB.batch = async (statements) => {
    if (match(statements)) {
      arrive();
      await gate;
    }
    return original(statements);
  };
  return { reached, release };
}

test("a partial acceptance leaves other requests pending and the ride searchable with its remaining seats", async () => {
  const ride = seedRide();
  const first = seedBooking(ride, "one");
  const second = seedBooking(ride, "two");
  assert.equal((await action(first, "accept")).status, 200);
  assert.equal(status("rides", ride.id), "open");
  assert.equal(status("bookings", second), "pending");
  const search = await call("/rides?from=cengic&to=marijin", "three");
  assert.equal(search.data.rides.length, 1);
  assert.equal(search.data.rides[0].seats, 3);
  assert.equal(search.data.rides[0].seatsAvailable, 2);
  const detail = (await call("/rides/" + ride.id, "one")).data.ride;
  assert.equal(detail.seatsAvailable, 2);
  const mine = (await call("/my-rides")).data;
  assert.equal(mine.rides[0].seatsAvailable, 2);
  assert.ok(
    mine.bookings.every(
      (b) => b.ride.seats === 3 && b.ride.seatsAvailable === 2,
    ),
  );
  assert.ok(mine.bookings.every((b) => b.passenger.email === undefined));
});

test("three authenticated passengers can reserve one place each and only the full ride declines pending requests", async () => {
  const ride = seedRide();
  const requests = [];
  for (const passenger of passengers.slice(0, 4)) {
    const response = await call(`/rides/${ride.id}/request`, passenger, {});
    assert.equal(response.status, 201);
    requests.push(response.data.booking.id);
  }
  for (const id of requests.slice(0, 3))
    assert.equal((await action(id, "accept")).status, 200);
  assert.equal(confirmed(ride), 3);
  assert.equal(status("rides", ride.id), "matched");
  assert.equal(status("bookings", requests[3]), "declined");
  assert.equal((await action(requests[3], "accept")).status, 409);
  assert.equal(
    (await call(`/rides/${ride.id}/request`, "five", {})).status,
    409,
  );
  assert.equal(
    (await call("/rides/" + ride.id, "five")).data.ride.seatsAvailable,
    0,
  );
  assert.equal((await call("/rides", "five")).data.rides.length, 0);
});

test("parallel acceptance requests cannot confirm more passengers than the offered capacity", async () => {
  const ride = seedRide();
  const ids = passengers.map((passenger) => seedBooking(ride, passenger));
  const responses = await Promise.all(ids.map((id) => action(id, "accept")));
  assert.deepEqual(
    responses.map((r) => r.status).sort(),
    [200, 200, 200, 409, 409, 409],
  );
  assert.equal(confirmed(ride), 3);
  assert.equal(status("rides", ride.id), "matched");
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM bookings WHERE ride_id=? AND status='declined'",
      )
      .get(ride.id).n,
    3,
  );
});

test("a new request reports current remaining capacity when an acceptance races its insertion", async () => {
  const ride = seedRide();
  const existing = seedBooking(ride, "one");
  const gate = pauseBatch((statements) =>
    statements[0]._sql.startsWith("INSERT INTO bookings"),
  );
  const pending = call(`/rides/${ride.id}/request`, "two", {});
  await gate.reached;
  try {
    assert.equal((await action(existing, "accept")).status, 200);
  } finally {
    gate.release();
  }
  const response = await pending;
  assert.equal(response.status, 201);
  assert.equal(response.data.booking.ride.seatsAvailable, 2);
});

test("a stale acceptance cannot reopen boarding after another passenger completes", async () => {
  const ride = seedRide();
  const first = seedBooking(ride, "one", "accepted");
  const pending = seedBooking(ride, "two");
  const gate = pauseBatch((statements) =>
    statements[0]._sql.startsWith("UPDATE bookings SET status='accepted'"),
  );
  const accepting = action(pending, "accept");
  await gate.reached;
  try {
    assert.equal((await action(first, "complete")).status, 200);
  } finally {
    gate.release();
  }
  assert.equal((await accepting).status, 409);
  assert.equal(status("rides", ride.id), "completed");
  assert.equal(status("bookings", pending), "declined");
  assert.equal(confirmed(ride), 1);
});

test("only the offer's driver accepts real bookings and readiness belongs to each passenger", async () => {
  const ride = seedRide();
  const first = seedBooking(ride, "one");
  const second = seedBooking(ride, "two");
  for (const user of ["one", "two", "other-driver", null])
    assert.equal(
      (await action(first, "accept", user)).status,
      user ? 403 : 401,
    );
  assert.equal((await action(first, "accept")).status, 200);
  assert.equal((await action(second, "accept")).status, 200);
  assert.equal((await action(first, "ready", "two")).status, 403);
  assert.equal((await action(first, "ready", "driver")).status, 403);
  assert.equal((await action(first, "ready", "one")).status, 200);
  assert.equal(status("bookings", first), "ready");
  assert.equal(status("bookings", second), "accepted");
  assert.equal(
    (await call("/rides/" + ride.id, "three")).data.ride.seatsAvailable,
    1,
  );
});

test("the conditional acceptance guard counts accepted, ready and completed reservations", async () => {
  const ride = seedRide(3);
  seedBooking(ride, "one", "accepted");
  seedBooking(ride, "two", "ready");
  seedBooking(ride, "three", "completed");
  const id = seedBooking(ride, "four");
  assert.equal((await action(id, "accept")).status, 409);
  assert.equal(confirmed(ride), 3);
  assert.equal(status("bookings", id), "pending");
});

test("demo simulation uses the same multi-passenger capacity and retains exact owner authorization", async () => {
  const date = offer().date;
  const ride = seedRide(3, {
    id: `usput-demo-senad-${date}`,
    driver_id: "usput-demo-senad-v1",
  });
  const ids = passengers
    .slice(0, 4)
    .map((passenger) => seedBooking(ride, passenger));
  assert.equal((await action(ids[0], "simulate-accept", "two")).status, 403);
  assert.equal((await action(ids[0], "accept", "one")).status, 403);
  for (const [i, id] of ids.slice(0, 3).entries())
    assert.equal(
      (await action(id, "simulate-accept", passengers[i])).status,
      200,
    );
  assert.equal((await action(ids[3], "simulate-accept", "four")).status, 409);
  assert.equal(confirmed(ride), 3);
});

test("cancelling an accepted passenger reopens exactly one place on a future full ride", async () => {
  const ride = seedRide(3, { status: "matched" });
  const ids = passengers
    .slice(0, 3)
    .map((passenger) => seedBooking(ride, passenger, "accepted"));
  assert.equal((await action(ids[1], "cancel", "two")).status, 200);
  assert.equal(status("rides", ride.id), "open");
  assert.equal(confirmed(ride), 2);
  assert.equal(
    (await call("/rides/" + ride.id, "four")).data.ride.seatsAvailable,
    1,
  );
  const replacement = await call(`/rides/${ride.id}/request`, "four", {});
  assert.equal(replacement.status, 201);
  assert.equal(
    (await action(replacement.data.booking.id, "accept")).status,
    200,
  );
  assert.equal(confirmed(ride), 3);
  assert.equal(status("rides", ride.id), "matched");
  assert.equal(status("bookings", ids[0]), "accepted");
  assert.equal(status("bookings", ids[2]), "accepted");
});

test("completing one passenger closes boarding without completing the other passengers", async () => {
  const ride = seedRide(3);
  const first = seedBooking(ride, "one", "accepted");
  const second = seedBooking(ride, "two", "ready");
  const pending = seedBooking(ride, "three");
  assert.equal((await action(first, "complete")).status, 200);
  assert.equal(status("bookings", first), "completed");
  assert.equal(status("bookings", second), "ready");
  assert.equal(status("bookings", pending), "declined");
  assert.equal(status("rides", ride.id), "matched");
  assert.equal(
    (await call("/rides/" + ride.id, "four")).data.ride.seatsAvailable,
    0,
  );
  assert.equal((await action(pending, "accept")).status, 409);
  assert.equal((await action(second, "complete")).status, 200);
  assert.equal(status("rides", ride.id), "completed");
});

test("cancellation after a passenger completed never reopens the started journey", async () => {
  const ride = seedRide(3, { status: "matched" });
  const first = seedBooking(ride, "one", "accepted");
  const second = seedBooking(ride, "two", "accepted");
  const third = seedBooking(ride, "three", "accepted");
  assert.equal((await action(first, "complete")).status, 200);
  assert.equal(status("rides", ride.id), "matched");
  assert.equal((await action(second, "cancel", "two")).status, 200);
  assert.equal(status("rides", ride.id), "matched");
  assert.equal(
    (await call("/rides/" + ride.id, "four")).data.ride.seatsAvailable,
    0,
  );
  assert.equal(
    (await call(`/rides/${ride.id}/request`, "four", {})).status,
    409,
  );
  assert.equal((await action(third, "complete")).status, 200);
  assert.equal(status("rides", ride.id), "completed");
});

test("a started journey closes when its final active passenger cancels", async () => {
  const ride = seedRide(3, { status: "matched" });
  seedBooking(ride, "one", "completed");
  const id = seedBooking(ride, "two", "accepted");
  assert.equal((await action(id, "cancel", "two")).status, 200);
  assert.equal(status("rides", ride.id), "completed");
  assert.equal(
    (await call("/rides/" + ride.id, "three")).data.ride.seatsAvailable,
    0,
  );
});

test("a departed full ride cannot reopen when its last accepted passenger cancels", async () => {
  const ride = seedRide(1, { status: "matched", departure: Date.now() - 1000 });
  const id = seedBooking(ride, "one", "accepted");
  assert.equal((await action(id, "cancel", "one")).status, 200);
  assert.equal(status("rides", ride.id), "matched");
  assert.equal(
    (await call("/rides/" + ride.id, "two")).data.ride.seatsAvailable,
    0,
  );
});

test("driver cancellation cancels all active passengers without changing completed agreements", async () => {
  const ride = seedRide(4, { status: "matched" });
  const completed = seedBooking(ride, "one", "completed");
  const active = [
    seedBooking(ride, "two", "accepted"),
    seedBooking(ride, "three", "ready"),
    seedBooking(ride, "four"),
  ];
  assert.equal(
    (await call(`/rides/${ride.id}/cancel`, "driver", {})).status,
    200,
  );
  assert.equal(status("rides", ride.id), "cancelled");
  assert.equal(status("bookings", completed), "completed");
  assert.ok(active.every((id) => status("bookings", id) === "cancelled"));
  assert.equal(
    (await call("/rides/" + ride.id, "five")).data.ride.seatsAvailable,
    0,
  );
  assert.equal((await action(active[0], "complete")).status, 409);
});

test("capacity migration preserves legacy offers as one passenger place and removes the old uniqueness rule", () => {
  const legacy = new DatabaseSync(":memory:");
  try {
    legacy.exec(
      readFileSync(
        new URL("../server/migrations/0001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    legacy.exec(
      "INSERT INTO users(id,name,email,created_at) VALUES('driver','Driver','driver@legacy.test',1),('one','One','one@legacy.test',1),('two','Two','two@legacy.test',1)",
    );
    legacy.exec(
      "INSERT INTO rides(id,driver_id,from_id,to_id,date,time,departure,car,created_at) VALUES('legacy','driver','cengic','marijin','2030-01-01','07:30',1,'VW Golf',1)",
    );
    legacy.exec(
      readFileSync(
        new URL("../server/migrations/0012_ride_capacity.sql", import.meta.url),
        "utf8",
      ),
    );
    assert.equal(
      legacy.prepare("SELECT seats FROM rides WHERE id='legacy'").get().seats,
      1,
    );
    assert.equal(
      legacy
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='index' AND name='one_seat'",
        )
        .get(),
      undefined,
    );
    assert.throws(
      () => legacy.exec("UPDATE rides SET seats=0"),
      /CHECK constraint/,
    );
    assert.throws(
      () => legacy.exec("UPDATE rides SET seats=8"),
      /CHECK constraint/,
    );
    legacy.exec("UPDATE rides SET seats=3");
    legacy.exec(
      "INSERT INTO bookings(id,ride_id,passenger_id,status,created_at) VALUES('a','legacy','one','accepted',1),('b','legacy','two','accepted',1)",
    );
    assert.equal(
      legacy
        .prepare("SELECT COUNT(*) AS n FROM bookings WHERE ride_id='legacy'")
        .get().n,
      2,
    );
    const indexes = legacy.prepare("PRAGMA index_list(bookings)").all();
    assert.ok(
      indexes.some(
        (index) => index.name === "bookings_ride_status" && index.unique === 0,
      ),
    );
  } finally {
    legacy.close();
  }
});
