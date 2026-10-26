import { useEffect, useState, type ReactNode } from "react";

// Server time is authoritative; browser clock and local storage cannot extend beta.
export function DemoGate({ children }: { children: ReactNode }) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = () => {
      if (alive) setExpired(true);
    };
    const check = async () => {
      try {
        const response = await fetch("/api/demo-status", { cache: "no-store" });
        if (!response.ok) return;
        const status = await response.json();
        if (!alive) return;
        clearTimeout(timer);
        if (status.expired) expire();
        else if (
          typeof status.expiresAt === "number" &&
          typeof status.serverNow === "number"
        )
          timer = setTimeout(
            status.expiresAt - status.serverNow > 2147483647
              ? () => void check()
              : expire,
            Math.min(
              2147483647,
              Math.max(1, status.expiresAt - status.serverNow),
            ),
          );
      } catch {
        /* Server still rejects expired API calls when connectivity returns. */
      }
    };
    void check();
    const poll = setInterval(check, 60000);
    window.addEventListener("focus", check);
    window.addEventListener("usput:demo-expired", expire);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("focus", check);
      window.removeEventListener("usput:demo-expired", expire);
    };
  }, []);
  if (expired)
    return (
      <main className="boot-screen">
        <h1>Demo period je završen.</h1>
        <p>Hvala što si testirao USPUT. Ova demo verzija više nije dostupna.</p>
        <p lang="en">The demo period has ended. Thank you for testing USPUT.</p>
      </main>
    );
  return children;
}
