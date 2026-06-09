import { Router } from "express";
import { fetchUsers } from "../controllers/userController.js";

const router = Router();

router.get("/", fetchUsers);

export default router;
