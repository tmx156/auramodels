import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LiveActivityMonitor from '../components/SalesApe/LiveActivityMonitor';
import QueueManager from '../components/SalesApe/QueueManager';
import ConversationViewer from '../components/SalesApe/ConversationViewer';
import PerformanceAnalytics from '../components/SalesApe/PerformanceAnalytics';
import LeadStatusCards from '../components/SalesApe/LeadStatusCards';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';

const SalesApe = () => {
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

  // Optimized queue data with memoization
  const queueDataMap = useMemo(() => {
    const map = new Map();
    queueData.forEach(lead => map.set(lead.id, lead));
    return map;
  }, [queueData]);

  // Real-time event handlers with optimized updates
  useEffect(() => {
    if (!socket || !isConnected) {
      setRealtimeStatus('disconnected');
      return;
    }

    setRealtimeStatus('connected');

    // SalesApe status updates
    const handleStatusUpdate = (data) => {
      console.log('📡 Real-time: SalesApe status update', data);
      setLastUpdate({ type: 'status_update', timestamp: new Date(), data });
      
      // Update queue data if this lead is in queue
      if (queueDataMap.has(data.leadId)) {
        setQueueData(prev => prev.map(lead => 
          lead.id === data.leadId 
            ? { ...lead, ...data }
            : lead
        ));
      }
      
      // Refresh activity data
      fetchActivityData();
      
      // If this is the selected lead, refresh conversation
      if (selectedLead?.id === data.leadId) {
        fetchConversation(data.leadId);
      }
    };

    // SalesApe message updates
    const handleMessage = (data) => {
      console.log('📡 Real-time: SalesApe message', data);
      setLastUpdate({ type: 'message', timestamp: new Date(), data });
      
      // Refresh queue to show progress
      fetchQueueData();
      fetchActivityData();
      
      // If this is the selected lead, refresh conversation
      if (selectedLead?.id === data.leadId) {
        fetchConversation(data.leadId);
      }
    };

    // SalesApe queue updates
    const handleQueueUpdate = (data) => {
      console.log('📡 Real-time: SalesApe queue update', data);
      setLastUpdate({ type: 'queue_update', timestamp: new Date(), data });
      
      // Immediately refresh queue
      fetchQueueData();
      fetchActivityData();
      
      // If this is a status update for the selected lead, refresh conversation
      if (selectedLead?.id === data.leadId && data.action === 'updated') {
        fetchConversation(data.leadId);
      }
    };

    // Calendar link sent
    const handleCalendarLinkSent = (data) => {
      console.log('📡 Real-time: Calendar link sent', data);
      setLastUpdate({ type: 'calendar_link_sent', timestamp: new Date(), data });
      
      // If this is the selected lead, refresh conversation
      if (selectedLead?.id === data.leadId) {
        fetchConversation(data.leadId);
      }
    };

    // Subscribe to events
    socket.on('salesape_status_update', handleStatusUpdate);
    socket.on('salesape_message', handleMessage);
    socket.on('salesape_queue_update', handleQueueUpdate);
    socket.on('salesape_calendar_link_sent', handleCalendarLinkSent);

    // Cleanup
    return () => {
      socket.off('salesape_status_update', handleStatusUpdate);
      socket.off('salesape_message', handleMessage);
      socket.off('salesape_queue_update', handleQueueUpdate);
      socket.off('salesape_calendar_link_sent', handleCalendarLinkSent);
    };
  }, [socket, isConnected, selectedLead, queueDataMap]);

  // Fetch initial data
  useEffect(() => {
    fetchAllData();
    
    // Auto-refresh every 30 seconds as backup (real-time updates are primary)
    const interval = setInterval(() => {
      fetchQueueData();
      fetchActivityData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchActivityData(),
        fetchQueueData(),
        fetchAnalyticsData()
      ]);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching SalesApe data:', error);
      setLoading(false);
    }
  };

  const fetchActivityData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/salesape-dashboard/status', {
        headers: { 'x-auth-token': token }
      });
      setActivityData(response.data);
    } catch (error) {
      console.error('Error fetching activity data:', error);
    }
  };

  const fetchQueueData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/salesape-dashboard/queue', {
        headers: { 'x-auth-token': token }
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
      const response = await axios.get('/api/salesape-dashboard/analytics', {
        headers: { 'x-auth-token': token }
      });
      setAnalyticsData(response.data);
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    }
  };

  const fetchConversation = async (leadId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/salesape-dashboard/conversation/${leadId}`, {
        headers: { 'x-auth-token': token }
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
      await axios.post('/api/salesape-dashboard/queue/add', 
        { leadId },
        { headers: { 'x-auth-token': token } }
      );
      fetchQueueData();
    } catch (error) {
      console.error('Error adding to queue:', error);
      alert('Failed to add lead to queue');
    }
  };

  const handleRemoveFromQueue = async (leadId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('/api/salesape-dashboard/queue/remove',
        { leadId },
        { headers: { 'x-auth-token': token } }
      );

      await fetchQueueData();
      alert('✅ Lead removed from queue successfully');

      if (selectedLead?.id === leadId) {
        setSelectedLead(null);
        setConversationData(null);
      }
    } catch (error) {
      console.error('❌ Error removing from queue:', error);
      alert(`Failed to remove lead: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleRemoveAllFromQueue = async () => {
    if (!window.confirm(`Remove ALL ${queueData.length} leads from queue? This will stop all SalesApe conversations.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      let successCount = 0;
      let failCount = 0;

      for (const lead of queueData) {
        try {
          await axios.post('/api/salesape-dashboard/queue/remove',
            { leadId: lead.id },
            { headers: { 'x-auth-token': token } }
          );
          successCount++;
        } catch (error) {
          console.error(`Failed to remove lead ${lead.id}:`, error);
          failCount++;
        }
      }

      await fetchQueueData();
      setSelectedLead(null);
      setConversationData(null);

      alert(`✅ Removed ${successCount} leads from queue${failCount > 0 ? `\n⚠️ ${failCount} failed to remove` : ''}`);
    } catch (error) {
      console.error('Error bulk removing from queue:', error);
      alert('Failed to remove all leads from queue');
    }
  };

  const handlePauseQueue = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/salesape-dashboard/queue/pause', 
        {},
        { headers: { 'x-auth-token': token } }
      );
      fetchActivityData();
    } catch (error) {
      console.error('Error pausing queue:', error);
      alert('Failed to pause queue');
    }
  };

  const handleResumeQueue = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/salesape-dashboard/queue/resume', 
        {},
        { headers: { 'x-auth-token': token } }
      );
      fetchActivityData();
    } catch (error) {
      console.error('Error resuming queue:', error);
      alert('Failed to resume queue');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading SalesApe Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <span className="text-4xl mr-3">🤖</span>
                SalesApe AI Dashboard
              </h1>
              {/* Real-time status indicator */}
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  realtimeStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`} title={realtimeStatus === 'connected' ? 'Real-time connected' : 'Real-time disconnected'}></div>
                {lastUpdate && (
                  <span className="text-xs text-gray-500">
                    Updated {new Date(lastUpdate.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <p className="text-gray-600 mt-1">
              Monitor AI engagement, conversations, and performance in real-time
            </p>
          </div>
          
          {/* View Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveView('dashboard')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeView === 'dashboard'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              📊 Dashboard View
            </button>
            <button
              onClick={() => setActiveView('cards')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeView === 'cards'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              🎴 Card View
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard View */}
      <AnimatePresence mode="wait">
        {activeView === 'dashboard' ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Live Activity Monitor */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <LiveActivityMonitor 
                data={activityData}
                onPause={handlePauseQueue}
                onResume={handleResumeQueue}
              />
            </motion.div>

            {/* Main Content: Queue + Conversation */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Queue Manager */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="lg:col-span-1"
              >
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

              {/* Conversation Viewer */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="lg:col-span-2"
              >
                <ConversationViewer
                  lead={selectedLead}
                  conversation={conversationData}
                  onRefresh={() => selectedLead && fetchConversation(selectedLead.id)}
                  onCalendarLinkSent={() => selectedLead && fetchConversation(selectedLead.id)}
                />
              </motion.div>
            </div>

            {/* Performance Analytics */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <PerformanceAnalytics data={analyticsData} />
            </motion.div>
          </motion.div>
        ) : (
          /* Card View */
          <motion.div
            key="cards"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
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

export default SalesApe;
