/** Calendar-day bounds in server local time. */
export function getCalendarDayBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidVisitorId(id) {
  return typeof id === "string" && UUID_RE.test(id.trim());
}

export function visitorKeyFromRow({ user_id, visitor_id }, linkMap = new Map()) {
  if (user_id) return `u:${user_id}`;
  if (visitor_id) {
    const linked = linkMap.get(visitor_id);
    if (linked) return `u:${linked}`;
    return `v:${visitor_id}`;
  }
  return null;
}

export async function loadVisitorUserLinkMap(supabase, visitorIds) {
  const ids = [...new Set(visitorIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { data } = await supabase
    .from("visitor_identity_links")
    .select("visitor_id, user_id")
    .in("visitor_id", ids);

  const map = new Map();
  for (const row of data || []) map.set(row.visitor_id, row.user_id);
  return map;
}
