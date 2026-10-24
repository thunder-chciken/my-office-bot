"use client";

import { createContext, useContext } from "react";
import { business } from "./data";

// Who the app is showing: the signed-in business, or the demo business on the public prototype.
export type Account = {
  live: boolean;
  name: string;
  city: string;
  website: string;
  ownerName: string;
  ownerEmail: string;
  siteKey: string | null;
};

export const demoAccount: Account = {
  live: false,
  name: business.name,
  city: business.city,
  website: business.website,
  ownerName: "Matt",
  ownerEmail: "",
  siteKey: null,
};

const AccountContext = createContext<Account>(demoAccount);
export const AccountProvider = AccountContext.Provider;
export const useAccount = () => useContext(AccountContext);
