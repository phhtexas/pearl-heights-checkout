import { redirect } from "next/navigation";

/**
 * Shareable preview of the booking confirmation screen with sample details (Oscar, Nov 18). Test site only:
 * pearlheightshomes.com closes /preview (middleware). Dates are about two months out so a real price shows.
 */
export const dynamic = "force-dynamic";
export default function Page() {
  const d = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  redirect(`/?home=claywell&checkIn=${d(60)}&checkOut=${d(63)}&adults=2&preview=confirmation`);
}
