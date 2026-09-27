import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QueueManager from '../components/ReplyDesk/QueueManager';
import ConversationViewer from '../components/ReplyDesk/ConversationViewer';
import PerformanceAnalytics from '../components/ReplyDesk/PerformanceAnalytics';
import LeadStatusCards from '../components/ReplyDesk/LeadStatusCards';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';

const Alex = () => {
  const { socket, isConnected } = useSocket();
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedLead, setSelectedLead] = useState(null);
  const [queueData, setQueueData] = useState([]);
  const [activityData, setActivityData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [conversationData, setConversationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState('connected');

  const queueDataMap = useMemo(() => {
    const map = new Map();
    queueData.forEach(lead => map.set(lead.id, lead));
    return map;
  }, [queueData]);

  useEffect(() => {
    if (!socket || !isConnected) {
      setRealtimeStatus('disconnected');
      return;
    }

    setRealtimeStatus('connected');

    const handleStatusUpdate = (data) => {
      setLastUpdate({ type: 'status_update', timestamp: new Date(), data });
      if (queueDataMap.has(data.leadId)) {
        setQueueData(prev => prev.map(lead =>
          lead.id === data.leadId ? { ...lead, replydesk_status: data.status } : lead
        ));
      }
      fetchActivityData();
      if (selectedLead?.id === data.leadId) fetchConversation(data.leadId);
    };

    const handleQueueUpdate = (data) => {
      setLastUpdate({ type: 'queue_update', timestamp: new Date(), data });
      fetchQueueData();
      fetchActivityData();
    };

    const handleHumanRequired = (data) => {
      setLastUpdate({ type: 'human_required', timestamp: new Date(), data });
      fetchQueueData();
      fetchActivityData();
    };

    socket.on('replydesk_status_update', handleStatusUpdate);
    socket.on('replydesk_queue_update', handleQueueUpdate);
    socket.on('replydesk_human_required', handleHumanRequired);

    return () => {
      socket.off('replydesk_status_update', handleStatusUpdate);
      socket.off('replydesk_queue_update', handleQueueUpdate);
      socket.off('replydesk_human_required', handleHumanRequired);
    };
  }, [socket, isConnected, selectedLead, queueDataMap]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchQueueData();
      fetchActivityData();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    try {
      await Promise.all([fetchActivityData(), fetchQueueData(), fetchAnalyticsData()]);
    } catch (error) {
      console.error('Error fetching Alex data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/replydesk-dashboard/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setActivityData(response.data);
    } catch (error) {
      console.error('Error fetching activity data:', error);
    }
  };

  const fetchQueueData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/replydesk-dashboard/queue', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setQueueData(response.data || []);
    } catch (error) {
      console.error('Error fetching queue data:', error);
      setQueueData([]);
    }
  };

  const fetchAnalyticsData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/replydesk-dashboard/analytics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setAnalyticsData(response.data);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    }
  };

  const fetchConversation = async (leadId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/replydesk-dashboard/conversation/${leadId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setConversationData(response.data);
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  };

  const handleLeadSelect = useCallback((lead) => {
    setSelectedLead(lead);
    fetchConversation(lead.id);
  }, []);

  const handleAddToQueue = async (leadId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/replydesk-dashboard/queue/add',
        { leadId },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      fetchQueueData();
    } catch (error) {
      console.error('Error adding to queue:', error);
      alert('Failed to add lead to queue: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleRemoveFromQueue = async (leadId) => {
    if (!window.confirm('Remove this lead from Alex A.I queue?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/replydesk-dashboard/queue/remove',
        { leadId },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      await fetchQueueData();
      if (selectedLead?.id === leadId) {
        setSelectedLead(null);
        setConversationData(null);
      }
    } catch (error) {
      console.error('Error removing from queue:', error);
      alert('Failed to remove lead: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleRemoveAllFromQueue = async () => {
    if (!window.confirm(`Remove ALL ${queueData.length} leads from queue?`)) return;
    try {
      const token = localStorage.getItem('token');
      for (const lead of queueData) {
        try {
          await axios.post('/api/replydesk-dashboard/queue/remove',
            { leadId: lead.id },
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
        } catch (e) { /* continue */ }
      }
      await fetchQueueData();
      setSelectedLead(null);
      setConversationData(null);
    } catch (error) {
      console.error('Error bulk removing:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Alex A.I Dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = activityData?.overallStats || activityData?.todayStats || {};

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Alex A.I Dashboard</h1>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${realtimeStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {lastUpdate && (
                  <span className="text-xs text-gray-500">Updated {new Date(lastUpdate.timestamp).toLocaleTimeString()}</span>
                )}
              </div>
            </div>
            <p className="text-gray-500 mt-1 text-sm">Monitor WhatsApp AI engagement, conversations, and bookings</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                activeView === 'dashboard' ? 'bg-teal-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveView('cards')}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                activeView === 'cards' ? 'bg-teal-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              Card View
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          {[
            { label: 'Leads Sent', value: stats.messagesSent || 0, color: 'text-blue-600 bg-blue-50' },
            { label: 'Engaged', value: stats.leadsEngaged || 0, sub: `${stats.engagementRate || 0}%`, color: 'text-yellow-600 bg-yellow-50' },
            { label: 'Bookings', value: stats.bookingsMade || 0, sub: `${stats.conversionRate || 0}%`, color: 'text-green-600 bg-green-50' },
            { label: 'Human Required', value: stats.humanRequired || 0, color: stats.humanRequired > 0 ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-50' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.color} rounded-xl p-3`}>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs opacity-70">{stat.label} {stat.sub && <span className="font-medium">({stat.sub})</span>}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeView === 'dashboard' ? (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1">
                <QueueManager
                  queue={queueData}
                  onLeadSelect={handleLeadSelect}
                  selectedLead={selectedLead}
                  onAddToQueue={handleAddToQueue}
                  onRemoveFromQueue={handleRemoveFromQueue}
                  onRemoveAll={handleRemoveAllFromQueue}
                  onRefresh={fetchQueueData}
                />
              </motion.div>
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2">
                <ConversationViewer
                  lead={selectedLead}
                  conversation={conversationData}
                  onRefresh={() => selectedLead && fetchConversation(selectedLead.id)}
                />
              </motion.div>
            </div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <PerformanceAnalytics data={analyticsData} />
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <LeadStatusCards
              leads={queueData}
              onLeadSelect={handleLeadSelect}
              onRemoveFromQueue={handleRemoveFromQueue}
              onRemoveAll={handleRemoveAllFromQueue}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Alex;
