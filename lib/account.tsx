"use client";

import { createContext, useContext } from "react";
import { business } from "./data";

// Who the app is showing: the signed-in business, or the demo business on the public prototype.
export type Account = {
  live: boolean;
  name: string;
  phone: string;
  city: string;
  timezone: string;
  trades: string[];
  website: string;
  ownerName: string;
  ownerEmail: string;
  siteKey: string | null;
};

export const demoAccount: Account = {
  live: false,
  name: business.name,
  phone: "(512) 555-0142",
  city: business.city,
  timezone: "America/Chicago",
  trades: ["Roofing", "Remodeling", "Tile"],
  website: business.website,
  ownerName: "Matt",
  ownerEmail: "",
  siteKey: null,
};

const AccountContext = createContext<Account>(demoAccount);
export const AccountProvider = AccountContext.Provider;
export const useAccount = () => useContext(AccountContext);

// Wide screens (PC, tablet in landscape) get the dashboard layout; phones keep the app layout.
const LayoutContext = createContext<"phone" | "desktop">("phone");
export const LayoutProvider = LayoutContext.Provider;
export const useLayout = () => useContext(LayoutContext);
