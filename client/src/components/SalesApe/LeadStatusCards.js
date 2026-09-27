import React from 'react';
import { motion } from 'framer-motion';

const LeadStatusCards = ({ leads, onLeadSelect, onRemoveFromQueue, onRemoveAll }) => {
  if (!leads || leads.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-6xl mb-4">📭</p>
        <p className="text-xl text-gray-500">No leads in SalesApe queue</p>
        <p className="text-gray-400 mt-2">Add leads from the Leads page to get started</p>
      </div>
    );
  }

  const getStatusColor = (lead) => {
    if (lead.salesape_goal_hit) return 'from-green-400 to-green-600';
    if (lead.salesape_goal_presented) return 'from-blue-400 to-blue-600';
    if (lead.salesape_user_engaged) return 'from-purple-400 to-purple-600';
    if (lead.salesape_initial_message_sent) return 'from-yellow-400 to-yellow-600';
    return 'from-gray-400 to-gray-600';
  };

  const getStatusIcon = (lead) => {
    if (lead.salesape_goal_hit) return '✅';
    if (lead.salesape_goal_presented) return '🎯';
    if (lead.salesape_user_engaged) return '💬';
    if (lead.salesape_initial_message_sent) return '📤';
    return '⏳';
  };

  const getStatusText = (lead) => {
    if (lead.salesape_goal_hit) return 'Booked';
    if (lead.salesape_goal_presented) return 'Goal Presented';
    if (lead.salesape_user_engaged) return 'Engaged';
    if (lead.salesape_initial_message_sent) return 'Message Sent';
    return 'Queued';
  };

  const getTimeSince = (timestamp) => {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((Date.now() - new Date(timestamp)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div>
      {/* ✅ NEW: Header with Remove All button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            📋 SalesApe Queue
          </h2>
          <p className="text-gray-600 mt-1">
            {leads.length} leads in queue
          </p>
        </div>
        {leads.length > 0 && onRemoveAll && (
          <button
            onClick={onRemoveAll}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            🗑️ Remove All ({leads.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {leads.map((lead, index) => (
        <motion.div
          key={lead.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
          whileHover={{ scale: 1.05, y: -5 }}
          onClick={() => onLeadSelect(lead)}
          className="cursor-pointer"
        >
          <div className={`bg-gradient-to-br ${getStatusColor(lead)} rounded-lg shadow-lg p-6 text-white relative overflow-hidden`}>
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full -mr-16 -mt-16"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full -ml-12 -mb-12"></div>
            </div>

            {/* Content */}
            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <p className="text-3xl mb-2">{getStatusIcon(lead)}</p>
                  <h3 className="font-bold text-lg truncate">{lead.name}</h3>
                  <p className="text-sm opacity-90 truncate">{lead.phone || lead.email}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Remove ${lead.name} from queue?`)) {
                      onRemoveFromQueue(lead.id);
                    }
                  }}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Status */}
              <div className="mb-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2">
                  <p className="text-sm font-semibold">{getStatusText(lead)}</p>
                  <p className="text-xs opacity-90">
                    {getTimeSince(lead.salesape_last_updated || lead.created_at)}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-3">
                <div className="flex gap-1">
                  <div className={`h-1 flex-1 rounded ${lead.salesape_initial_message_sent ? 'bg-white' : 'bg-white/30'}`}></div>
                  <div className={`h-1 flex-1 rounded ${lead.salesape_user_engaged ? 'bg-white' : 'bg-white/30'}`}></div>
                  <div className={`h-1 flex-1 rounded ${lead.salesape_goal_presented ? 'bg-white' : 'bg-white/30'}`}></div>
                  <div className={`h-1 flex-1 rounded ${lead.salesape_goal_hit ? 'bg-white' : 'bg-white/30'}`}></div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onLeadSelect(lead);
                }}
                className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm"
              >
                View Conversation
              </button>
            </div>
          </div>
        </motion.div>
        ))}
      </div>
    </div>
  );
};

export default LeadStatusCards;


