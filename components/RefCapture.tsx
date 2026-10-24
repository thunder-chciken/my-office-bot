"use client";

import { useEffect } from "react";

// Remembers the referring site from a "Powered by My Office Bot" link (?ref=..., D59) for 60 days,
// so it can be credited when this visitor finishes signing up (OnboardingForm).
export const REF_KEY = "mob:ref";
const REF_DAYS = 60;

export function RefCapture() {
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref")?.trim().toLowerCase();
    if (!ref || !/^[0-9a-f]{16,64}$/.test(ref)) return;
    try {
      // The first site that sent them gets the credit.
      if (!readRef()) localStorage.setItem(REF_KEY, JSON.stringify({ ref, at: Date.now() }));
    } catch {}
  }, []);
  return null;
}

export function readRef(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(REF_KEY) ?? "null") as { ref?: string; at?: number } | null;
    if (!saved?.ref || !saved.at || Date.now() - saved.at > REF_DAYS * 86400000) return null;
    return saved.ref;
  } catch {
    return null;
  }
}
