import type { ReactNode } from "react";

/**
 * Site menu (Oscar, Nov 17; labels Nov 19): logo on the left, Browse homes / Map / Reviews / FAQ (desktop), and a light
 * outlined "Ask a question" button. Property pages use ListingNav instead. Links go to All Homes F's sections (Oscar's pick; easy to repoint
 * if C or E is chosen). `extra` holds page-specific buttons (share/save on a listing). `sticky` is off on listing
 * pages, which already have a sticky photo, section bar and booking card.
 */
export const ALL_HOMES = "/all-homes/f";
export function SiteNav({ extra, sticky = true }: { extra?: ReactNode; sticky?: boolean }) {
  return (
    <header className={`SN${sticky ? " SN-sticky" : ""}`}>
      <div className="SN-in">
        <a className="SN-brand" href={ALL_HOMES} aria-label="Pearl Heights Homes, all homes">
          <img src="/brand/logo-dark.webp" alt="" width={200} height={174} />
        </a>
        <nav className="SN-nav" aria-label="Site">
          <a href={`${ALL_HOMES}#homes`}>Browse homes</a><a href={`${ALL_HOMES}#locations`}>Map</a><a href={`${ALL_HOMES}#reviews`}>Reviews</a><a href={`${ALL_HOMES}#faq`}>FAQ</a>
        </nav>
        <div className="SN-right">
          {extra}
          <a className="SN-ask" href="mailto:bookings@pearlheightshomes.com">Ask a question</a>
        </div>
      </div>
    </header>
  );
}

/**
 * Property-page header (Oscar, Nov 19): a page that helps decide on ONE home doesn't send guests away. Logo and
 * "← Back to all homes" on the left, a light outlined "Ask a question" (this home's email subject) on the right.
 * `backHref` is the All Homes page with the guest's search restored (built from the listing's URL), or the default.
 * Phones: back on the left, logo centered when it fits (hidden at very narrow widths), ask on the right. Two logo
 * copies so the tab order always matches what's on screen (the hidden one is display:none, out of the tab order).
 */
export function ListingNav({ backHref, askHref, onAsk }: { backHref: string; askHref: string; onAsk?: () => void }) {
  const logo = (cls: string) => (
    <a className={`LN-brand ${cls}`} href={ALL_HOMES} aria-label="Pearl Heights Homes, all homes">
      <img src="/brand/logo-dark.webp" alt="" width={200} height={174} />
    </a>
  );
  return (
    <header className="LN">
      <div className="LN-in">
        {logo("LN-brandDesk")}
        <a className="LN-back" href={backHref} data-cta="listing_back_to_all">
          <span aria-hidden="true">←</span> Back to all homes
        </a>
        {logo("LN-brandMob")}
        {onAsk
          ? <button type="button" className="LN-ask" onClick={onAsk} data-cta="listing_header_ask">Ask a question</button>
          : <a className="LN-ask" href={askHref} data-cta="listing_header_ask">Ask a question</a>}
      </div>
    </header>
  );
}
