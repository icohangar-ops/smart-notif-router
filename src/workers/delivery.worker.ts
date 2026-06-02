import { Worker, Queue, type Job } from 'bullmq';
import { config } from '../config';
import { notificationService } from '../services/notification.service';
import type { CreateNotificationInput } from '../services/notification.service';

export interface DeliveryJobData {
  notificationInput: CreateNotificationInput;
  attempts: number;
}

const QUEUE_NAME = 'notification-delivery';

let worker: Worker | null = null;
let queue: Queue | null = null;

/**
 * Initialize the BullMQ delivery worker and queue.
 */
export function startWorker() {
  const connection = {
    host: config.redis.host,
    port: config.redis.port,
  };

  // Create the queue
  queue = new Queue(QUEUE_NAME, { connection });
  console.log(`[Worker] BullMQ queue "${QUEUE_NAME}" initialized on redis://${connection.host}:${connection.port}`);

  // Create the worker
  worker = new Worker<DeliveryJobData>(
    QUEUE_NAME,
    async (job: Job<DeliveryJobData>) => {
      const { notificationInput, attempts } = job.data;
      console.log(`[Worker] Processing job ${job.id}, attempt ${attempts}`);

      try {
        const result = await notificationService.createNotification(notificationInput);
        console.log(`[Worker] Job ${job.id} completed successfully`);
        return result;
      } catch (error) {
        console.error(`[Worker] Job ${job.id} failed (attempt ${attempts}):`, error);

        if (attempts < 3) {
          // Re-queue with incremented attempt counter
          await queue?.add('retry', {
            notificationInput,
            attempts: attempts + 1,
          }, {
            delay: Math.pow(2, attempts) * 5000, // 5s, 10s, 20s backoff
            attempts: 1,
          });
          console.log(`[Worker] Job ${job.id} re-queued for retry ${attempts + 1}/3`);
        } else {
          console.error(`[Worker] Job ${job.id} exhausted all 3 retries`);
          throw error; // Let BullMQ mark as failed
        }
      }
    },
    {
      connection,
      concurrency: 5,
      limiter: { max: 10, duration: 1000 }, // 10 jobs per second
    },
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} marked as completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} permanently failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Worker error:', err.message);
  });

  console.log('[Worker] Delivery worker started (concurrency: 5, rate limit: 10/sec)');
}

/**
 * Queue a notification for asynchronous delivery.
 */
export async function queueNotification(input: CreateNotificationInput) {
  if (!queue) {
    // Fallback: deliver synchronously if queue not available
    console.warn('[Worker] Queue not available, delivering synchronously');
    return notificationService.createNotification(input);
  }

  const job = await queue.add('deliver', {
    notificationInput: input,
    attempts: 1,
  }, {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  console.log(`[Worker] Notification queued as job ${job.id}`);
  return { queued: true, jobId: job.id };
}

/**
 * Gracefully shut down the worker and queue.
 */
export async function stopWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[Worker] Worker closed');
  }
  if (queue) {
    await queue.close();
    queue = null;
    console.log('[Worker] Queue closed');
  }
}

export { QUEUE_NAME };
