export const config = {
  port: process.env.PORT || 3001,
  wooxy: {
    baseUrl: 'https://api.wooxy.com',
    apiKey: process.env.WOOXY_API_KEY || '',
    fromEmail: process.env.WOOXY_FROM_EMAIL || 'noreply@smartnotif.io',
    fromName: process.env.WOOXY_FROM_NAME || 'Smart Notif Router',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
  },
  db: {
    path: process.env.DB_PATH || './data/notifications.db',
  },
  ai: {
    enabled: process.env.AI_ENABLED !== 'false',
  },
};
