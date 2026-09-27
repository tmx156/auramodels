import React, { useState } from 'react';
import { motion } from 'framer-motion';

const PerformanceAnalytics = ({ data }) => {
  const [timePeriod, setTimePeriod] = useState('today'); // 'today', 'week', 'month', 'all'

  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-4 gap-4">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const stats = data[timePeriod] || {};
  const {
    leadsSent = 0,
    leadsEngaged = 0,
    bookingsMade = 0,
    engagementRate = 0,
    conversionRate = 0,
    avgResponseTime = 'N/A',
    avgMessagesPerLead = 0,
    goalHitRate = 0
  } = stats;

  const periods = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' }
  ];

  const getFunnelWidth = (value, total) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          📊 Performance Analytics
        </h2>
        
        {/* Time Period Selector */}
        <div className="flex gap-2">
          {periods.map(period => (
            <button
              key={period.key}
              onClick={() => setTimePeriod(period.key)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                timePeriod === period.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200"
        >
          <p className="text-sm text-blue-700 mb-1">Leads Sent</p>
          <p className="text-3xl font-bold text-blue-900">{leadsSent}</p>
          <p className="text-xs text-blue-600 mt-1">Total initiated</p>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200"
        >
          <p className="text-sm text-purple-700 mb-1">Engaged</p>
          <p className="text-3xl font-bold text-purple-900">{leadsEngaged}</p>
          <p className="text-xs text-purple-600 mt-1">
            {engagementRate}% of sent
          </p>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200"
        >
          <p className="text-sm text-green-700 mb-1">Bookings</p>
          <p className="text-3xl font-bold text-green-900">{bookingsMade}</p>
          <p className="text-xs text-green-600 mt-1">
            {conversionRate}% of sent
          </p>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.05 }}
          className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200"
        >
          <p className="text-sm text-yellow-700 mb-1">Conversion</p>
          <p className="text-3xl font-bold text-yellow-900">{goalHitRate}%</p>
          <p className="text-xs text-yellow-600 mt-1">
            {leadsEngaged > 0 ? Math.round((bookingsMade / leadsEngaged) * 100) : 0}% of engaged
          </p>
        </motion.div>
      </div>

      {/* Engagement Funnel */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📈 Engagement Funnel</h3>
        <div className="space-y-3">
          {/* Initial Messages */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700">Initial Messages Sent</span>
              <span className="text-sm font-semibold text-gray-900">{leadsSent}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.5 }}
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full flex items-center justify-center text-white text-sm font-medium"
              >
                100%
              </motion.div>
            </div>
          </div>

          {/* Users Engaged */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700">Users Engaged</span>
              <span className="text-sm font-semibold text-gray-900">
                {leadsEngaged} ({engagementRate}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${engagementRate}%` }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-gradient-to-r from-purple-500 to-purple-600 h-full flex items-center justify-center text-white text-sm font-medium"
              >
                {engagementRate}%
              </motion.div>
            </div>
          </div>

          {/* Bookings Made */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700">Bookings Made</span>
              <span className="text-sm font-semibold text-gray-900">
                {bookingsMade} ({conversionRate}% of total, {leadsEngaged > 0 ? Math.round((bookingsMade / leadsEngaged) * 100) : 0}% of engaged)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${conversionRate}%` }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="bg-gradient-to-r from-green-500 to-green-600 h-full flex items-center justify-center text-white text-sm font-medium"
              >
                {conversionRate}%
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">⏱️ Avg Response Time</p>
          <p className="text-2xl font-bold text-gray-900">{avgResponseTime}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">💬 Avg Messages per Lead</p>
          <p className="text-2xl font-bold text-gray-900">{avgMessagesPerLead.toFixed(1)}</p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-1">⭐ Goal Hit Rate</p>
          <p className="text-2xl font-bold text-gray-900">{goalHitRate}%</p>
        </div>
      </div>

      {/* Export Button */}
      <div className="mt-4 pt-4 border-t">
        <button
          onClick={() => {
            const csvData = `Period,Leads Sent,Leads Engaged,Bookings Made,Engagement Rate,Conversion Rate\n${timePeriod},${leadsSent},${leadsEngaged},${bookingsMade},${engagementRate}%,${conversionRate}%`;
            const blob = new Blob([csvData], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `salesape-analytics-${timePeriod}-${Date.now()}.csv`;
            a.click();
          }}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <span>📥</span> Export Report as CSV
        </button>
      </div>
    </div>
  );
};

export default PerformanceAnalytics;


