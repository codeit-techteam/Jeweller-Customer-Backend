import { supabase } from "../config/supabase.js";
import { getCustomerProfileForAdmin } from "../services/customerProfileService.js";
import { withRetry, withTimeout } from "../utils/retry.js";

export async function fetchUsers(_req, res, next) {
  try {
    const { data, error } = await withTimeout(
      () =>
        withRetry(
          async () =>
            supabase
              .from("users_profile")
              .select("id, full_name, email, phone, profile_image, created_at")
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
      name: row.full_name?.trim() || "Unknown User",
      email: row.email ?? null,
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

export async function fetchCustomerProfile(req, res, next) {
  try {
    const userId = req.params.id;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        success: false,
        data: null,
        message: "User id is required",
      });
    }

    const profile = await getCustomerProfileForAdmin(userId.trim());
    return res.status(200).json({
      success: true,
      data: profile,
      message: "Customer profile fetched successfully",
    });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "User not found",
      });
    }
    return next(error);
  }
}
