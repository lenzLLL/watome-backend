import express from 'express';
import { 
  getPlanSubscriptions, 
  getPlanById, 
  createPlanSubscription,
  updatePlanSubscription,
  deletePlanSubscription
} from '../controllers/planController.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { roleCheck } from '../middleware/roles.js';

const router = express.Router();

// Get all plans (public)
router.get('/', getPlanSubscriptions);

// Get plan by ID (public)
router.get('/:id', getPlanById);

// Create plan (admin only)
router.post('/', verifyToken, roleCheck(['ADMIN']), createPlanSubscription);

// Update plan (admin only)
router.put('/:id', verifyToken, roleCheck(['ADMIN']), updatePlanSubscription);

// Delete plan (admin only)
router.delete('/:id', verifyToken, roleCheck(['ADMIN']), deletePlanSubscription);

export default router;
