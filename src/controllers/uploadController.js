import crypto from 'node:crypto';
import multer from 'multer';
import { supabase } from '../config/supabase.js';

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const PDF_MIMES = ['application/pdf'];
const SUPPORT_MIMES = [...IMAGE_MIMES, ...PDF_MIMES];
const VIDEO_MIMES = ['video/mp4'];
const IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;
const VIDEO_LIMIT_BYTES = 50 * 1024 * 1024;

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_LIMIT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      const error = new Error('Unsupported image type. Allowed: jpg, jpeg, png, webp');
      error.statusCode = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VIDEO_LIMIT_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!VIDEO_MIMES.includes(file.mimetype)) {
      const error = new Error('Unsupported video type. Allowed: mp4 only');
      error.statusCode = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

export const uploadProductImageMiddleware = imageUpload.single('file');
export const uploadBoutiqueImageMiddleware = imageUpload.single('file');
export const uploadProductVideoMiddleware = videoUpload.single('file');
export const uploadCmsImageMiddleware = imageUpload.single('file');

const supportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!SUPPORT_MIMES.includes(file.mimetype)) {
      const error = new Error('Unsupported file. Allowed: jpg, png, webp, pdf');
      error.statusCode = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});

export const uploadSupportAttachmentMiddleware = supportUpload.single('file');

function resolveProductFolder(req) {
  const raw = String(req.body?.productId ?? '').trim();
  return raw || 'unassigned';
}

function resolveBoutiqueUploadPath(req, file) {
  const boutiqueId = String(req.body?.boutiqueId ?? '').trim();
  if (!boutiqueId) {
    const error = new Error('boutiqueId is required');
    error.statusCode = 400;
    throw error;
  }
  const kindRaw = String(req.body?.kind ?? 'gallery').trim().toLowerCase();
  const kind = ['cover', 'logo', 'gallery'].includes(kindRaw) ? kindRaw : 'gallery';
  const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'bin';
  return `${boutiqueId}/${kind}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

async function uploadToBucket({ bucket, file, productFolder }) {
  const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'bin';
  const path = `${productFolder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
    cacheControl: '31536000',
  });
  if (uploadError) {
    throw new Error(`Failed to upload file: ${uploadError.message}`);
  }
  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
  return {
    path,
    url: publicData.publicUrl,
    size: file.size,
    mime: file.mimetype,
  };
}

export async function uploadProductImageHandler(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Image file is required',
      });
    }

    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Unsupported image type. Allowed: jpg, jpeg, png, webp',
      });
    }

    if (file.size > IMAGE_LIMIT_BYTES) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Image file too large. Max allowed is 10MB',
      });
    }

    const uploadMeta = await uploadToBucket({
      bucket: 'product-images',
      file,
      productFolder: resolveProductFolder(req),
    });

    return res.status(201).json({
      success: true,
      data: uploadMeta,
      message: 'Product image uploaded successfully',
    });
  } catch (error) {
    return next(error);
  }
}

const BOUTIQUE_IMAGE_LIMIT_BYTES = 8 * 1024 * 1024;

export async function uploadBoutiqueImageHandler(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Image file is required',
      });
    }

    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Unsupported image type. Allowed: jpg, jpeg, png, webp',
      });
    }

    if (file.size > BOUTIQUE_IMAGE_LIMIT_BYTES) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Image file too large. Max allowed is 8MB',
      });
    }

    const path = resolveBoutiqueUploadPath(req, file);
    const { error: uploadError } = await supabase.storage.from('boutique-images').upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '31536000',
    });
    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }
    const { data: publicData } = supabase.storage.from('boutique-images').getPublicUrl(path);

    return res.status(201).json({
      success: true,
      data: {
        path,
        url: publicData.publicUrl,
        size: file.size,
        mime: file.mimetype,
      },
      message: 'Boutique image uploaded successfully',
    });
  } catch (error) {
    return next(error);
  }
}

const CMS_IMAGE_LIMIT_BYTES = 8 * 1024 * 1024;
const CMS_ALLOWED_FOLDERS = new Set([
  'occasions',
  'collections',
  'categories',
  'menu',
  'featured',
  'relationships',
  'offers',
  'gifts',
  'notifications',
  'generic',
]);

function resolveCmsFolder(req) {
  const raw = String(req.body?.folder ?? 'generic').trim().toLowerCase();
  return CMS_ALLOWED_FOLDERS.has(raw) ? raw : 'generic';
}

export async function uploadCmsImageHandler(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Image file is required',
      });
    }

    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Unsupported image type. Allowed: jpg, jpeg, png, webp',
      });
    }

    if (file.size > CMS_IMAGE_LIMIT_BYTES) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Image file too large. Max allowed is 8MB',
      });
    }

    const folder = resolveCmsFolder(req);
    const ext = file.originalname.includes('.')
      ? file.originalname.split('.').pop()
      : 'bin';
    const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from('cms-images').upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
      cacheControl: '31536000',
    });
    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }
    const { data: publicData } = supabase.storage.from('cms-images').getPublicUrl(path);

    return res.status(201).json({
      success: true,
      data: {
        path,
        url: publicData.publicUrl,
        size: file.size,
        mime: file.mimetype,
        folder,
      },
      message: 'CMS image uploaded successfully',
    });
  } catch (error) {
    return next(error);
  }
}

export async function uploadSupportAttachmentHandler(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'File is required',
      });
    }

    const userFolder = String(req.body?.userId ?? 'anonymous').trim() || 'anonymous';
    const ext = file.originalname.includes('.')
      ? file.originalname.split('.').pop()
      : 'bin';
    const path = `${userFolder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('support-attachments')
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
        cacheControl: '31536000',
      });
    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }
    const { data: publicData } = supabase.storage
      .from('support-attachments')
      .getPublicUrl(path);

    return res.status(201).json({
      success: true,
      data: {
        path,
        url: publicData.publicUrl,
        size: file.size,
        mime: file.mimetype,
        messageType: PDF_MIMES.includes(file.mimetype) ? 'pdf' : 'image',
      },
      message: 'Support attachment uploaded',
    });
  } catch (error) {
    return next(error);
  }
}

export async function uploadProductVideoHandler(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Video file is required',
      });
    }

    if (!VIDEO_MIMES.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Unsupported video type. Allowed: mp4',
      });
    }

    if (file.size > VIDEO_LIMIT_BYTES) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Maximum video size is 50MB',
      });
    }

    const uploadMeta = await uploadToBucket({
      bucket: 'product-videos',
      file,
      productFolder: resolveProductFolder(req),
    });

    return res.status(201).json({
      success: true,
      data: uploadMeta,
      message: 'Product video uploaded successfully',
    });
  } catch (error) {
    return next(error);
  }
}
