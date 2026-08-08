// Central place that decides which screen a notification should open.
// Used both by the in-app notifications list (notifications.tsx) and by
// the OS-level push tap handler (app/_layout.tsx), so the logic never
// drifts out of sync between the two.

export type NotificationRouteInput = {
  // Preferred: send this explicitly from your push payload, e.g.
  // data: { route: "/medications" }
  route?: string;
  type?: string;
  title?: string;
  body?: string;
};

// One entry per notification `type`. This is the source of truth for
// routing — do NOT go back to matching keywords in title/body. That
// approach broke because e.g. emergency notifications about a missed
// "medicatieherinnering" (medication reminder) contain the substring
// "medicatie", which incorrectly matched the medication/stock check and
// sent every emergency notification to /medications.
const TYPE_ROUTES: Record<string, string> = {
  stock: "/medications",
  medication: "/medications",
  emergency: "/robot",
  battery: "/settings",
  // Privacy taps go to the home screen with a flag so it can show the
  // reassuring "camera access active" dialog. See app/(tabs)/index.tsx.
  privacy: "/?privacyAlert=1",
};

export function resolveNotificationRoute(
  input: NotificationRouteInput,
): string {
  // 1. If the server told us exactly where to go, trust it.
  if (input.route) return input.route;

  // 2. Route strictly by type — this is reliable, unlike text matching.
  const type = input.type?.toLowerCase();
  if (type && TYPE_ROUTES[type]) {
    return TYPE_ROUTES[type];
  }

  // 3. Narrow fallback ONLY for legacy notifications with no `type` at
  // all. Deliberately does not check body text — see comment above.
  const title = input.title?.toLowerCase() ?? "";
  if (title.includes("voorraad")) return "/medications";

  return "/";
}