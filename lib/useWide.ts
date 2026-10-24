"use client";

import { useSyncExternalStore } from "react";

// True on screens wide enough for the dashboard layout (PCs, tablets in landscape).
// The server and first paint assume a phone; wide screens switch right after hydration.
const query = "(min-width: 1024px)";

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

export function useWide() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
