import {
  clearSearchHistory,
  deleteSearchHistoryEntry,
  listSearchHistory,
  recordSearchKeyword,
} from '../services/searchHistoryService.js';

export async function fetchSearchHistory(req, res, next) {
  try {
    const userId = req.userId;
    const data = await listSearchHistory(userId);
    return res.status(200).json({ success: true, data, message: 'Search history fetched' });
  } catch (error) {
    return next(error);
  }
}

export async function createSearchHistoryHandler(req, res, next) {
  try {
    const userId = req.userId;
    const keyword = req.body?.keyword ?? req.body?.q;
    const data = await recordSearchKeyword(userId, keyword);
    return res.status(201).json({ success: true, data, message: 'Recorded' });
  } catch (error) {
    return next(error);
  }
}

export async function deleteSearchHistoryItemHandler(req, res, next) {
  try {
    const userId = req.userId;
    const data = await deleteSearchHistoryEntry(userId, req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, message: 'Not found' });
    }
    return res.status(200).json({ success: true, data, message: 'Removed' });
  } catch (error) {
    return next(error);
  }
}

export async function clearSearchHistoryHandler(req, res, next) {
  try {
    await clearSearchHistory(req.userId);
    return res.status(200).json({ success: true, data: null, message: 'Cleared' });
  } catch (error) {
    return next(error);
  }
}
