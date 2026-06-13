import { config } from '../config';
import type { Priority, ChannelType } from '../models/database';
import { withTimeout } from '../lib/resilience';

// Upper bound for a single AI completion call. On timeout the request rejects
// and analyzeNotification falls back to heuristic routing (see catch below).
const AI_TIMEOUT_MS = 15_000;

export interface AIRouterInput {
  title: string;
  message: string;
  source: string;
}

export interface AIRouterOutput {
  priority: Priority;
  channels: ChannelType[];
  isDuplicate: boolean;
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an AI-powered notification routing engine. Analyze incoming notifications and determine optimal routing.

SCORING GUIDELINES:
- Priority 1-3 → "low"    : Informational, FYIs, routine updates, newsletters
- Priority 4-6 → "normal" : Standard alerts, scheduled reports, non-critical reminders
- Priority 7-8 → "urgent"  : Action required soon, system warnings, approaching deadlines
- Priority 9-10 → "critical": Immediate action needed, outages, security breaches, data loss

CHANNEL SELECTION:
- "email"   → Detailed information, reports, summaries, non-time-sensitive content
- "webhook" → System alerts, machine-to-machine, integration triggers, CI/CD events
- "sms"     → Urgent/critical alerts requiring immediate human attention

DUPLICATE DETECTION:
- Consider semantic similarity (not exact match). If the notification conveys essentially the same information as what would have been seen recently, mark as duplicate.

You MUST respond with ONLY a valid JSON object — no extra text, no markdown fences.

Response schema:
{
  "priorityScore": <1-10 integer>,
  "priority": "<low|normal|urgent|critical>",
  "channels": ["<email|webhook|sms>", ...],
  "isDuplicate": <boolean>,
  "confidence": <0.0-1.0 float>,
  "reasoning": "<brief explanation>"
}`;

function parseAIResponse(raw: string): AIRouterOutput | null {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  try {
    const parsed = JSON.parse(cleaned);
    const priorityMap: Record<string, Priority> = {
      low: 'low',
      normal: 'normal',
      urgent: 'urgent',
      critical: 'critical',
    };
    const validChannels: ChannelType[] = ['email', 'webhook', 'sms'];

    const priority = priorityMap[parsed.priority] || 'normal';
    const channels = (Array.isArray(parsed.channels) ? parsed.channels : [])
      .filter((c: string) => validChannels.includes(c as ChannelType)) as ChannelType[];

    return {
      priority,
      channels: channels.length > 0 ? channels : ['email'],
      isDuplicate: typeof parsed.isDuplicate === 'boolean' ? parsed.isDuplicate : false,
      confidence: typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch {
    console.error('[AI Router] Failed to parse AI response:', raw.substring(0, 200));
    return null;
  }
}

function getDefaultRouting(input: AIRouterInput): AIRouterOutput {
  // Heuristic fallback when AI is disabled or fails
  const msgLower = `${input.title} ${input.message}`.toLowerCase();
  const urgentKeywords = ['urgent', 'critical', 'outage', 'down', 'error', 'fail', 'security', 'breach', 'alert'];
  const isUrgent = urgentKeywords.some(kw => msgLower.includes(kw));

  return {
    priority: isUrgent ? 'urgent' : 'normal',
    channels: isUrgent ? ['email', 'sms'] : ['email'],
    isDuplicate: false,
    confidence: 0.3,
    reasoning: 'Fallback heuristic routing (AI unavailable)',
  };
}

export class AIRouterService {
  private enabled: boolean;
  private zai: any = null;

  constructor() {
    this.enabled = config.ai.enabled;
  }

  private async ensureClient(): Promise<void> {
    if (this.zai) return;
    try {
      const ZAI = await import('z-ai-web-dev-sdk');
      this.zai = await ZAI.default.create();
      console.log('[AI Router] z-ai-web-dev-sdk client initialized');
    } catch (error) {
      console.error('[AI Router] Failed to initialize z-ai-web-dev-sdk:', error);
      this.enabled = false;
    }
  }

  /**
   * Analyze a notification and determine optimal routing.
   * Uses GLM-4-Plus via z-ai-web-dev-sdk to score priority,
   * suggest channels, and detect duplicates.
   */
  async analyzeNotification(input: AIRouterInput): Promise<AIRouterOutput> {
    if (!this.enabled) {
      console.log('[AI Router] AI disabled, using default routing');
      return getDefaultRouting(input);
    }

    try {
      await this.ensureClient();

      const userMessage = `Analyze this notification and route it:

Title: "${input.title}"
Message: "${input.message}"
Source: "${input.source}"

Return a JSON object with priority (1-10), suggested channels, duplicate detection, and confidence.`;

      // Bound the completion call with a Node AbortController + a hard
      // withTimeout race. The AbortSignal asks the SDK to cancel in-flight
      // work; withTimeout guarantees we are released even if the SDK ignores
      // the signal. On timeout we reject and fall back to heuristic routing.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      let completion: any;
      try {
        completion = await withTimeout(
          this.zai.chat.completions.create({
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMessage },
            ],
            max_tokens: 500,
            temperature: 0.3,
            signal: controller.signal,
          }),
          AI_TIMEOUT_MS,
          'AI completion',
        );
      } finally {
        clearTimeout(timer);
      }

      const content = completion.choices?.[0]?.message?.content || '';
      console.log('[AI Router] Raw AI response:', content.substring(0, 300));

      const parsed = parseAIResponse(content);
      if (parsed) {
        console.log(
          `[AI Router] Routed: priority=${parsed.priority}, channels=${parsed.channels.join(',')}, confidence=${parsed.confidence}, duplicate=${parsed.isDuplicate}`,
        );
        return parsed;
      }

      console.warn('[AI Router] AI returned invalid JSON, falling back to heuristic');
      return getDefaultRouting(input);
    } catch (error) {
      console.error('[AI Router] AI analysis failed, using default routing:', error);
      return getDefaultRouting(input);
    }
  }
}

export const aiRouterService = new AIRouterService();
