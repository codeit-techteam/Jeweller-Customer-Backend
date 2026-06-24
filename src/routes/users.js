import { Router } from "express";
import { fetchCustomerProfile, fetchUsers } from "../controllers/userController.js";

const router = Router();

router.get("/", fetchUsers);
router.get("/:id/profile", fetchCustomerProfile);

export default router;
