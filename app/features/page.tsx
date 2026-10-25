import type { Metadata } from "next";
import { FeaturesPage } from "@/components/FeaturesPage";

export const metadata: Metadata = {
  title: "What My Office Bot does",
  description:
    "Every website lead on your phone in seconds, and a reply in one tap. Simple, fast lead alerts for contractors. $49 a month for the whole crew.",
};

export default function Page() {
  return <FeaturesPage />;
}
