import React from 'react';
import { FiMessageCircle, FiExternalLink, FiClock, FiAlertTriangle } from 'react-icons/fi';

const STATUS_STAGES = [
  { key: 'New', label: 'Queued', color: 'bg-blue-500' },
  { key: 'Qualifying', label: 'Qualifying', color: 'bg-yellow-500' },
  { key: 'Objection_Distance', label: 'Objection', color: 'bg-orange-500' },
  { key: 'Booking_Offered', label: 'Booking Offered', color: 'bg-purple-500' },
  { key: 'Booked', label: 'Booked', color: 'bg-green-500' },
];

const ConversationViewer = ({ lead, conversation, onRefresh }) => {
  if (!lead) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <FiMessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-gray-500 font-medium">Select a lead from the queue</h3>
        <p className="text-gray-400 text-sm mt-1">View conversation details and status updates</p>
      </div>
    );
  }

  const currentStatus = lead.replydesk_status || 'New';
  const stageIndex = STATUS_STAGES.findIndex(s => s.key === currentStatus);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-teal-50 to-emerald-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 text-lg">{lead.name || 'Unknown Lead'}</h3>
            <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
              {lead.phone && <span>{lead.phone}</span>}
              {lead.email && <span>{lead.email}</span>}
            </div>
          </div>
          <button onClick={onRefresh} className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* Status Pipeline */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          {STATUS_STAGES.map((stage, idx) => (
            <div key={stage.key} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                idx <= stageIndex ? `${stage.color} text-white` : 'bg-gray-200 text-gray-400'
              }`}>
                {idx < stageIndex ? '✓' : idx + 1}
              </div>
              {idx < STATUS_STAGES.length - 1 && (
                <div className={`w-12 sm:w-16 h-1 mx-1 rounded-full ${idx < stageIndex ? stage.color : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          {STATUS_STAGES.map(stage => (
            <span key={stage.key} className="text-center" style={{ width: '60px' }}>{stage.label}</span>
          ))}
        </div>
      </div>

      {/* Human Required Alert */}
      {currentStatus === 'Human_Required' && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <FiAlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Human Intervention Required</p>
            <p className="text-xs text-red-600 mt-1">Alex has escalated this lead. Please review and take over manually.</p>
          </div>
        </div>
      )}

      {/* Conversation Summary */}
      <div className="p-4">
        {conversation?.summary ? (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Conversation Summary</h4>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 leading-relaxed">
              {conversation.summary}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <FiMessageCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No conversation data yet</p>
            <p className="text-xs text-gray-400 mt-1">Updates will appear here as Alex qualifies this lead</p>
          </div>
        )}

        {/* Details */}
        <div className="space-y-2 text-sm">
          {conversation?.sentAt && (
            <div className="flex items-center gap-2 text-gray-500">
              <FiClock className="w-4 h-4" />
              <span>Sent to Alex: {new Date(conversation.sentAt).toLocaleString()}</span>
            </div>
          )}
          {conversation?.lastUpdated && (
            <div className="flex items-center gap-2 text-gray-500">
              <FiClock className="w-4 h-4" />
              <span>Last update: {new Date(conversation.lastUpdated).toLocaleString()}</span>
            </div>
          )}
          {conversation?.leadCode && (
            <div className="flex items-center gap-2 text-gray-500">
              <FiExternalLink className="w-4 h-4" />
              <span>ReplyDesk Code: {conversation.leadCode}</span>
            </div>
          )}
          {conversation?.error && (
            <div className="mt-2 p-2 bg-red-50 rounded-lg text-xs text-red-600">
              Error: {conversation.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConversationViewer;
