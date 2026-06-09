const t = (v) => (v == null ? null : String(v).trim() || null);

const arr = (v) => (Array.isArray(v) ? v.map(String).map((x) => x.trim()).filter(Boolean) : []);

export const withVersion = (url, updatedAt) => {
  const base = t(url);
  if (!base) return null;
  const version = t(updatedAt);
  if (!version) return base;
  return base.includes('?') ? `${base}&v=${encodeURIComponent(version)}` : `${base}?v=${encodeURIComponent(version)}`;
};

const firstHttp = (values = []) => values.map((v) => t(v)).find((v) => v && v.startsWith('http')) ?? null;

export function firstHttpFromJsonb(value) {
  if (value == null) return null;
  let raw = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw)) return null;
  return firstHttp(raw);
}

/**
 * Customer-facing cover: cover_image_url → image → gallery[0] → banner[0].
 */
export function resolveBoutiqueCoverUrl(row) {
  if (!row || typeof row !== 'object') return null;
  const version = row.updated_at ?? row.created_at ?? null;
  const fromCover = withVersion(row.cover_image_url, version);
  if (fromCover?.startsWith('http')) return fromCover;
  const fromImage = withVersion(row.image, version);
  if (fromImage?.startsWith('http')) return fromImage;
  const gallery = arr(row.gallery_images).length ? arr(row.gallery_images) : arr(row.banner_images);
  const fromGallery = firstHttp(gallery);
  if (fromGallery) return fromGallery;
  return firstHttpFromJsonb(row.gallery_images) ?? firstHttpFromJsonb(row.banner_images);
}

/** Logo only — no cover fallback. */
export function resolveBoutiqueLogoUrl(row) {
  if (!row || typeof row !== 'object') return null;
  const version = row.updated_at ?? row.created_at ?? null;
  const logo = withVersion(row.logo_url ?? row.logo_image ?? row.logo, version);
  return logo?.startsWith('http') ? logo : null;
}
