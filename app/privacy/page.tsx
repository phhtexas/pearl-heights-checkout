import { DocPage, docMeta } from "../legal/parts";

/** Privacy and Cookie Notice (V1.2). Text: src/content/legal/privacy.md. Final since Nov 20 (attorney approved; Twilio review). */
export const metadata = docMeta("Privacy and Cookie Notice", "privacy");
export const dynamic = "force-static";

export default function Page() {
  return <DocPage id="privacy" />;
}
