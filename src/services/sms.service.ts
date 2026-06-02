/**
 * SMS Service — Mock implementation for hackathon demo.
 *
 * In production, replace the body of sendSMS() with calls to:
 *   - Twilio (twilio SDK)
 *   - AWS SNS (aws-sdk v3)
 *   - Vonage / Nexmo
 *   - Any other SMS provider
 */

export interface SMSResult {
  success: boolean;
  messageId: string;
  error?: string;
}

export class SMSService {
  /**
   * Send an SMS message (mock for demo purposes).
   * @param phone - Recipient phone number in E.164 format
   * @param message - SMS body text (max 160 chars recommended)
   * @returns messageId
   */
  async sendSMS(phone: string, message: string): Promise<SMSResult> {
    const truncated = message.length > 160 ? message.substring(0, 157) + '...' : message;
    const messageId = `mock-sms-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // TODO: Replace with real SMS provider integration
    // Example with Twilio:
    //   const client = new Twilio(accountSid, authToken);
    //   const result = await client.messages.create({
    //     body: truncated,
    //     from: '+1234567890',
    //     to: phone,
    //   });
    //   return { success: true, messageId: result.sid };

    console.log(`[SMS Mock] To: ${phone} | Body: "${truncated}" | ID: ${messageId}`);
    return { success: true, messageId };
  }
}

export const smsService = new SMSService();
