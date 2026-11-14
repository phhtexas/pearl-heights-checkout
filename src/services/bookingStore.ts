/**
 * Idempotency store keyed by booking ref. The production version is the `bookings` table
 * (booking_ref UNIQUE): a repeated or double-clicked checkout returns the first outcome
 * instead of charging or booking again. Concurrent requests for the same ref share one run.
 */
export interface BookingStore {
  /** Runs `work` once per ref; later or concurrent calls get the same promise/result. */
  once<T>(ref: string, work: () => Promise<T>): Promise<T>;
}

export class MemoryBookingStore implements BookingStore {
  private runs = new Map<string, Promise<unknown>>();
  once<T>(ref: string, work: () => Promise<T>): Promise<T> {
    const existing = this.runs.get(ref);
    if (existing) return existing as Promise<T>;
    const p = work();
    this.runs.set(ref, p);
    return p;
  }
}
