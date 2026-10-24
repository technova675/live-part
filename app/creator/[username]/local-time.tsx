"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// Render UTC on the server, then the viewer's timezone after hydration.
export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  const timeZone = isClient ? undefined : "UTC";
  const d = new Date(iso);

  return (
    <time dateTime={iso}>
      {dateOnly ? d.toLocaleDateString("en", { month: "short", day: "numeric", timeZone }) : (
        <>
          {d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", timeZone })} ·{" "}
          {d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone })}
        </>
      )}
    </time>
  );
}
