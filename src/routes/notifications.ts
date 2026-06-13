import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { queueNotification } from '../workers/delivery.worker';
import { requireAuth, rateLimit } from '../middleware/auth';

const router = Router();

// Rate limit for the create route: 60 requests/minute per client IP.
const createRateLimit = rateLimit({ limit: 60, windowMs: 60_000 });

/**
 * @openapi
 * tags:
 *   name: Notifications
 *   description: AI-powered notification creation, routing, and management
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     CreateNotification:
 *       type: object
 *       required:
 *         - title
 *         - message
 *       properties:
 *         title:
 *           type: string
 *           example: "Server CPU usage exceeded 95%"
 *           description: Notification title/subject
 *         message:
 *           type: string
 *           example: "Production server prod-web-03 has been running at 95% CPU for the last 15 minutes. Immediate investigation recommended."
 *           description: Notification body/content
 *         source:
 *           type: string
 *           example: "monitoring"
 *           description: Source system that generated the notification
 *         channel_override:
 *           type: array
 *           items:
 *             type: string
 *             enum: [email, webhook, sms]
 *           example: ["email", "sms"]
 *           description: Override AI-selected channels
 *         recipient:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *               example: "admin@company.com"
 *             phone:
 *               type: string
 *               example: "+1234567890"
 *             webhook_url:
 *               type: string
 *               example: "https://hooks.slack.com/services/xxx"
 *     Notification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         source:
 *           type: string
 *         priority:
 *           type: string
 *           enum: [low, normal, urgent, critical]
 *         status:
 *           type: string
 *           enum: [pending, routed, delivered, failed]
 *         channels:
 *           type: array
 *           items:
 *             type: string
 *         created_at:
 *           type: string
 *         updated_at:
 *           type: string
 *     AIAnalysis:
 *       type: object
 *       properties:
 *         priority:
 *           type: string
 *         suggestedChannels:
 *           type: array
 *           items:
 *             type: string
 *         usedChannels:
 *           type: array
 *           items:
 *             type: string
 *         isDuplicate:
 *           type: boolean
 *         confidence:
 *           type: number
 *         reasoning:
 *           type: string
 *     DeliveryAttempt:
 *       type: object
 *       properties:
 *         channel:
 *           type: string
 *         success:
 *           type: boolean
 *         messageId:
 *           type: string
 *         error:
 *           type: string
 */

/**
 * @openapi
 * /api/notifications:
 *   post:
 *     summary: Create and route a notification
 *     description: Create a new notification. The AI engine analyzes the content, scores its priority, selects the best delivery channels, and delivers it to each channel.
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateNotification'
 *           examples:
 *             urgent_alert:
 *               summary: Urgent server alert
 *               value:
 *                 title: "Server CPU Critical"
 *                 message: "prod-web-03 CPU at 98% for 20 minutes. Auto-scaling triggered but insufficient."
 *                 source: "datadog"
 *                 recipient:
 *                   email: "ops@company.com"
 *                   phone: "+1234567890"
 *             webhook_integration:
 *               summary: CI/CD webhook notification
 *               value:
 *                 title: "Build #4521 Failed"
 *                 message: "Frontend build failed in pipeline main. TypeScript compilation error in src/components/Dashboard.tsx"
 *                 source: "github-actions"
 *                 channel_override: ["webhook"]
 *                 recipient:
 *                   webhook_url: "https://hooks.slack.com/services/xxx"
 *     responses:
 *       201:
 *         description: Notification created and routed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notification:
 *                   $ref: '#/components/schemas/Notification'
 *                 aiAnalysis:
 *                   $ref: '#/components/schemas/AIAnalysis'
 *                 delivery:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DeliveryAttempt'
 *       400:
 *         description: Invalid input
 */
router.post('/', requireAuth, createRateLimit, async (req: Request, res: Response) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'title and message are required' },
      });
    }
    const result = await notificationService.createNotification(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_ERROR', message: error instanceof Error ? error.message : 'Failed to create notification' },
    });
  }
});

/**
 * @openapi
 * /api/notifications:
 *   get:
 *     summary: List all notifications
 *     description: Retrieve paginated list of notifications with optional filtering by status, priority, or channel.
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, routed, delivered, failed]
 *         description: Filter by status
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, normal, urgent, critical]
 *         description: Filter by priority
 *       - in: query
 *         name: channel
 *         schema:
 *           type: string
 *           enum: [email, webhook, sms]
 *         description: Filter by channel
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Results offset
 *     responses:
 *       200:
 *         description: List of notifications
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
 *                     notifications:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Notification'
 *                     total:
 *                       type: integer
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const { status, priority, channel, limit, offset } = req.query;
    const result = notificationService.listNotifications({
      status: status as any,
      priority: priority as any,
      channel: channel as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: error instanceof Error ? error.message : 'Failed to list notifications' },
    });
  }
});

/**
 * @openapi
 * /api/notifications/{id}:
 *   get:
 *     summary: Get notification details
 *     description: Retrieve a single notification with its delivery logs.
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification UUID
 *     responses:
 *       200:
 *         description: Notification details with delivery logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Notification'
 *       404:
 *         description: Notification not found
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const notification = notificationService.getNotification(req.params.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'GET_ERROR', message: error instanceof Error ? error.message : 'Failed to get notification' },
    });
  }
});

/**
 * @openapi
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     description: Delete a notification and all its delivery logs.
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification UUID
 *     responses:
 *       200:
 *         description: Notification deleted
 *       404:
 *         description: Notification not found
 */
router.delete('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    notificationService.deleteNotification(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to delete';
    const status = msg.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      error: { code: 'DELETE_ERROR', message: msg },
    });
  }
});

/**
 * @openapi
 * /api/notifications/{id}/retry:
 *   post:
 *     summary: Retry a failed notification
 *     description: Re-process a failed notification through the AI router and attempt delivery again.
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification UUID
 *     responses:
 *       200:
 *         description: Notification retried
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Only failed notifications can be retried
 *       404:
 *         description: Notification not found
 */
router.post('/:id/retry', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await notificationService.retryNotification(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to retry';
    const status = msg.includes('not found') ? 404 : msg.includes('Only failed') ? 400 : 500;
    res.status(status).json({
      success: false,
      error: { code: 'RETRY_ERROR', message: msg },
    });
  }
});

/**
 * @openapi
 * /api/notifications/analytics:
 *   get:
 *     summary: Get notification analytics
 *     description: Retrieve aggregated analytics: counts by status, priority, channel, and time range.
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Analytics summary
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
 *                     total:
 *                       type: integer
 *                     recent24h:
 *                       type: integer
 *                     byStatus:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     byPriority:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           priority:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     byChannel:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           channel:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           delivered:
 *                             type: integer
 *                           failed:
 *                             type: integer
 */
router.get('/analytics/summary', (_req: Request, res: Response) => {
  try {
    const analytics = notificationService.getAnalytics();
    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ANALYTICS_ERROR', message: error instanceof Error ? error.message : 'Failed to get analytics' },
    });
  }
});

export default router;
