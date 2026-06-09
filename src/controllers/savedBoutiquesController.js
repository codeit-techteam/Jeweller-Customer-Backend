import {
  getSavedBoutiquesForUser,
  saveBoutiqueForUser,
  unsaveBoutiqueForUser,
} from '../services/savedBoutiquesService.js';

export async function fetchSavedBoutiques(req, res, next) {
  try {
    const userId = req.params.userId ?? req.params.user_id ?? req.query.user_id;
    console.log('[savedBoutiquesController] GET /api/saved-boutiques', { userId });
    const data = await getSavedBoutiquesForUser(userId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function saveBoutique(req, res, next) {
  try {
    const { user_id: userId, boutique_id: boutiqueId } = req.body ?? {};
    console.log('[savedBoutiquesController] POST /api/saved-boutiques', {
      userId,
      boutiqueId,
    });
    const data = await saveBoutiqueForUser(userId, boutiqueId);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}

export async function unsaveBoutique(req, res, next) {
  try {
    const { user_id: userId, boutique_id: boutiqueId } = req.body ?? {};
    console.log('[savedBoutiquesController] DELETE /api/saved-boutiques', {
      userId,
      boutiqueId,
    });
    await unsaveBoutiqueForUser(userId, boutiqueId);
    return res.status(200).json({ success: true, data: true });
  } catch (error) {
    return next(error);
  }
}

