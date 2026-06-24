import { supabase } from "../config/supabase.js";
import { listAppointmentsForUser } from "./appointmentService.js";
import { getWishlistForUser } from "./wishlistService.js";
import { listCustomerConversations } from "./supportChatService.js";

function mapAppointmentStatus(status) {
  const s = String(status ?? "upcoming").toLowerCase();
  if (s === "completed") return "completed";
  if (s === "cancelled") return "cancelled";
  if (s === "upcoming") return "confirmed";
  return "pending";
}

function mapSupportStatus(status) {
  const s = String(status ?? "open").toLowerCase();
  if (s === "resolved") return "resolved";
  if (s === "closed") return "closed";
  if (s === "in_progress" || s === "assigned" || s === "waiting_for_customer") {
    return "in_progress";
  }
  return "open";
}

function deriveCustomerType(appointmentCount, wishlistCount, createdAt) {
  const daysSinceJoin = createdAt
    ? (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
    : 999;
  if (appointmentCount === 0 && wishlistCount === 0 && daysSinceJoin < 30) return "new";
  if (appointmentCount >= 5 || wishlistCount >= 5) return "regular";
  return appointmentCount > 0 || wishlistCount > 0 ? "regular" : "new";
}

function buildTimeline(user, appointments, wishlist, supportTickets) {
  const events = [
    {
      id: "tl-created",
      type: "account_created",
      title: "Account Created",
      description: "Customer registered on the platform",
      occurredAt: user.created_at ?? new Date().toISOString(),
    },
  ];

  for (const apt of appointments.slice(0, 5)) {
    events.push({
      id: `tl-apt-${apt.id}`,
      type: "appointment_booked",
      title: "Appointment Booked",
      description: `${apt.serviceType} with ${apt.assignedJeweller}`,
      occurredAt: apt.startsAt ?? `${apt.date}T${apt.time ?? "00:00"}:00.000Z`,
    });
  }

  for (const item of wishlist.slice(0, 3)) {
    events.push({
      id: `tl-wl-${item.id}`,
      type: "wishlist_saved",
      title: "Product Saved to Wishlist",
      description: item.productName,
      occurredAt: item.addedDate,
    });
  }

  for (const ticket of supportTickets.slice(0, 3)) {
    events.push({
      id: `tl-sup-${ticket.id}`,
      type: "support_request_raised",
      title: "Support Request Raised",
      description: ticket.subject,
      occurredAt: ticket.createdDate,
    });
  }

  return events.sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

export async function getCustomerProfileForAdmin(userId) {
  const { data: profileRow, error: profileError } = await supabase
    .from("users_profile")
    .select("id, full_name, email, phone, profile_image, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to fetch user profile: ${profileError.message}`);
  }
  if (!profileRow) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  const user = {
    id: profileRow.id,
    name: profileRow.full_name?.trim() || "Unknown User",
    email: profileRow.email ?? null,
    phone: profileRow.phone ?? null,
    profile_image: profileRow.profile_image ?? null,
    created_at: profileRow.created_at ?? null,
  };

  const [wishlistRows, appointmentRows, supportRows] = await Promise.all([
    getWishlistForUser(userId).catch(() => []),
    listAppointmentsForUser(userId).catch(() => []),
    listCustomerConversations(userId, { limit: 50 }).catch(() => []),
  ]);

  const wishlist = wishlistRows.map((row) => ({
    id: row.id,
    productName: row.product?.name ?? "Unknown Product",
    productImage: row.product?.image ?? null,
    boutiqueName: row.product?.boutique?.name ?? null,
    addedDate: row.created_at,
    currentPrice: Number(row.product?.price ?? 0),
  }));

  const appointments = appointmentRows.map((row) => ({
    id: row.id,
    date: row.dateIso ?? row.date ?? "",
    time: row.time ?? "",
    serviceType: row.consultationType ?? "Consultation",
    assignedJeweller: row.boutiqueName ?? "—",
    status: mapAppointmentStatus(row.status),
    notes: null,
    startsAt: row.startsAt ?? null,
  }));

  const supportTickets = (supportRows ?? []).map((row) => ({
    id: row.id,
    ticketId: row.ticketNumber ?? row.id.slice(0, 8).toUpperCase(),
    subject: row.lastMessage?.slice(0, 80) ?? "Support conversation",
    status: mapSupportStatus(row.status),
    createdDate: row.createdAt ?? row.updatedAt ?? new Date().toISOString(),
    resolutionDate:
      row.status === "resolved" || row.status === "closed" ? row.updatedAt ?? null : null,
  }));

  const lastAppointment = appointments
    .map((a) => a.startsAt ?? (a.date ? `${a.date}T${a.time || "00:00"}:00.000Z` : null))
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const lastWishlist = wishlist
    .map((w) => w.addedDate)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const lastSupport = supportTickets
    .map((t) => t.createdDate)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const customerType = deriveCustomerType(
    appointments.length,
    wishlist.length,
    user.created_at,
  );

  const timeline = buildTimeline(user, appointments, wishlist, supportTickets);

  return {
    user,
    customerId: `CUS-${String(user.id).slice(0, 8).toUpperCase()}`,
    lastLoginAt: null,
    accountStatus: "active",
    mobileVerified: Boolean(user.phone),
    emailVerified: Boolean(user.email),
    customerType,
    kpis: {
      totalAppointments: appointments.length,
      wishlistItems: wishlist.length,
      savedAddresses: 0,
    },
    activitySummary: {
      lastAppOpened: null,
      lastAppointmentDate: lastAppointment,
      lastWishlistActivity: lastWishlist,
      lastSupportTicketDate: lastSupport,
    },
    timeline,
    appointments,
    wishlist,
    addresses: [],
    supportTickets,
  };
}
