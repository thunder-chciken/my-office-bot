"use client";

import { VAPID_PUBLIC_KEY } from "./push-key";
import { browserClient } from "./supabase/client";

// Phone notifications in the browser (D63): check support, ask permission, subscribe, and save the device.
// iPhones only allow it once the app is on the Home Screen (iOS 16.4+); Android works in Chrome either way.

export type PushState = "unsupported" | "install-first" | "blocked" | "off" | "on";

export const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export async function pushState(): Promise<{ state: PushState; endpoint?: string }> {
  if (!supported()) return { state: isIOS() && !isStandalone() ? "install-first" : "unsupported" };
  if (Notification.permission === "denied") return { state: "blocked" };
  const sub = await (await registration()).pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? { state: "on", endpoint: sub.endpoint } : { state: "off" };
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const device = () => {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || isIOS()) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Browser";
};

async function save(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await browserClient().rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_device: device(),
  });
  if (error) throw new Error(error.message);
}

/** Must be called from a tap (browsers only show the permission prompt after a user action). */
export async function turnOnPush(): Promise<{ state: PushState; endpoint?: string; error?: string }> {
  if (!supported()) return { state: isIOS() && !isStandalone() ? "install-first" : "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { state: permission === "denied" ? "blocked" : "off" };
  try {
    const reg = await registration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    await save(sub);
    return { state: "on", endpoint: sub.endpoint };
  } catch (e) {
    return { state: "off", error: e instanceof Error ? e.message : "Couldn't turn on notifications" };
  }
}

export async function turnOffPush(): Promise<PushState> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) {
    await browserClient().rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  return "off";
}

/** On app start: if this device is subscribed, make sure the server still has it (keys can rotate). */
export async function resyncPush() {
  if (!supported() || Notification.permission !== "granted") return;
  const sub = await (await registration()).pushManager.getSubscription();
  if (sub) await save(sub).catch(() => {});
}
