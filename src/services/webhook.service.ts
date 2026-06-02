export interface WebhookPayload {
  url: string;
  data: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface WebhookResponse {
  success: boolean;
  status: number;
  body: string;
  error?: string;
}

export class WebhookService {
  /**
   * Send a payload to a webhook URL via HTTP POST.
   * @param url - The webhook URL to send to
   * @param payload - The JSON payload to send
   * @param headers - Optional additional HTTP headers
   * @returns response status and body
   */
  async sendWebhook(
    url: string,
    payload: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<WebhookResponse> {
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'SmartNotifRouter/1.0',
    };

    const mergedHeaders = { ...defaultHeaders, ...headers };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: mergedHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      const body = await response.text();

      if (!response.ok) {
        console.warn(`[Webhook] Received status ${response.status} from ${url}`);
        return {
          success: false,
          status: response.status,
          body,
          error: `HTTP ${response.status}: ${body.substring(0, 200)}`,
        };
      }

      console.log(`[Webhook] Delivered successfully to ${url} (status: ${response.status})`);
      return {
        success: true,
        status: response.status,
        body,
      };
    } catch (error) {
      console.error(`[Webhook] Failed to deliver to ${url}:`, error);
      return {
        success: false,
        status: 0,
        body: '',
        error: error instanceof Error ? error.message : 'Unknown error sending webhook',
      };
    }
  }
}

export const webhookService = new WebhookService();
