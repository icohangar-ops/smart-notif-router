import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../models/database';
import type { Priority, ChannelType, NotificationStatus } from '../models/database';
import { aiRouterService } from './ai-router.service';
import { wooxyService } from './wooxy.service';
import { webhookService } from './webhook.service';
import { smsService } from './sms.service';

export interface CreateNotificationInput {
  title: string;
  message: string;
  source?: string;
  channel_override?: ChannelType[];
  recipient?: {
    email?: string;
    phone?: string;
    webhook_url?: string;
  };
}

export interface NotificationFilters {
  status?: NotificationStatus;
  priority?: Priority;
  channel?: ChannelType;
  limit?: number;
  offset?: number;
}

interface DeliveryAttempt {
  channel: ChannelType;
  success: boolean;
  messageId?: string;
  error?: string;
  response?: string;
}

export class NotificationService {
  /**
   * Create a new notification, run AI routing, and queue for delivery.
   */
  async createNotification(input: CreateNotificationInput) {
    const id = uuidv4();
    const db = getDatabase();

    // Step 1: Run AI routing analysis
    const aiResult = await aiRouterService.analyzeNotification({
      title: input.title,
      message: input.message,
      source: input.source || 'api',
    });

    // Step 2: Determine final channels (user override > AI suggestion)
    const channels = input.channel_override || aiResult.channels;

    // Step 3: Determine priority (AI-scored)
    const priority = aiResult.priority;

    // Step 4: Insert into database
    db.prepare(`
      INSERT INTO notifications (id, title, message, source, priority, status, channels)
      VALUES (?, ?, ?, ?, ?, 'routed', ?)
    `).run(id, input.title, input.message, input.source || 'api', priority, JSON.stringify(channels));

    // Step 5: Deliver to each channel
    const deliveryAttempts: DeliveryAttempt[] = [];
    for (const channel of channels) {
      try {
        const result = await this.deliverToChannel(channel, id, input, priority);
        deliveryAttempts.push(result);
      } catch (err) {
        deliveryAttempts.push({
          channel,
          success: false,
          error: err instanceof Error ? err.message : 'Delivery failed',
        });
      }
    }

    const allDelivered = deliveryAttempts.every(a => a.success);
    const finalStatus: NotificationStatus = allDelivered ? 'delivered' : 'failed';

    // Step 6: Update notification status
    db.prepare(`UPDATE notifications SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(finalStatus, id);

    // Step 7: Log each delivery attempt
    for (const attempt of deliveryAttempts) {
      const recipient = this.resolveRecipient(channel, input.recipient);
      db.prepare(`
        INSERT INTO delivery_logs (notification_id, channel, recipient, status, message_id, response)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        id,
        attempt.channel,
        recipient,
        attempt.success ? 'delivered' : 'failed',
        attempt.messageId || null,
        JSON.stringify({ error: attempt.error, aiConfidence: aiResult.confidence }),
      );
    }

    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);

    return {
      notification,
      aiAnalysis: {
        priority,
        suggestedChannels: aiResult.channels,
        usedChannels: channels,
        isDuplicate: aiResult.isDuplicate,
        confidence: aiResult.confidence,
        reasoning: aiResult.reasoning,
      },
      delivery: deliveryAttempts,
    };
  }

  /**
   * Deliver a notification to a specific channel.
   */
  private async deliverToChannel(
    channel: ChannelType,
    notificationId: string,
    input: CreateNotificationInput,
    priority: Priority,
  ): Promise<DeliveryAttempt> {
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${priority === 'critical' ? '#dc2626' : priority === 'urgent' ? '#f59e0b' : '#3b82f6'}; padding: 16px; color: white;">
          <h2 style="margin: 0;">[${priority.toUpperCase()}] ${input.title}</h2>
        </div>
        <div style="padding: 20px; background: #f9fafb; border: 1px solid #e5e7eb;">
          <p>${input.message.replace(/\n/g, '<br>')}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
          <p style="font-size: 12px; color: #6b7280;">
            Notification ID: ${notificationId}<br>
            Source: ${input.source || 'api'}<br>
            Routed by Smart Notification Router AI
          </p>
        </div>
      </div>
    `;

    switch (channel) {
      case 'email': {
        const recipient = input.recipient?.email || 'demo@smartnotif.io';
        const result = await wooxyService.sendEmail(
          { email: recipient, name: recipient.split('@')[0] },
          `[${priority.toUpperCase()}] ${input.title}`,
          emailHtml,
          input.message,
          ['smart-notif-router', priority, input.source || 'api'],
          priority === 'critical' ? 2 : priority === 'urgent' ? 1 : 0,
        );
        return {
          channel: 'email',
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        };
      }

      case 'webhook': {
        const url = input.recipient?.webhook_url || 'http://localhost:4000/webhook';
        const response = await webhookService.sendWebhook(url, {
          notificationId,
          title: input.title,
          message: input.message,
          source: input.source || 'api',
          priority,
          timestamp: new Date().toISOString(),
        });
        return {
          channel: 'webhook',
          success: response.success,
          response: response.body,
          error: response.error,
        };
      }

      case 'sms': {
        const phone = input.recipient?.phone || '+1234567890';
        const smsMessage = `[${priority.toUpperCase()}] ${input.title}: ${input.message.substring(0, 100)}`;
        const result = await smsService.sendSMS(phone, smsMessage);
        return {
          channel: 'sms',
          success: result.success,
          messageId: result.messageId,
          error: result.error,
        };
      }

      default:
        return { channel, success: false, error: `Unknown channel: ${channel}` };
    }
  }

  /**
   * Resolve the recipient address for a given channel.
   */
  private resolveRecipient(channel: ChannelType, recipient?: CreateNotificationInput['recipient']): string {
    if (!recipient) {
      switch (channel) {
        case 'email': return 'demo@smartnotif.io';
        case 'sms': return '+1234567890';
        case 'webhook': return 'http://localhost:4000/webhook';
      }
    }
    switch (channel) {
      case 'email': return recipient?.email || 'demo@smartnotif.io';
      case 'sms': return recipient?.phone || '+1234567890';
      case 'webhook': return recipient?.webhook_url || 'http://localhost:4000/webhook';
      default: return 'unknown';
    }
  }

  /**
   * Get a single notification by ID with delivery logs.
   */
  getNotification(id: string) {
    const db = getDatabase();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    if (!notification) return null;

    const logs = db.prepare('SELECT * FROM delivery_logs WHERE notification_id = ? ORDER BY created_at').all(id);
    return { ...notification as any, delivery_logs: logs };
  }

  /**
   * List notifications with optional filters.
   */
  listNotifications(filters: NotificationFilters = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM notifications WHERE 1=1';
    const params: any[] = [];

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.priority) {
      query += ' AND priority = ?';
      params.push(filters.priority);
    }
    if (filters.channel) {
      query += " AND channels LIKE ?";
      params.push(`%"${filters.channel}"%`);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const notifications = db.prepare(query).all(...params);
    const countResult = db.prepare(
      query.replace('SELECT *', 'SELECT COUNT(*) as total').replace(/ORDER BY.*$/, '').replace(/LIMIT.*$/, '').replace(/OFFSET.*$/, '')
    ).get(...params) as { total: number };

    return { notifications, total: countResult.total };
  }

  /**
   * Retry a failed notification.
   */
  async retryNotification(id: string) {
    const db = getDatabase();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as any;
    if (!notification) throw new Error('Notification not found');
    if (notification.status !== 'failed') throw new Error('Only failed notifications can be retried');

    // Reset status and re-route
    db.prepare(`UPDATE notifications SET status = 'pending', updated_at = datetime('now') WHERE id = ?`).run(id);

    const result = await this.createNotification({
      title: notification.title,
      message: notification.message,
      source: notification.source,
    });

    // Delete the old notification
    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);

    return result;
  }

  /**
   * Delete a notification and its delivery logs.
   */
  deleteNotification(id: string) {
    const db = getDatabase();
    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    if (!notification) throw new Error('Notification not found');

    db.prepare('DELETE FROM delivery_logs WHERE notification_id = ?').run(id);
    db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
    return { deleted: true };
  }

  /**
   * Get analytics summary.
   */
  getAnalytics() {
    const db = getDatabase();

    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM notifications GROUP BY status
    `).all();

    const byPriority = db.prepare(`
      SELECT priority, COUNT(*) as count FROM notifications GROUP BY priority
    `).all();

    const byChannel = db.prepare(`
      SELECT channel, COUNT(*) as count, 
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM delivery_logs GROUP BY channel
    `).all();

    const recent24h = db.prepare(`
      SELECT COUNT(*) as count FROM notifications WHERE created_at > datetime('now', '-24 hours')
    `).get() as { count: number };

    const total = db.prepare('SELECT COUNT(*) as count FROM notifications').get() as { count: number };

    return { byStatus, byPriority, byChannel, total: total.count, recent24h: recent24h.count };
  }
}

export const notificationService = new NotificationService();
