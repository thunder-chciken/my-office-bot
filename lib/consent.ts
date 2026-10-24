// Text-alert consent wording (SPEC §8). Shown in the app and stored with each person's consent record.
// Have counsel review before paid launch (D50).

export const SELF_TEXT_CONSENT =
  "Send me automated new-lead alerts by text at this number. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

export const inviteText = (ownerFirst: string, business: string) =>
  `My Office Bot: ${ownerFirst} at ${business} added you to get new-lead alerts by text. Reply YES to agree or STOP to opt out. Msg & data rates may apply.`;

export const welcomeText = (business: string) =>
  `My Office Bot: Text alerts are on for ${business}. You'll get a text for each new website lead. Reply STOP to opt out, HELP for help.`;
