"use client";

import { useEffect, useState } from "react";
import { business, firstName, type Lead } from "./data";

// Builds the links that hand off to the phone's own Phone, Messages, Mail and Maps apps.

export type TestTarget = { phone: string; email: string };

export function toE164(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

export const telHref = (phone: string) => `tel:${toE164(phone)}`;

// "?&body=" works on both iOS (which reads "&body") and Android (which reads "?body").
export const smsHref = (phone: string, body?: string) =>
  `sms:${toE164(phone)}${body ? `?&body=${encodeURIComponent(body)}` : ""}`;

export function mailHref(email: string, lead: Lead) {
  const subject = `Your ${lead.service.toLowerCase()} request`;
  const body = `Hi ${firstName(lead.name)},\n\nThanks for reaching out to ${business.name} about your ${lead.service.toLowerCase()}. When is a good time to come take a look?\n\nThanks,\nMatt\n${business.name}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Apple devices open Apple Maps; everything else opens Google Maps (app if installed).
export function mapsHref(address: string, apple: boolean) {
  const q = encodeURIComponent(address);
  return apple
    ? `https://maps.apple.com/?daddr=${q}`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}

// Decided after mount so the server and first client render match.
export function useIsApple() {
  const [apple, setApple] = useState(false);
  useEffect(() => {
    setApple(/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent));
  }, []);
  return apple;
}

// Where Call / Text / Email actually go: the lead, or the tester's own phone in test mode.
export function reach(lead: Lead, test: TestTarget) {
  return {
    phone: test.phone.trim() || lead.phone,
    email: test.email.trim() || lead.email,
  };
}

const TEST_KEY = "mob.testTarget";

export function loadTestTarget(): TestTarget {
  try {
    const raw = localStorage.getItem(TEST_KEY);
    if (raw) return { phone: "", email: "", ...JSON.parse(raw) };
  } catch {}
  return { phone: "", email: "" };
}

export function saveTestTarget(t: TestTarget) {
  try {
    localStorage.setItem(TEST_KEY, JSON.stringify(t));
  } catch {}
}
