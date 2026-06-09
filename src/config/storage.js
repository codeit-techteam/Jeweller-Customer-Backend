import { supabase } from './supabase.js';

export async function ensureStorageBuckets() {
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      throw error;
    }

    const hasBoutiqueImages = (data ?? []).some((bucket) => bucket.name === 'boutique-images');
    const hasProductImages = (data ?? []).some((bucket) => bucket.name === 'product-images');
    const hasProductVideos = (data ?? []).some((bucket) => bucket.name === 'product-videos');
    const hasCmsImages = (data ?? []).some((bucket) => bucket.name === 'cms-images');
    const hasSupportAttachments = (data ?? []).some(
      (bucket) => bucket.name === 'support-attachments',
    );

    if (!hasBoutiqueImages) {
      const { error: createError } = await supabase.storage.createBucket('boutique-images', {
        public: true,
        fileSizeLimit: 8 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });

      if (createError) {
        throw createError;
      }

      console.log('[storage] Created bucket: boutique-images');
    }

    if (!hasProductImages) {
      const { error: createError } = await supabase.storage.createBucket('product-images', {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });

      if (createError) {
        throw createError;
      }

      console.log('[storage] Created bucket: product-images');
    }

    const { error: updateProductImagesError } = await supabase.storage.updateBucket('product-images', {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (updateProductImagesError) {
      console.warn('[storage] Unable to update product-images bucket:', updateProductImagesError.message);
    }

    if (!hasProductVideos) {
      const { error: createError } = await supabase.storage.createBucket('product-videos', {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024,
        allowedMimeTypes: ['video/mp4'],
      });

      if (createError) {
        throw createError;
      }

      console.log('[storage] Created bucket: product-videos');
    }

    const { error: updateProductVideosError } = await supabase.storage.updateBucket('product-videos', {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ['video/mp4'],
    });
    if (updateProductVideosError) {
      console.warn('[storage] Unable to update product-videos bucket:', updateProductVideosError.message);
    }

    if (!hasCmsImages) {
      const { error: createError } = await supabase.storage.createBucket('cms-images', {
        public: true,
        fileSizeLimit: 8 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
      });
      if (createError) {
        throw createError;
      }
      console.log('[storage] Created bucket: cms-images');
    }

    const { error: updateCmsImagesError } = await supabase.storage.updateBucket('cms-images', {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    });
    if (updateCmsImagesError) {
      console.warn('[storage] Unable to update cms-images bucket:', updateCmsImagesError.message);
    }

    if (!hasSupportAttachments) {
      const { error: createError } = await supabase.storage.createBucket('support-attachments', {
        public: true,
        fileSizeLimit: 8 * 1024 * 1024,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
      });
      if (createError) {
        throw createError;
      }
      console.log('[storage] Created bucket: support-attachments');
    }
  } catch (error) {
    console.warn('[storage] Bucket setup skipped:', error?.message ?? error);
  }
}
