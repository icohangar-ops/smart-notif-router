import { Router, Request, Response } from 'express';
import { getDatabase } from '../models/database';

const router = Router();

/**
 * @openapi
 * tags:
 *   name: Channels
 *   description: Manage delivery channels (email, webhook, SMS)
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     ChannelInput:
 *       type: object
 *       required:
 *         - type
 *         - name
 *       properties:
 *         type:
 *           type: string
 *           enum: [email, webhook, sms]
 *           example: "email"
 *         name:
 *           type: string
 *           example: "Ops Team Email"
 *         config:
 *           type: object
 *           example: { "smtp_host": "smtp.example.com", "from_email": "ops@example.com" }
 *           description: Channel-specific configuration (JSON)
 *     Channel:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         type:
 *           type: string
 *         name:
 *           type: string
 *         config:
 *           type: object
 *         is_active:
 *           type: integer
 *         created_at:
 *           type: string
 */

/**
 * @openapi
 * /api/channels:
 *   get:
 *     summary: List all channels
 *     tags: [Channels]
 *     responses:
 *       200:
 *         description: List of channels
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Channel'
 */
router.get('/', (_req: Request, res: Response) => {
  const db = getDatabase();
  const channels = db.prepare('SELECT * FROM channels ORDER BY created_at DESC').all();
  res.json({ success: true, data: channels });
});

/**
 * @openapi
 * /api/channels:
 *   post:
 *     summary: Create a channel
 *     tags: [Channels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChannelInput'
 *     responses:
 *       201:
 *         description: Channel created
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { type, name, config = {} } = req.body;
    if (!type || !name) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'type and name are required' } });
    }
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO channels (type, name, config) VALUES (?, ?, ?)'
    ).run(type, name, JSON.stringify(config));
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: channel });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'CREATE_ERROR', message: error instanceof Error ? error.message : 'Failed to create channel' } });
  }
});

/**
 * @openapi
 * /api/channels/{id}:
 *   put:
 *     summary: Update a channel
 *     tags: [Channels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               config:
 *                 type: object
 *               is_active:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Channel updated
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    }
    const { name, config, is_active } = req.body;
    if (name !== undefined) db.prepare('UPDATE channels SET name = ? WHERE id = ?').run(name, req.params.id);
    if (config !== undefined) db.prepare('UPDATE channels SET config = ? WHERE id = ?').run(JSON.stringify(config), req.params.id);
    if (is_active !== undefined) db.prepare('UPDATE channels SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: channel });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_ERROR', message: error instanceof Error ? error.message : 'Failed to update channel' } });
  }
});

/**
 * @openapi
 * /api/channels/{id}:
 *   delete:
 *     summary: Delete a channel
 *     tags: [Channels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Channel deleted
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'DELETE_ERROR', message: error instanceof Error ? error.message : 'Failed to delete channel' } });
  }
});

export default router;
