'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/* ── Types ── */
interface Notification {
  id: string;
  title: string;
  message: string;
  source: string;
  priority: 'low' | 'normal' | 'urgent' | 'critical';
  status: 'pending' | 'routed' | 'delivered' | 'failed';
  channels: string;
  created_at: string;
}

interface Analytics {
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  byChannel: { channel: string; count: number; delivered: number; failed: number }[];
  total: number;
  recent24h: number;
}

interface Channel {
  id: number;
  type: string;
  name: string;
  config: string;
  is_active: number;
}

/* ── Priority badge ── */
function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    low: 'bg-slate-700 text-slate-300',
    normal: 'bg-blue-900/60 text-blue-300',
    urgent: 'bg-amber-900/60 text-amber-300',
    critical: 'bg-red-900/60 text-red-300',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[priority] || colors.normal}`}>{priority.toUpperCase()}</span>;
}

/* ── Status badge ── */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-slate-700 text-slate-300',
    routed: 'bg-indigo-900/60 text-indigo-300',
    delivered: 'bg-emerald-900/60 text-emerald-300',
    failed: 'bg-red-900/60 text-red-300',
  };
  const icons: Record<string, string> = { pending: '⏳', routed: '🔄', delivered: '✅', failed: '❌' };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1 ${colors[status] || colors.pending}`}>{icons[status]} {status}</span>;
}

