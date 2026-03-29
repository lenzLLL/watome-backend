import express from 'express';
import { payunitWebhook } from '../controllers/authController.js';

const router = express.Router();

// PayUnit webhook - no authentication required (external service)
router.post('/payunit', payunitWebhook);

// Test endpoint to verify webhook is accessible
router.get('/test', (req, res) => {
  res.json({
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    url: req.originalUrl
  });
});

export default router;