/** Thin line icons for the listing page (visual treatment from Oscar's Nov 15 reference: icon + label lists). */
const P: Record<string, string> = {
  walk: "M13 4a1.5 1.5 0 1 0 0 .01M10 21l2-6 3 3v3M9 12l2-3 3 1 2 3M8 9l3-2",
  stairs: "M4 20h4v-4h4v-4h4V8h4",
  baby: "M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 21v-4a6 6 0 0 1 12 0v4M9 14h.01M15 14h.01",
  tree: "M12 22v-6M7 16h10l-5-8-5 8zM9 10l3-6 3 6",
  key: "M15 7a4 4 0 1 1-3.6 5.8L4 20H3v-3l1-1h2v-2h2l1.4-1.4A4 4 0 0 1 15 7zM16 9h.01",
  car: "M5 16h14M6 16l1.5-5h9L18 16M7 16v2M17 16v2M8 13h.01M16 13h.01",
  wifi: "M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 19h.01",
  kitchen: "M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-1.7 0-3 2-3 5v4h3v9",
  washer: "M5 3h14v18H5zM5 7h14M12 10a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM8 5h.01",
  desk: "M3 9h18M5 9v11M19 9v11M14 9v6h5",
  play: "M4 20V8l8-4 8 4v12M9 20v-6h6v6",
  crib: "M4 6v14M20 6v14M4 10h16M4 17h16M8 10v7M12 10v7M16 10v7",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2",
  people: "M9 7a3 3 0 1 1 0 .01M3 20v-1a6 6 0 0 1 12 0v1M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1",
  ban: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM5.6 5.6l12.8 12.8",
  smoke: "M3 15h13v3H3zM19 15v3M17 11c0-2 2-2 2-4M20 11c0-2 2-2 2-4",
  paw: "M8 10a1.5 2 0 1 1 0-.01M16 10a1.5 2 0 1 1 0-.01M5 14a1.5 2 0 1 1 0-.01M19 14a1.5 2 0 1 1 0-.01M12 14c-3 0-4 3-4 4.5S10 20 12 20s4-.5 4-1.5S15 14 12 14z",
  moon: "M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z",
  camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 10a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z",
  alarm: "M12 4a7 7 0 0 1 7 7v4l1.5 3h-17L5 15v-4a7 7 0 0 1 7-7zM10 21h4",
  first: "M4 7h16v13H4zM9 7V4h6v3M12 11v5M9.5 13.5h5",
  refund: "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  home: "M4 11l8-7 8 7v9H4zM10 20v-5h4v5",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  chat: "M4 5h16v11H9l-5 4z",
  bed: "M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M6 11h3",
  bath: "M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V6a2 2 0 0 1 4 0",
  pin: "M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  photo: "M3 6h18v13H3zM3 15l5-4 4 3 3-2 6 4",
  dot: "M12 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2z",
};

export function Icon({ name, size = 20 }: { name: keyof typeof P | string; size?: number }) {
  return (
    <svg className="L-ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={P[name] ?? P.dot} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Picks an icon from the words in an item (amenities, rules, highlights). Falls back to a dot. */
export function iconFor(text: string): string {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/refund|cancel|non-refundable|booked (more|7)/, "refund"], [/exact dates|amounts/, "check"],
    [/before you leave|dishes/, "home"], [/alarm/, "alarm"], [/first aid|extinguisher/, "first"], [/camera|photograph|filming/, "camera"],
    [/walk|pearl/, "walk"], [/stairs|single-level|one level/, "stairs"], [/little ones|baby|crib|high chair|pack-n-play/, "baby"],
    [/backyard|bonus room|outdoor|patio/, "tree"], [/check-in|keypad|self check/, "key"], [/check-out|quiet hours|before 10/, "clock"],
    [/parking|car gate/, "car"], [/wifi|internet/, "wifi"], [/kitchen|coffee|stove|dining/, "kitchen"], [/washer|dryer|laundry/, "washer"],
    [/workspace|work/, "desk"], [/playroom|toys/, "play"], [/guests|reservation holder|25 or older/, "people"], [/parties|events/, "ban"],
    [/smok|vap/, "smoke"], [/pets/, "paw"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "dot";
}
