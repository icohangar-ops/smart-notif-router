import { config } from '../config';

export interface WooxyRecipient {
  email: string;
  name?: string;
}

export interface WooxyEmailPayload {
  to: WooxyRecipient;
  subject: string;
  html: string;
  text?: string;
  tags?: string[];
  priority?: number;
}

interface WooxySendResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class WooxyService {
  private baseUrl: string;
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.baseUrl = config.wooxy.baseUrl;
    this.apiKey = config.wooxy.apiKey;
    this.fromEmail = config.wooxy.fromEmail;
    this.fromName = config.wooxy.fromName;
  }

  /**
   * Send an email via the Wooxy API v3.0.
   * @param to - Recipient object with email and optional name
   * @param subject - Email subject line
   * @param html - HTML body of the email
   * @param text - Optional plain text fallback body
   * @param tags - Optional array of tags for categorization
   * @param priority - Optional priority (0-2: 2 = highest)
   * @returns messageId on success
   */
  async sendEmail(
    to: WooxyRecipient,
    subject: string,
    html: string,
    text?: string,
    tags?: string[],
    priority?: number,
  ): Promise<WooxySendResponse> {
    if (!this.apiKey) {
      console.warn('[Wooxy] API key not configured. Simulating email send.');
      const mockId = `mock-email-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      return { success: true, messageId: mockId };
    }

    const payload = {
      from: {
        email: this.fromEmail,
        name: this.fromName,
      },
      to: [
        {
          email: to.email,
          name: to.name || to.email.split('@')[0],
        },
      ],
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
      tags: tags || ['smart-notif-router'],
      priority: priority ?? 0,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v3/mailer/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': this.apiKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`[Wooxy] API error ${response.status}:`, data);
        return {
          success: false,
          error: `Wooxy API error: ${response.status} - ${JSON.stringify(data)}`,
        };
      }

      const messageId = data.result?.id || data.messageId || `wooxy-${Date.now()}`;
      console.log(`[Wooxy] Email sent successfully. Message ID: ${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      console.error('[Wooxy] Failed to send email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email',
      };
    }
  }
}

export const wooxyService = new WooxyService();
