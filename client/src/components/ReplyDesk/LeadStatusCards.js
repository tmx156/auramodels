import React from 'react';
import { motion } from 'framer-motion';
import { FiPhone, FiMail, FiX, FiEye, FiAlertTriangle } from 'react-icons/fi';

const STATUS_COLORS = {
  needs_attention: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  in_progress: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700' },
  queued: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
  completed: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700' },
  failed: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
  cancelled: { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-500' },
};

const REPLYDESK_LABELS = {
  'New': 'Queued',
  'Qualifying': 'Qualifying',
  'Objection_Distance': 'Objection',
  'Booking_Offered': 'Booking Offered',
  'Booked': 'Booked',
  'Human_Required': 'Human Required',
  'failed': 'Failed',
  'cancelled': 'Cancelled'
};

const LeadStatusCards = ({ leads, onLeadSelect, onRemoveFromQueue, onRemoveAll }) => {
  if (!leads || leads.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <p className="text-gray-400 text-lg">No leads in Alex A.I queue</p>
        <p className="text-gray-400 text-sm mt-1">Send leads from the Lead Details page or use the Dashboard view to add</p>
      </div>
    );
  }

  const timeSince = (dateStr) => {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{leads.length} Leads in Queue</h2>
        {leads.length > 0 && (
          <button
            onClick={onRemoveAll}
            className="px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            Remove All
          </button>
        )}
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {leads.map((lead, idx) => {
          const colors = STATUS_COLORS[lead.queue_status] || STATUS_COLORS.queued;
          return (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className={`${colors.bg} border ${colors.border} rounded-xl p-4 hover:shadow-md transition-shadow`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800 text-sm truncate max-w-[150px]">{lead.name || 'Unknown'}</h3>
                  {lead.queue_status === 'needs_attention' && <FiAlertTriangle className="w-4 h-4 text-red-500" />}
                </div>
                <button
                  onClick={() => onRemoveFromQueue(lead.id)}
                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                >
                  <FiX className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1 mb-3 text-xs text-gray-500">
                {lead.phone && <div className="flex items-center gap-1"><FiPhone className="w-3 h-3" />{lead.phone}</div>}
                {lead.email && <div className="flex items-center gap-1 truncate"><FiMail className="w-3 h-3" />{lead.email}</div>}
              </div>

              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                  {REPLYDESK_LABELS[lead.replydesk_status] || lead.replydesk_status || 'Queued'}
                </span>
                <span className="text-xs text-gray-400">{timeSince(lead.replydesk_last_updated || lead.replydesk_sent_at)}</span>
              </div>

              <button
                onClick={() => onLeadSelect(lead)}
                className="mt-3 w-full text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50 py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <FiEye className="w-3 h-3" /> View Details
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default LeadStatusCards;
