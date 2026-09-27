import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PerformanceAnalytics = ({ data }) => {
  const [period, setPeriod] = useState('all');

  if (!data) return null;

  const stats = data[period] || {};
  const periods = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' },
  ];

  const metrics = [
    { label: 'Leads Sent', value: stats.leadsSent || 0, color: 'from-blue-500 to-blue-600' },
    { label: 'Engaged', value: stats.leadsEngaged || 0, sub: `${stats.engagementRate || 0}%`, color: 'from-yellow-500 to-orange-500' },
    { label: 'Bookings', value: stats.bookingsMade || 0, sub: `${stats.conversionRate || 0}%`, color: 'from-green-500 to-emerald-600' },
    { label: 'Human Required', value: stats.humanRequired || 0, color: 'from-red-500 to-rose-600' },
  ];

  const funnelStages = [
    { label: 'Sent', value: stats.leadsSent || 0, width: 100 },
    { label: 'Engaged', value: stats.leadsEngaged || 0, width: stats.leadsSent > 0 ? Math.round((stats.leadsEngaged / stats.leadsSent) * 100) : 0 },
    { label: 'Booked', value: stats.bookingsMade || 0, width: stats.leadsSent > 0 ? Math.round((stats.bookingsMade / stats.leadsSent) * 100) : 0 },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Performance</h2>
          <div className="flex gap-1">
            {periods.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  period === p.key ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {metrics.map((m, idx) => (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`bg-gradient-to-br ${m.color} rounded-xl p-3 text-white`}
            >
              <div className="text-2xl font-bold">{m.value}</div>
              <div className="text-xs opacity-80">{m.label}</div>
              {m.sub && <div className="text-xs mt-1 opacity-90 font-medium">{m.sub} rate</div>}
            </motion.div>
          ))}
        </div>

        {/* Funnel */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Engagement Funnel</h3>
          <div className="space-y-2">
            {funnelStages.map((stage, idx) => (
              <div key={stage.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-16">{stage.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(stage.width, stage.value > 0 ? 3 : 0)}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full flex items-center justify-end pr-2"
                  >
                    {stage.width > 10 && (
                      <span className="text-xs text-white font-medium">{stage.value}</span>
                    )}
                  </motion.div>
                </div>
                {stage.width <= 10 && <span className="text-xs text-gray-500">{stage.value}</span>}
                <span className="text-xs text-gray-400 w-10 text-right">{stage.width}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceAnalytics;
