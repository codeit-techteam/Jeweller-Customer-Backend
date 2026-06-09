/** Jeweller-owned fields — admin cannot mutate these on owned products. */
export const JEWELLER_OWNED_FIELDS = [
  'name',
  'price',
  'description',
  'image',
  'featured_image',
  'thumbnail',
  'primary_image',
  'images',
  'videos',
  'media',
  'video_url',
  'video_thumbnail',
  'available_sizes',
  'available_metals',
  'discount_percentage',
  'specifications',
  'price_breakup',
  'gender',
  'occasion',
  'style',
  'collection_name',
  'product_images',
];

/** Platform curation fields admin may still update on any product. */
export const ADMIN_CURATION_FIELDS = [
  'is_trending',
  'trending',
  'category_id',
  'rating',
  'reviews_count',
];

export const GOVERNANCE_STATUSES = {
  ACTIVE: 'ACTIVE',
  FLAGGED: 'FLAGGED',
  SUSPENDED: 'SUSPENDED',
  PENDING_CORRECTION: 'PENDING_CORRECTION',
  DRAFT: 'DRAFT',
  ARCHIVED: 'ARCHIVED',
};

/** Visible to customers in browse/detail APIs. */
export const CUSTOMER_VISIBLE_STATUSES = ['ACTIVE', 'FLAGGED'];

/** DB may still store legacy lowercase status values before governance migration. */
export const CUSTOMER_VISIBLE_STATUS_DB_VALUES = [
  ...CUSTOMER_VISIBLE_STATUSES,
  'active',
  'flagged',
];

export const FLAG_REASON_CODES = [
  'PRICE_SUSPICIOUS',
  'IMAGE_VIOLATION',
  'DESCRIPTION_MISLEADING',
  'OTHER',
];

export const CORRECTION_FIELD_NAMES = [
  'name',
  'price',
  'description',
  'images',
  'available_sizes',
  'available_metals',
  'specifications',
  'price_breakup',
];

export function normalizeGovernanceStatus(value) {
  if (!value) return GOVERNANCE_STATUSES.ACTIVE;
  const upper = String(value).trim().toUpperCase();
  const legacy = String(value).trim().toLowerCase();
  const map = {
    active: GOVERNANCE_STATUSES.ACTIVE,
    draft: GOVERNANCE_STATUSES.DRAFT,
    archived: GOVERNANCE_STATUSES.ARCHIVED,
  };
  if (map[legacy]) return map[legacy];
  if (Object.values(GOVERNANCE_STATUSES).includes(upper)) return upper;
  return GOVERNANCE_STATUSES.ACTIVE;
}

export function isCustomerVisibleStatus(status) {
  const normalized = normalizeGovernanceStatus(status);
  return CUSTOMER_VISIBLE_STATUSES.includes(normalized);
}

export function serializeFieldValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
