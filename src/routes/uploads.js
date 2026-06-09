import { Router } from 'express';
import {
  uploadBoutiqueImageHandler,
  uploadBoutiqueImageMiddleware,
  uploadCmsImageHandler,
  uploadCmsImageMiddleware,
  uploadSupportAttachmentHandler,
  uploadSupportAttachmentMiddleware,
  uploadProductImageHandler,
  uploadProductImageMiddleware,
  uploadProductVideoHandler,
  uploadProductVideoMiddleware,
} from '../controllers/uploadController.js';

const router = Router();

router.post('/product-image', uploadProductImageMiddleware, uploadProductImageHandler);
router.post('/boutique-image', uploadBoutiqueImageMiddleware, uploadBoutiqueImageHandler);
router.post('/product-video', uploadProductVideoMiddleware, uploadProductVideoHandler);
router.post('/cms-image', uploadCmsImageMiddleware, uploadCmsImageHandler);
router.post(
  '/support-attachment',
  uploadSupportAttachmentMiddleware,
  uploadSupportAttachmentHandler,
);

export default router;
