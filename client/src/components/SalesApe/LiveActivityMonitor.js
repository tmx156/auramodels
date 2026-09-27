import React from 'react';
import { motion } from 'framer-motion';

const LiveActivityMonitor = ({ data, onPause, onResume }) => {
  if (!data) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  const {
    isActive,
    isPaused,
    currentLead,
    lastActivity,
    todayStats
  } = data;

  const getStatusColor = () => {
    if (isPaused) return 'bg-yellow-500';
    if (isActive) return 'bg-green-500';
    return 'bg-gray-400';
  };

  const getStatusText = () => {
    if (isPaused) return 'Paused';
    if (isActive) return 'Active';
    return 'Idle';
  };

  const getTimeSince = (timestamp) => {
    if (!timestamp) return 'N/A';
    const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <motion.div
      className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-6 text-white"
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-4 h-4 rounded-full ${getStatusColor()} animate-pulse`}></div>
          <h2 className="text-2xl font-bold">🤖 SalesApe Live Activity</h2>
        </div>
        
        {/* Control Buttons */}
        <div className="flex gap-2">
          {isPaused ? (
            <button
              onClick={onResume}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <span>▶️</span> Resume
            </button>
          ) : (
            <button
              onClick={onPause}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <span>⏸️</span> Pause
            </button>
          )}
        </div>
      </div>

      {/* Current Activity */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm opacity-90 mb-1">Status: {getStatusText()}</p>
            {currentLead ? (
              <>
                <p className="text-xl font-semibold mb-1">
                  Currently engaging with: {currentLead.name}
                </p>
                <p className="text-sm opacity-90">
                  {currentLead.status} • Last activity: {getTimeSince(lastActivity)}
                </p>
                {currentLead.lastMessage && (
                  <p className="text-sm mt-2 italic opacity-80">
                    "{currentLead.lastMessage}"
                  </p>
                )}
              </>
            ) : (
              <p className="text-xl font-semibold">
                {isPaused ? 'Queue is paused' : 'No active engagement'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
          <p className="text-sm opacity-90 mb-1">Messages Sent</p>
          <p className="text-3xl font-bold">{todayStats?.messagesSent || 0}</p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
          <p className="text-sm opacity-90 mb-1">Leads Engaged</p>
          <p className="text-3xl font-bold">{todayStats?.leadsEngaged || 0}</p>
          <p className="text-xs opacity-75">
            {todayStats?.engagementRate || 0}% rate
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
          <p className="text-sm opacity-90 mb-1">Bookings Made</p>
          <p className="text-3xl font-bold">{todayStats?.bookingsMade || 0}</p>
          <p className="text-xs opacity-75">
            {todayStats?.conversionRate || 0}% conversion
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
          <p className="text-sm opacity-90 mb-1">Response Rate</p>
          <p className="text-3xl font-bold">{todayStats?.responseRate || 0}%</p>
          <p className="text-xs opacity-75">
            Avg: {todayStats?.avgResponseTime || 'N/A'}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default LiveActivityMonitor;


