// Test-only OSRM protocol fixture; durations are synthetic, never production data.
import { createServer } from "node:http";
import { places } from "../server/places.mjs";
createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      code: "Ok",
      sources: places.map(() => ({ distance: 1 })),
      destinations: places.map(() => ({ distance: 1 })),
      durations: places.map((_, i) =>
        places.map((_, j) => Math.abs(i - j) * 120),
      ),
    }),
  );
}).listen(8790, "127.0.0.1", () =>
  console.log("Synthetic OSRM fixture on 8790"),
);
