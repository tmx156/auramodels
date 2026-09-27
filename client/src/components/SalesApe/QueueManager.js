import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { FiSearch, FiX, FiUser, FiPhone, FiMail } from 'react-icons/fi';

const QueueManager = ({
  queue,
  onLeadSelect,
  selectedLead,
  onAddToQueue,
  onRemoveFromQueue,
  onRemoveAll,
  onRefresh
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingLead, setAddingLead] = useState(null);

  // Search leads function - defined before use
  const searchLeads = async (term) => {
    setSearchLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/leads', {
        params: {
          search: term,
          limit: 20,
          page: 1
        },
        headers: { 'x-auth-token': token }
      });
      
      const leads = response.data.leads || response.data || [];
      // Filter out leads that are already in queue (optional - you might want to show them)
      setSearchResults(leads);
    } catch (error) {
      console.error('Error searching leads:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  if (!queue) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-3">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // Sort queue by most recent first (by salesape_sent_at or created_at)
  const sortedQueue = [...queue].sort((a, b) => {
    const aTime = new Date(a.salesape_sent_at || a.created_at || 0).getTime();
    const bTime = new Date(b.salesape_sent_at || b.created_at || 0).getTime();
    return bTime - aTime; // Most recent first
  });

  const inProgress = sortedQueue.filter(lead => lead.queue_status === 'in_progress');
  const queued = sortedQueue.filter(lead => lead.queue_status === 'queued');
  const failed = sortedQueue.filter(lead => lead.queue_status === 'failed');
  const completed = sortedQueue.filter(lead => lead.queue_status === 'completed');

  const getStatusIcon = (status) => {
    switch (status) {
      case 'in_progress': return '🔵';
      case 'queued': return '⏳';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '⚪';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-100 border-blue-300';
      case 'queued': return 'bg-gray-100 border-gray-300';
      case 'completed': return 'bg-green-100 border-green-300';
      case 'failed': return 'bg-red-100 border-red-300';
      default: return 'bg-gray-100 border-gray-300';
    }
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

  const LeadCard = ({ lead }) => (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => onLeadSelect(lead)}
      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
        getStatusColor(lead.queue_status)
      } ${selectedLead?.id === lead.id ? 'ring-2 ring-blue-500' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{getStatusIcon(lead.queue_status)}</span>
            <p className="font-semibold text-gray-900 truncate">{lead.name}</p>
          </div>
          <p className="text-sm text-gray-600">
            {lead.salesape_status || 'Queued'}
          </p>
          {lead.queue_status === 'failed' && lead.salesape_error && (
            <p className="text-xs text-red-600 mt-1 font-medium">
              ⚠️ {lead.salesape_error}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {getTimeSince(lead.salesape_last_updated || lead.created_at)}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Remove ${lead.name} from queue?`)) {
              onRemoveFromQueue(lead.id);
            }
          }}
          className="text-gray-400 hover:text-red-500 transition-colors"
        >
          ✕
        </button>
      </div>
      
      {/* Progress indicator for in-progress and queued leads */}
      {(lead.queue_status === 'in_progress' || lead.queue_status === 'queued') && (
        <div className="mt-2">
          <div className="flex gap-1">
            <div className={`h-1.5 flex-1 rounded transition-all ${lead.salesape_initial_message_sent ? 'bg-blue-500' : 'bg-gray-300'}`} title="Initial message sent"></div>
            <div className={`h-1.5 flex-1 rounded transition-all ${lead.salesape_user_engaged ? 'bg-blue-500' : 'bg-gray-300'}`} title="User engaged"></div>
            <div className={`h-1.5 flex-1 rounded transition-all ${lead.salesape_goal_presented ? 'bg-blue-500' : 'bg-gray-300'}`} title="Goal presented"></div>
            <div className={`h-1.5 flex-1 rounded transition-all ${lead.salesape_goal_hit ? 'bg-green-500' : 'bg-gray-300'}`} title="Goal achieved"></div>
          </div>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-600 font-medium">
              {lead.salesape_goal_hit ? '✅ Booked!' : 
               lead.salesape_goal_presented ? '🎯 Goal presented' :
               lead.salesape_user_engaged ? '💬 User engaged' :
               lead.salesape_initial_message_sent ? '📤 Message sent' : 
               lead.queue_status === 'queued' ? '⏳ Waiting to start...' : '🔄 Starting...'}
            </p>
            {lead.salesape_status && (
              <span className="text-xs text-gray-500">
                {lead.salesape_status}
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          📋 Queue
          <span className="text-sm font-normal text-gray-500">
            ({queue.length} leads)
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {/* ✅ NEW: Remove All Button */}
          {queue.length > 0 && (
            <button
              onClick={onRemoveAll}
              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors font-medium"
              title="Remove all leads from queue"
            >
              🗑️ Remove All
            </button>
          )}
          <button
            onClick={onRefresh}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Queue Sections */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {/* In Progress */}
        {inProgress.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-blue-500">●</span>
              IN PROGRESS ({inProgress.length})
            </h3>
            <AnimatePresence>
              <div className="space-y-2">
                {inProgress.map(lead => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            </AnimatePresence>
          </div>
        )}

        {/* Queued */}
        {queued.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-gray-500">●</span>
              QUEUED ({queued.length})
            </h3>
            <AnimatePresence>
              <div className="space-y-2">
                {queued.map(lead => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            </AnimatePresence>
          </div>
        )}

        {/* Failed */}
        {failed.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-red-500">●</span>
              FAILED ({failed.length})
            </h3>
            <AnimatePresence>
              <div className="space-y-2">
                {failed.map(lead => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            </AnimatePresence>
          </div>
        )}

        {/* Completed (show last 5) */}
        {completed.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <span className="text-green-500">●</span>
              COMPLETED ({completed.length})
            </h3>
            <AnimatePresence>
              <div className="space-y-2">
                {completed.slice(0, 5).map(lead => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            </AnimatePresence>
            {completed.length > 5 && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                ... and {completed.length - 5} more
              </p>
            )}
          </div>
        )}

        {/* Empty State */}
        {queue.length === 0 && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-gray-500">No leads in queue</p>
            <p className="text-sm text-gray-400 mt-2">
              Add leads from the Leads page
            </p>
          </div>
        )}
      </div>

      {/* Add to Queue Button */}
      <div className="mt-4 pt-4 border-t">
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <span>+</span> Add Lead to Queue
        </button>
      </div>

      {/* Add Lead Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-xl font-bold text-gray-900">Add Lead to SalesApe Queue</h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSearchTerm('');
                    setSearchResults([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <FiX className="h-6 w-6" />
                </button>
              </div>

              {/* Search Input */}
              <div className="p-6 border-b">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="text"
                    placeholder="Search by name, phone, email, or postcode..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      if (e.target.value.length >= 2) {
                        searchLeads(e.target.value);
                      } else {
                        setSearchResults([]);
                      }
                    }}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
              </div>

              {/* Search Results */}
              <div className="flex-1 overflow-y-auto p-6">
                {searchLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : searchResults.length === 0 && searchTerm.length >= 2 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">No leads found</p>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">Start typing to search for leads...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {searchResults.map((lead) => {
                      const isInQueue = queue.some(q => q.id === lead.id);
                      const hasPhone = lead.phone && lead.phone.trim() !== '';
                      
                      return (
                        <motion.div
                          key={lead.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`p-4 border rounded-lg ${
                            isInQueue ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <FiUser className="text-gray-400" />
                                <h4 className="font-semibold text-gray-900">{lead.name || 'Unnamed Lead'}</h4>
                                {isInQueue && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                    In Queue
                                  </span>
                                )}
                                {!hasPhone && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                                    No Phone
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1 text-sm text-gray-600">
                                {lead.phone && (
                                  <div className="flex items-center gap-2">
                                    <FiPhone className="h-4 w-4" />
                                    <span>{lead.phone}</span>
                                  </div>
                                )}
                                {lead.email && (
                                  <div className="flex items-center gap-2">
                                    <FiMail className="h-4 w-4" />
                                    <span>{lead.email}</span>
                                  </div>
                                )}
                                {lead.postcode && (
                                  <div className="text-gray-500">
                                    📍 {lead.postcode}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                if (isInQueue) {
                                  alert('This lead is already in the queue');
                                  return;
                                }
                                if (!hasPhone) {
                                  alert('This lead has no phone number. Please add a phone number first.');
                                  return;
                                }
                                setAddingLead(lead.id);
                                try {
                                  await onAddToQueue(lead.id);
                                  setShowAddModal(false);
                                  setSearchTerm('');
                                  setSearchResults([]);
                                } catch (error) {
                                  console.error('Error adding to queue:', error);
                                } finally {
                                  setAddingLead(null);
                                }
                              }}
                              disabled={isInQueue || !hasPhone || addingLead === lead.id}
                              className={`ml-4 px-4 py-2 rounded-lg font-medium transition-colors ${
                                isInQueue || !hasPhone
                                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                  : addingLead === lead.id
                                  ? 'bg-blue-400 text-white cursor-wait'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                              }`}
                            >
                              {addingLead === lead.id ? 'Adding...' : isInQueue ? 'In Queue' : 'Add to Queue'}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default QueueManager;


