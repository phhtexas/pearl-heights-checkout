"use client";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Shows its children only off the real domain (Oscar, Nov 19 launch check: the "Mockup F" and "Test site" labels were
 * visible on pearlheightshomes.com). Renders nothing on the server, so the real domain never flashes a test label.
 */
export function TestOnly({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(!/(^|\.)pearlheightshomes\.com$/.test(location.hostname)); }, []);
  return show ? <>{children}</> : null;
}
