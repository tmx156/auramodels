import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiPlus, FiTrash2, FiRefreshCw, FiPhone, FiMail, FiX, FiAlertTriangle } from 'react-icons/fi';
import axios from 'axios';

const STATUS_CONFIG = {
  needs_attention: { label: 'Human Required', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', priority: 0 },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500 animate-pulse', priority: 1 },
  queued: { label: 'Queued', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500', priority: 2 },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', priority: 3 },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500', priority: 4 },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 border-gray-200', dot: 'bg-gray-400', priority: 5 },
};

const REPLYDESK_STATUS_LABELS = {
  'New': 'Queued',
  'Qualifying': 'Qualifying Lead',
  'Objection_Distance': 'Handling Objection',
  'Booking_Offered': 'Booking Offered',
  'Booked': 'Booked',
  'Human_Required': 'Human Required',
  'failed': 'Failed',
  'cancelled': 'Cancelled'
};

const QueueManager = ({ queue, onLeadSelect, selectedLead, onAddToQueue, onRemoveFromQueue, onRemoveAll, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearchTerm, setAddSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [filter, setFilter] = useState('all');

  const sortedQueue = [...queue].sort((a, b) => {
    const aPriority = STATUS_CONFIG[a.queue_status]?.priority ?? 99;
    const bPriority = STATUS_CONFIG[b.queue_status]?.priority ?? 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return new Date(b.replydesk_sent_at) - new Date(a.replydesk_sent_at);
  });

  const filteredQueue = sortedQueue.filter(lead => {
    if (filter !== 'all' && lead.queue_status !== filter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (lead.name?.toLowerCase().includes(term) || lead.phone?.includes(term) || lead.email?.toLowerCase().includes(term));
    }
    return true;
  });

  const statusCounts = queue.reduce((acc, lead) => {
    acc[lead.queue_status] = (acc[lead.queue_status] || 0) + 1;
    return acc;
  }, {});

  const handleSearchLeads = async () => {
    if (!addSearchTerm.trim()) return;
    setSearching(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/leads?search=${encodeURIComponent(addSearchTerm)}&limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const leads = response.data.leads || response.data || [];
      setSearchResults(leads.filter(l => !queue.find(q => q.id === l.id)));
    } catch (error) {
      console.error('Error searching leads:', error);
    } finally {
      setSearching(false);
    }
  };

  const timeSince = (dateStr) => {
    if (!dateStr) return '';
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            Queue
            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{queue.length}</span>
          </h2>
          <div className="flex gap-2">
            <button onClick={onRefresh} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
              <FiRefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => setShowAddModal(true)} className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Add lead">
              <FiPlus className="w-4 h-4" />
            </button>
            {queue.length > 0 && (
              <button onClick={onRemoveAll} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove all">
                <FiTrash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search queue..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-1 text-xs rounded-full transition-colors ${filter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All ({queue.length})
          </button>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const count = statusCounts[key] || 0;
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${filter === key ? 'bg-gray-800 text-white' : `${cfg.color}`}`}
              >
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Queue List */}
      <div className="max-h-[500px] overflow-y-auto">
        {filteredQueue.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-sm">{queue.length === 0 ? 'No leads in queue yet' : 'No matching leads'}</p>
            {queue.length === 0 && (
              <button onClick={() => setShowAddModal(true)} className="mt-2 text-teal-600 text-sm hover:underline">
                Add a lead to get started
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence>
            {filteredQueue.map(lead => {
              const statusCfg = STATUS_CONFIG[lead.queue_status] || STATUS_CONFIG.queued;
              return (
                <motion.div
                  key={lead.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  onClick={() => onLeadSelect(lead)}
                  className={`p-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${selectedLead?.id === lead.id ? 'bg-teal-50 border-l-2 border-l-teal-500' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
                        <span className="font-medium text-sm text-gray-800 truncate">{lead.name || 'Unknown'}</span>
                        {lead.queue_status === 'needs_attention' && (
                          <FiAlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {lead.phone && <span className="flex items-center gap-1"><FiPhone className="w-3 h-3" />{lead.phone}</span>}
                        {lead.email && <span className="flex items-center gap-1 truncate"><FiMail className="w-3 h-3" />{lead.email}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${statusCfg.color}`}>
                          {REPLYDESK_STATUS_LABELS[lead.replydesk_status] || lead.replydesk_status || 'Queued'}
                        </span>
                        <span className="text-xs text-gray-400">{timeSince(lead.replydesk_last_updated || lead.replydesk_sent_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveFromQueue(lead.id); }}
                      className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Remove from queue"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Add Lead to Alex A.I Queue</h3>
              <button onClick={() => { setShowAddModal(false); setSearchResults([]); setAddSearchTerm(''); }} className="p-1 hover:bg-gray-100 rounded-lg">
                <FiX className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={addSearchTerm}
                  onChange={(e) => setAddSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchLeads()}
                  placeholder="Search by name or phone..."
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500"
                />
                <button onClick={handleSearchLeads} disabled={searching} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50">
                  {searching ? '...' : 'Search'}
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {searchResults.map(lead => (
                  <div key={lead.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <div>
                      <div className="text-sm font-medium">{lead.name}</div>
                      <div className="text-xs text-gray-400">{lead.phone || lead.email}</div>
                    </div>
                    <button
                      onClick={async () => {
                        await onAddToQueue(lead.id);
                        setSearchResults(prev => prev.filter(l => l.id !== lead.id));
                      }}
                      className="px-3 py-1 bg-teal-100 text-teal-700 rounded-lg text-xs hover:bg-teal-200"
                    >
                      Add
                    </button>
                  </div>
                ))}
                {searchResults.length === 0 && addSearchTerm && !searching && (
                  <p className="text-sm text-gray-400 text-center py-4">No matching leads found</p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default QueueManager;
