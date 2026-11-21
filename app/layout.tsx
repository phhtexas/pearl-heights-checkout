import type { ReactNode } from "react";
// Fonts are self-hosted (same families and weights as before, Latin set) so the first paint doesn't wait on
// Google's font server (~0.7 s render-blocking on slow 4G; note 150 item 4, Oscar approved Nov 16).
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/jost/latin-400.css";
import "@fontsource/jost/latin-500.css";
import "@fontsource/jost/latin-600.css";
import "@fontsource/jost/latin-700.css";
import "@fontsource/marcellus/latin-400.css";
import "./globals.css";
import { ConsentBanner } from "./ConsentBanner";

export const metadata = {
  title: "Book direct | Pearl Heights Homes",
  description: "Book direct with Oscar & Fernanda. Your total, upfront.",
  // Google Search Console ownership (property https://pearlheightshomes.com/, Nov 20). Public token, not a secret.
  // The old site's verification file is gone, so this tag keeps the property verified. Don't remove it.
  verification: { google: "mf-qkcfhsXE-zlaszUvbTG3g6NBm_i6O-A_gZ05GS9E" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}<ConsentBanner /></body>
    </html>
  );
}
