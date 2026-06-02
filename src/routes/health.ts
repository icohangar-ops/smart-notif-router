import { Router, Response } from 'express';
import { getDatabase } from '../models/database';
import { config } from '../config';

const router = Router();

/**
 * @openapi
 * tags:
 *   name: Health
 *   description: System health and status checks
 */

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Check system health including database connectivity, API version, and uptime.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     uptime:
 *                       type: number
 *                     database:
 *                       type: string
 *                       example: "connected"
 *                     redis:
 *                       type: string
 *                       example: "connected"
 *                     ai:
 *                       type: boolean
 *                     wooxy:
 *                       type: string
 */
router.get('/', (_req, res: Response) => {
  let dbStatus = 'disconnected';
  try {
    getDatabase().prepare('SELECT 1').get();
    dbStatus = 'connected';
  } catch { /* db not connected */ }

  const wooxyConfigured = config.wooxy.apiKey ? 'configured' : 'not configured (mock mode)';

  res.json({
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0',
      uptime: process.uptime(),
      database: dbStatus,
      redis: `redis://${config.redis.host}:${config.redis.port}`,
      ai: {
        enabled: config.ai.enabled,
        engine: 'GLM-4-Plus (z-ai-web-dev-sdk)',
      },
      wooxy: wooxyConfigured,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
