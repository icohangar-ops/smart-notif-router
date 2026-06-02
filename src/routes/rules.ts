import { Router, Request, Response } from 'express';
import { getDatabase } from '../models/database';

const router = Router();

/**
 * @openapi
 * tags:
 *   name: Routing Rules
 *   description: Manage AI routing rules that override or supplement AI-driven decisions
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     RuleInput:
 *       type: object
 *       required:
 *         - name
 *         - channel
 *       properties:
 *         name:
 *           type: string
 *           example: "Critical alerts to SMS"
 *         description:
 *           type: string
 *           example: "Route all critical-priority notifications to SMS"
 *         conditions:
 *           type: object
 *           example: { "source": "monitoring", "priority": "critical" }
 *         channel:
 *           type: string
 *           enum: [email, webhook, sms]
 *           example: "sms"
 *         priority_override:
 *           type: string
 *           enum: [low, normal, urgent, critical]
 *     RoutingRule:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         conditions:
 *           type: object
 *         channel:
 *           type: string
 *         priority_override:
 *           type: string
 *         is_active:
 *           type: integer
 *         created_at:
 *           type: string
 *         updated_at:
 *           type: string
 */

/**
 * @openapi
 * /api/rules:
 *   get:
 *     summary: List routing rules
 *     tags: [Routing Rules]
 *     responses:
 *       200:
 *         description: List of routing rules
 */
router.get('/', (_req: Request, res: Response) => {
  const db = getDatabase();
  const rules = db.prepare('SELECT * FROM routing_rules ORDER BY created_at DESC').all();
  res.json({ success: true, data: rules });
});

/**
 * @openapi
 * /api/rules:
 *   post:
 *     summary: Create a routing rule
 *     tags: [Routing Rules]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RuleInput'
 *     responses:
 *       201:
 *         description: Rule created
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description = '', conditions = {}, channel, priority_override } = req.body;
    if (!name || !channel) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and channel are required' } });
    }
    const db = getDatabase();
    const result = db.prepare(
      'INSERT INTO routing_rules (name, description, conditions, channel, priority_override) VALUES (?, ?, ?, ?, ?)'
    ).run(name, description, JSON.stringify(conditions), channel, priority_override || null);
    const rule = db.prepare('SELECT * FROM routing_rules WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'CREATE_ERROR', message: error instanceof Error ? error.message : 'Failed to create rule' } });
  }
});

/**
 * @openapi
 * /api/rules/{id}:
 *   put:
 *     summary: Update a routing rule
 *     tags: [Routing Rules]
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
 *               description:
 *                 type: string
 *               conditions:
 *                 type: object
 *               channel:
 *                 type: string
 *               priority_override:
 *                 type: string
 *               is_active:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Rule updated
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM routing_rules WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
    }
    const { name, description, conditions, channel, priority_override, is_active } = req.body;
    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (conditions !== undefined) { updates.push('conditions = ?'); values.push(JSON.stringify(conditions)); }
    if (channel !== undefined) { updates.push('channel = ?'); values.push(channel); }
    if (priority_override !== undefined) { updates.push('priority_override = ?'); values.push(priority_override); }
    if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(req.params.id);
      db.prepare(`UPDATE routing_rules SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    const rule = db.prepare('SELECT * FROM routing_rules WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_ERROR', message: error instanceof Error ? error.message : 'Failed to update rule' } });
  }
});

/**
 * @openapi
 * /api/rules/{id}:
 *   delete:
 *     summary: Delete a routing rule
 *     tags: [Routing Rules]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Rule deleted
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM routing_rules WHERE id = ?').run(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'DELETE_ERROR', message: error instanceof Error ? error.message : 'Failed to delete rule' } });
  }
});

export default router;