/* ── Main Dashboard ── */
export default function Dashboard() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [tab, setTab] = useState<'feed' | 'send' | 'channels' | 'rules'>('feed');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Send form state
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formSource, setFormSource] = useState('manual');
  const [formEmail, setFormEmail] = useState('demo@smartnotif.io');
  const [formPhone, setFormPhone] = useState('+1234567890');
  const [lastResult, setLastResult] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const [notifRes, analyticsRes, chanRes, healthRes] = await Promise.all([
        fetch(`${API_URL}/api/notifications?limit=50`).catch(() => null),
        fetch(`${API_URL}/api/notifications/analytics/summary`).catch(() => null),
        fetch(`${API_URL}/api/channels`).catch(() => null),
        fetch(`${API_URL}/api/health`).catch(() => null),
      ]);

      if (notifRes?.ok) setNotifications((await notifRes.json()).data?.notifications || []);
      if (analyticsRes?.ok) setAnalytics((await analyticsRes.json()).data);
      if (chanRes?.ok) setChannels((await chanRes.json()).data || []);
      if (healthRes?.ok) setHealth((await healthRes.json()).data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setLastResult(null);
    try {
      const res = await fetch(`${API_URL}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          message: formMessage,
          source: formSource,
          recipient: { email: formEmail, phone: formPhone },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setLastResult(data.data);
        setFormTitle('');
        setFormMessage('');
        fetchData();
      } else {
        setLastResult({ error: data.error?.message || 'Failed to send' });
      }
    } catch (err) {
      setLastResult({ error: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* ── Header ── */}
      <header className="border-b border-slate-800 bg-[#0a0a0f]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold">S</div>
            <div>
              <h1 className="text-lg font-bold text-white">Smart Notification Router</h1>
              <p className="text-xs text-slate-400">AI-Powered Multi-Channel Alert Routing</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {health && (
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${health.status === 'healthy' ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="text-slate-400">API: {health.status}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">AI: {health.ai?.enabled ? '🟢' : '🔴'}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Tab Navigation ── */}
      <div className="max-w-7xl mx-auto px-6 pt-4">
        <div className="flex gap-1 border-b border-slate-800">
          {[
            { key: 'feed' as const, label: '📊 Notification Feed', count: analytics?.total || 0 },
            { key: 'send' as const, label: '📤 Send Notification', count: null },
            { key: 'channels' as const, label: '🔔 Channels', count: channels.length },
            { key: 'rules' as const, label: '📋 Rules', count: null },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label} {t.count !== null && <span className="ml-1 text-xs text-slate-500">({t.count})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Tab: Feed */}
        {tab === 'feed' && (
          <div>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total', value: analytics?.total || 0, color: 'text-white' },
                { label: 'Delivered', value: analytics?.byStatus?.find(s => s.status === 'delivered')?.count || 0, color: 'text-emerald-400' },
                { label: 'Failed', value: analytics?.byStatus?.find(s => s.status === 'failed')?.count || 0, color: 'text-red-400' },
                { label: 'Last 24h', value: analytics?.recent24h || 0, color: 'text-blue-400' },
              ].map(stat => (
                <div key={stat.label} className="bg-[#1a1a2e] rounded-xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400 mb-1">{stat.label}</div>
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Priority breakdown */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {analytics?.byPriority?.map(p => (
                <div key={p.priority} className="bg-[#12121a] rounded-lg p-3 border border-slate-800/50">
                  <div className="flex items-center justify-between">
                    <PriorityBadge priority={p.priority} />
                    <span className="text-lg font-semibold">{p.count}</span>
                  </div>
                </div>
              )) || <div className="text-slate-500 text-sm col-span-4">No priority data yet. Send your first notification!</div>}
            </div>

            {/* Notification List */}
            <div className="bg-[#1a1a2e] rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">Recent Notifications</h2>
                <button onClick={fetchData} className="text-xs text-blue-400 hover:text-blue-300">Refresh</button>
              </div>
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p className="text-3xl mb-2">📭</p>
                  <p>No notifications yet. Go to &quot;Send Notification&quot; tab to create one!</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/50">
                  {notifications.map((n) => (
                    <div key={n.id} className="px-4 py-3 hover:bg-[#12121a] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <PriorityBadge priority={n.priority} />
                            <StatusBadge status={n.status} />
                            <span className="text-xs text-slate-500">{n.source}</span>
                          </div>
                          <h3 className="text-sm font-medium text-white truncate">{n.title}</h3>
                          <p className="text-xs text-slate-400 truncate mt-0.5">{n.message}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-slate-500">{new Date(n.created_at).toLocaleString()}</div>
                          <div className="text-xs text-slate-600 mt-1">{(JSON.parse(n.channels) as string[]).join(', ')}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Send */}
        {tab === 'send' && (
          <div className="max-w-2xl">
            <div className="bg-[#1a1a2e] rounded-xl border border-slate-800 p-6">
              <h2 className="text-lg font-semibold mb-4">Send a Notification</h2>
              <form onSubmit={sendNotification} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    required
                    placeholder="Server CPU Critical"
                    className="w-full bg-[#12121a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Message</label>
                  <textarea
                    value={formMessage}
                    onChange={e => setFormMessage(e.target.value)}
                    required
                    rows={4}
                    placeholder="Describe the alert or notification..."
                    className="w-full bg-[#12121a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Source</label>
                    <input
                      type="text"
                      value={formSource}
                      onChange={e => setFormSource(e.target.value)}
                      placeholder="manual"
                      className="w-full bg-[#12121a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Email Recipient</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      className="w-full bg-[#12121a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Phone (SMS)</label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full bg-[#12121a] border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {sending ? '⏳ Sending & AI Routing...' : '🚀 Send Notification'}
                </button>
              </form>

              {/* Result */}
              {lastResult && (
                <div className={`mt-4 p-4 rounded-lg border ${
                  lastResult.error ? 'bg-red-900/20 border-red-800/50' : 'bg-emerald-900/20 border-emerald-800/50'
                }`}>
                  {lastResult.error ? (
                    <p className="text-sm text-red-400">Error: {lastResult.error}</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-emerald-400">Notification sent!</p>
                      {lastResult.aiAnalysis && (
                        <div className="text-xs text-slate-400 space-y-1">
                          <p>Priority: <PriorityBadge priority={lastResult.aiAnalysis.priority} /></p>
                          <p>Channels: {lastResult.aiAnalysis.usedChannels?.join(', ')}</p>
                          <p>Confidence: {(lastResult.aiAnalysis.confidence * 100).toFixed(0)}%</p>
                          <p>Duplicate: {lastResult.aiAnalysis.isDuplicate ? 'Yes' : 'No'}</p>
                          <p className="text-slate-500 italic">{lastResult.aiAnalysis.reasoning}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Channels */}
        {tab === 'channels' && (
          <div className="bg-[#1a1a2e] rounded-xl border border-slate-800">
            <div className="px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold text-slate-300">Delivery Channels</h2>
            </div>
            <div className="divide-y divide-slate-800/50">
              {channels.map(ch => (
                <div key={ch.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{ch.type === 'email' ? '📧' : ch.type === 'webhook' ? '🔗' : '📱'}</span>
                      <span className="text-sm font-medium text-white">{ch.name}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{ch.type} {ch.is_active ? '' : '(disabled)'}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${ch.is_active ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                    {ch.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
              {channels.length === 0 && (
                <div className="p-8 text-center text-slate-500">No channels configured</div>
              )}
            </div>

            {/* Channel Performance */}
            {analytics?.byChannel && analytics.byChannel.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-800">
                <h3 className="text-xs font-semibold text-slate-400 mb-2">Channel Performance</h3>
                <div className="grid grid-cols-3 gap-3">
                  {analytics.byChannel.map(ch => (
                    <div key={ch.channel} className="bg-[#12121a] rounded-lg p-3">
                      <div className="text-xs text-slate-400 mb-1">{ch.channel}</div>
                      <div className="text-lg font-bold text-white">{ch.count}</div>
                      <div className="flex gap-2 text-xs mt-1">
                        <span className="text-emerald-400">✓{ch.delivered}</span>
                        <span className="text-red-400">✗{ch.failed}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Rules */}
        {tab === 'rules' && (
          <div className="bg-[#1a1a2e] rounded-xl border border-slate-800 p-6">
            <h2 className="text-lg font-semibold mb-2">AI Routing Rules</h2>
            <p className="text-sm text-slate-400 mb-4">Rules supplement AI decisions. Configure them via the <code className="bg-slate-800 px-1 rounded text-xs">/api/rules</code> endpoint or import the Postman collection.</p>
            <div className="space-y-3">
              {[
                { name: 'Critical → SMS', desc: 'All critical alerts go to SMS', icon: '📱' },
                { name: 'CI/CD → Webhook', desc: 'GitHub Actions events routed to webhook', icon: '🔗' },
              ].map(rule => (
                <div key={rule.name} className="bg-[#12121a] rounded-lg p-4 border border-slate-800/50 flex items-center gap-3">
                  <span className="text-2xl">{rule.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-white">{rule.name}</div>
                    <div className="text-xs text-slate-400">{rule.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
