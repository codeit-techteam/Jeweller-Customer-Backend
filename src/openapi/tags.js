/**
 * OpenAPI tag metadata keyed by first URL segment after /api/.
 * Add an entry when you introduce a new mount prefix for richer docs grouping.
 */
export const TAG_METADATA = {
  health: {
    name: "Health",
    description: "Service health and readiness checks.",
  },
  dashboard: {
    name: "Dashboard",
    description: "Admin dashboard aggregates and analytics snapshots.",
  },
  analytics: {
    name: "Analytics",
    description: "Super-admin analytics, exports, and event tracking.",
  },
  users: {
    name: "Users",
    description: "User profile listing and management.",
  },
  categories: {
    name: "Categories",
    description: "Product category CMS operations.",
  },
  products: {
    name: "Products",
    description: "Product catalog CRUD and trending listings.",
  },
  boutiques: {
    name: "Boutiques",
    description: "Boutique discovery, details, and management.",
  },
  "recently-viewed": {
    name: "Recently Viewed",
    description: "Per-user recently viewed product history.",
  },
  appointments: {
    name: "Appointments",
    description: "Boutique appointment scheduling and updates.",
  },
  "saved-boutiques": {
    name: "Saved Boutiques",
    description: "User saved boutique bookmarks.",
  },
  collections: {
    name: "Collections",
    description: "Curated product collections.",
  },
  occasions: {
    name: "Occasions",
    description: "Occasion-based merchandising CMS.",
  },
  "menu-categories": {
    name: "Menu Categories",
    description: "Navigation menu category CMS.",
  },
  "featured-sections": {
    name: "Featured Sections",
    description: "Homepage featured section CMS.",
  },
  offers: {
    name: "Offers",
    description: "Promotional offers CMS.",
  },
  "gift-collections": {
    name: "Gift Collections",
    description: "Gift collection CMS.",
  },
  "relationship-sections": {
    name: "Relationship Sections",
    description: "Relationship-based discovery sections.",
  },
  "featured-products": {
    name: "Featured Products",
    description: "Featured product slots and ordering.",
  },
  "search-history": {
    name: "Search History",
    description: "Authenticated user search history.",
  },
  wishlist: {
    name: "Wishlist",
    description: "Authenticated user wishlist.",
  },
  uploads: {
    name: "Uploads",
    description: "Multipart media uploads (images and video).",
  },
};

/** @param {string} apiPath e.g. /api/products/:id */
export function resolveTag(apiPath) {
  const match = apiPath.match(/^\/api\/([^/]+)/);
  if (!match) {
    return { name: "System", description: "Root and system endpoints." };
  }
  const segment = match[1];
  const meta = TAG_METADATA[segment];
  if (meta) return meta;
  const label = segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { name: label, description: `${label} API endpoints.` };
}
