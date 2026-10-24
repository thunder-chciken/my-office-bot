import type { Metadata } from "next";
import App from "@/components/App";

// The full app with sample data, laid out like a real account: the dashboard on a PC or tablet,
// the app on a phone. Handy for showing contractors what they get before they sign up.

export const metadata: Metadata = { title: "Demo — My Office Bot", robots: { index: false } };

export default function DemoPage() {
  return <App variant="app" />;
}
