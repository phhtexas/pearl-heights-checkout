import type { ReactNode } from "react";

/**
 * Site menu (Oscar, Nov 17): the All Homes F header on every page: logo on the left, Homes / Locations / Reviews / FAQ
 * (desktop), and a dark "Ask a question" button. Links go to All Homes F's sections (Oscar's pick; easy to repoint
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
          <a href={`${ALL_HOMES}#homes`}>Homes</a><a href={`${ALL_HOMES}#locations`}>Locations</a><a href={`${ALL_HOMES}#reviews`}>Reviews</a><a href={`${ALL_HOMES}#faq`}>FAQ</a>
        </nav>
        <div className="SN-right">
          {extra}
          <a className="SN-ask" href="mailto:bookings@thepearlheightshomes.com">Ask a question</a>
        </div>
      </div>
    </header>
  );
}
