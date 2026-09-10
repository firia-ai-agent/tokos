import { permanentRedirect } from "next/navigation";

/**
 * "Visits" is what the nav and the family call the calendar, so /portal/visits is the
 * URL people type and share — it 404'd. The alias lives inside the portal segment so
 * the client auth layout still runs first; a signed-out hop lands on login, then here.
 */
export default function VisitsAliasPage() {
  permanentRedirect("/portal/calendar");
}
