import { supabase } from "../config/supabase.js";
import { withRetry, withTimeout } from "../utils/retry.js";

export async function fetchUsers(_req, res, next) {
  try {
    const { data, error } = await withTimeout(
      () =>
        withRetry(
          async () =>
            supabase
              .from("users_profile")
              .select("id, full_name, phone, profile_image, created_at")
              .order("created_at", { ascending: false }),
          { retries: 1, baseDelayMs: 250 },
        ),
      12000,
    );

    if (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }

    const users = (data ?? []).map((row) => ({
      id: row.id,
      name: row.full_name ?? "Unknown User",
      phone: row.phone ?? null,
      profile_image: row.profile_image ?? null,
      created_at: row.created_at ?? null,
    }));

    return res.status(200).json({
      success: true,
      data: users,
      message: "Users fetched successfully",
    });
  } catch (error) {
    return next(error);
  }
}
