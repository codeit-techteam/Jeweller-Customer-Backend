import { countRows, fetchRows } from "./_helpers.js";

const REQUIRED_PRODUCTS = 5;

function normalizeDocType(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .trim();
}

function hasDocumentType(docs, ...types) {
  const wanted = types.map((t) => normalizeDocType(t));
  return docs.some((doc) => {
    if (!doc.file_url?.trim()) return false;
    const kind = normalizeDocType(doc.type ?? doc.doc_type);
    return wanted.some((t) => kind === t || kind.includes(t));
  });
}

/**
 * Actionable onboarding / verification status for a boutique.
 * GET /api/analytics/boutique-pending-actions
 */
export async function getBoutiquePendingActions(query = {}) {
  const boutiqueId = String(query.boutiqueId || query.boutique_id || "").trim();
  if (!boutiqueId) {
    const err = new Error("boutiqueId is required");
    err.statusCode = 400;
    throw err;
  }

  const [boutiqueRows, businessDocs, verificationDocs, productsUploaded] = await Promise.all([
    fetchRows(
      "boutiques",
      "id, name, store_status, verification_status, is_onboarding_done, onboarding_step",
      [["id", "eq", boutiqueId]],
      { limit: 1 },
    ),
    fetchRows(
      "business_documents",
      "boutique_id, type, file_url, status",
      [["boutique_id", "eq", boutiqueId]],
      { limit: 20 },
    ),
    fetchRows(
      "boutique_verification_documents",
      "boutique_id, doc_type, file_url, status",
      [["boutique_id", "eq", boutiqueId]],
      { limit: 20 },
    ),
    countRows("products", [
      ["boutique_id", "eq", boutiqueId],
      ["is_draft", "eq", false],
    ]),
  ]);

  const boutique = boutiqueRows[0];
  if (!boutique) {
    const err = new Error("Boutique not found");
    err.statusCode = 404;
    throw err;
  }

  const docs = [
    ...(businessDocs ?? []).map((row) => ({
      type: row.type,
      file_url: row.file_url,
      status: row.status,
    })),
    ...(verificationDocs ?? []).map((row) => ({
      type: row.doc_type,
      file_url: row.file_url,
      status: row.status,
    })),
  ];

  const gstUploaded = hasDocumentType(docs, "gst");
  const panUploaded = hasDocumentType(docs, "pan");
  const hallmarkUploaded = hasDocumentType(docs, "bis", "hallmark");

  const storeStatus = String(boutique.store_status ?? "pending").toLowerCase();
  const verificationStatus = String(boutique.verification_status ?? "PENDING").toUpperCase();

  const pendingSteps = [];

  if (!gstUploaded) {
    pendingSteps.push({
      key: "gst",
      label: "Upload GST Certificate",
      status: "pending",
      priority: "high",
    });
  } else if (verificationStatus === "PENDING" && storeStatus !== "approved") {
    pendingSteps.push({
      key: "gst_verification",
      label: "GST Verification Pending",
      status: "pending",
      priority: "medium",
    });
  } else {
    pendingSteps.push({ key: "gst", label: "GST Certificate", status: "completed", priority: "low" });
  }

  if (!hallmarkUploaded) {
    pendingSteps.push({
      key: "hallmark",
      label: "Upload Hallmark Certificate",
      status: "pending",
      priority: "high",
    });
  } else {
    pendingSteps.push({
      key: "hallmark",
      label: "Hallmark Certificate",
      status: "completed",
      priority: "low",
    });
  }

  if (!panUploaded) {
    pendingSteps.push({
      key: "pan",
      label: "Upload PAN Document",
      status: "pending",
      priority: "medium",
    });
  } else {
    pendingSteps.push({ key: "pan", label: "PAN Document", status: "completed", priority: "low" });
  }

  const productsRemaining = Math.max(0, REQUIRED_PRODUCTS - productsUploaded);
  if (productsRemaining > 0) {
    pendingSteps.push({
      key: "products",
      label: `Upload ${productsRemaining} More Product${productsRemaining === 1 ? "" : "s"}`,
      status: "pending",
      priority: "high",
    });
  } else {
    pendingSteps.push({
      key: "products",
      label: `${productsUploaded} Products Uploaded`,
      status: "completed",
      priority: "low",
    });
  }

  if (storeStatus === "pending" && !boutique.is_onboarding_done) {
    pendingSteps.push({
      key: "store_submit",
      label: "Store not submitted",
      status: "pending",
      priority: "high",
    });
  } else if (storeStatus === "review") {
    pendingSteps.push({
      key: "store_review",
      label: "Awaiting admin review",
      status: "pending",
      priority: "medium",
    });
  }

  const hasPending = pendingSteps.some((step) => step.status === "pending");

  return {
    boutiqueId,
    boutiqueName: boutique.name,
    gstUploaded,
    panUploaded,
    hallmarkUploaded,
    productsUploaded,
    requiredProducts: REQUIRED_PRODUCTS,
    storeStatus,
    verificationStatus,
    hasPendingActions: hasPending,
    pendingSteps,
  };
}
