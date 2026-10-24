import type { Metadata } from "next";
import { ComparePage } from "@/components/compare/ComparePage";

export const metadata: Metadata = {
  title: "My Office Bot vs. Housecall Pro, Jobber and more",
  description:
    "See how My Office Bot compares on price and features with Housecall Pro, Jobber, ServiceTitan, Workiz and Podium. $49 a month for the whole crew.",
};

export default function Page() {
  return <ComparePage />;
}
