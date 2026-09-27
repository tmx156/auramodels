import React, { useState, useEffect, useCallback } from 'react';
import { FiWifi, FiClock, FiMessageSquare, FiMail, FiSend, FiX, FiArrowRight, FiPhone, FiTrash2, FiCheckCircle } from 'react-icons/fi';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { getCurrentUKTime, getTodayUK, getGreeting, getUKTimeString } from '../utils/timeUtils';
import GmailEmailRenderer from '../components/GmailEmailRenderer';

const Dashboard = () => {
  const { user } = useAuth();
  const { isConnected, socket } = useSocket();

  // State management
  const [unreadMessages, setUnreadMessages] = useState([]);
  const [upcomingCallbacks, setUpcomingCallbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(getCurrentUKTime());
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [replyMode, setReplyMode] = useState('sms');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [deletingCallbackId, setDeletingCallbackId] = useState(null);
  const [completingCallbackId, setCompletingCallbackId] = useState(null);

  // Format time ago helper
  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Fetch unread messages
  const fetchUnreadMessages = useCallback(async () => {
    try {
      const messagesRes = await axios.get('/api/messages-list', {
        params: { unread: true, limit: 10 }
      });
      let messages = messagesRes.data?.messages || messagesRes.data || [];
      console.log(`📨 Fetched unread messages:`, messagesRes.data);

      // Ensure messages is always an array
      if (!Array.isArray(messages)) {
        console.warn('📨 Messages response is not an array:', messages);
        messages = [];
      }

      console.log(`📨 Fetched ${messages.length} unread messages`);
      if (messages.length > 0) {
        console.log('📧 Sample message:', {
          leadName: messages[0].leadName,
          type: messages[0].type,
          content: messages[0].content,
          timestamp: messages[0].timestamp
        });
      }
      setUnreadMessages(messages.slice(0, 10));
    } catch (e) {
      console.error('Error fetching unread messages:', e);
    }
  }, []);

  // Fetch upcoming callback reminders
  const fetchUpcomingCallbacks = useCallback(async () => {
    try {
      const callbacksRes = await axios.get('/api/leads/callback-reminders/upcoming');
      const callbacks = callbacksRes.data?.reminders || [];
      const debug = callbacksRes.data?._debug;
      console.log(`📞 Fetched ${callbacks.length} upcoming callback reminders`);
      if (debug) {
        console.log(`📞 DEBUG: Requesting user: ${debug.requestingUserName} (ID: ${debug.requestingUserId})`);
      }
      setUpcomingCallbacks(callbacks);
    } catch (e) {
      console.error('Error fetching upcoming callbacks:', e);
      setUpcomingCallbacks([]);
    }
  }, []);

  // Delete a callback reminder
  const handleDeleteCallback = async (callbackId, leadName) => {
    if (!window.confirm(`Delete callback reminder for ${leadName}?`)) {
      return;
    }

    setDeletingCallbackId(callbackId);
    try {
      const response = await axios.delete(`/api/callback-reminders/${callbackId}`);
      if (response.data.success) {
        // Remove from local state immediately
        setUpcomingCallbacks(prev => prev.filter(cb => cb.id !== callbackId));
        console.log(`🗑️ Callback reminder ${callbackId} deleted`);
      } else {
        alert(response.data.message || 'Failed to delete callback reminder');
      }
    } catch (e) {
      console.error('Error deleting callback:', e);
      const errorMsg = e.response?.data?.message || e.message || 'Failed to delete callback reminder';
      alert(errorMsg);
    } finally {
      setDeletingCallbackId(null);
    }
  };

  // Mark a callback reminder as complete
  const handleCompleteCallback = async (callbackId, leadName) => {
    setCompletingCallbackId(callbackId);
    try {
      const response = await axios.patch(`/api/callback-reminders/${callbackId}/complete`);
      if (response.data.success) {
        setUpcomingCallbacks(prev => prev.filter(cb => cb.id !== callbackId));
        console.log(`✅ Callback reminder ${callbackId} completed`);
      } else {
        alert(response.data.message || 'Failed to complete callback reminder');
      }
    } catch (e) {
      console.error('Error completing callback:', e);
      const errorMsg = e.response?.data?.message || e.message || 'Failed to complete callback reminder';
      alert(errorMsg);
    } finally {
      setCompletingCallbackId(null);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchUnreadMessages();
    fetchUpcomingCallbacks();
    setLoading(false);

    // Update clock every second with UK time
    const clockTimer = setInterval(() => setCurrentTime(getCurrentUKTime()), 1000);

    // Auto-refresh every 30 seconds
    const refreshTimer = setInterval(() => {
      fetchUnreadMessages();
      fetchUpcomingCallbacks();
      setLastUpdated(new Date());
    }, 30000);

    return () => {
      clearInterval(clockTimer);
      clearInterval(refreshTimer);
    };
  }, [fetchUnreadMessages, fetchUpcomingCallbacks]);

  // Real-time socket listeners for live updates
  useEffect(() => {
    if (!socket) return;

    const handleMessageUpdate = () => {
      console.log('📡 Dashboard: Received message update event - refreshing messages');
      fetchUnreadMessages();
      fetchUpcomingCallbacks();
    };

    // Listen to message events
    socket.on('new_message', handleMessageUpdate);
    socket.on('message_read', handleMessageUpdate);

    console.log('📡 Dashboard: Socket listeners registered for real-time updates');

    return () => {
      socket.off('new_message', handleMessageUpdate);
      socket.off('message_read', handleMessageUpdate);
    };
  }, [socket, fetchUnreadMessages, fetchUpcomingCallbacks]);

  // Open message modal
  const handleMessageClick = (message) => {
    setSelectedMessage(message);
    setReplyMode(message.type === 'email' ? 'email' : 'sms');
    setReplyText('');
  };

  // Send reply
  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedMessage) return;

    // Validate recipient exists
    if (replyMode === 'email' && !selectedMessage.leadEmail) {
      alert('Cannot send email: Lead has no email address');
      return;
    }
    if (replyMode === 'sms' && !selectedMessage.leadPhone) {
      alert('Cannot send SMS: Lead has no phone number');
      return;
    }

    setSendingReply(true);
    try {
      console.log('📤 Sending reply:', {
        messageId: selectedMessage.id,
        replyType: replyMode,
        to: replyMode === 'email' ? selectedMessage.leadEmail : selectedMessage.leadPhone,
        leadName: selectedMessage.leadName
      });

      const response = await axios.post('/api/messages-list/reply', {
        messageId: selectedMessage.id,
        replyType: replyMode,        // API expects 'replyType' not 'type'
        reply: replyText             // API expects 'reply' not 'content'
      });

      console.log('✅ Reply sent successfully:', response.data);

      // Mark as read
      await axios.put(`/api/messages-list/${selectedMessage.id}/read`);

      // Close modal and refresh
      setSelectedMessage(null);
      setReplyText('');
      fetchUnreadMessages();
      
      // Show success message with recipient info
      const recipient = replyMode === 'email' 
        ? (selectedMessage.leadEmail || selectedMessage.from)
        : selectedMessage.leadPhone;
      alert(`${replyMode.toUpperCase()} sent successfully to ${selectedMessage.leadName} (${recipient})`);
    } catch (e) {
      console.error('Error sending reply:', e);
      const errorMsg = e.response?.data?.message || e.message || 'Failed to send reply';
      alert(`Failed to send reply: ${errorMsg}`);
    } finally {
      setSendingReply(false);
    }
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="w-full h-full px-2 sm:px-4 lg:px-8 py-3 sm:py-4 lg:py-6">
        {/* Header */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6 lg:mb-8 border-l-4 border-red-500">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 sm:h-3 sm:w-3 bg-red-500 rounded-full animate-pulse"></div>
              <h1 className="text-base sm:text-xl lg:text-2xl font-bold text-gray-900">{getGreeting(user?.name || 'User')}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 lg:gap-6 text-xs sm:text-sm w-full sm:w-auto">
              <div className="flex items-center space-x-2">
                <FiClock className="h-4 w-4 text-gray-500" />
                <span className="font-mono text-gray-700">{getUKTimeString(currentTime)} UK</span>
              </div>
              <div className="flex items-center space-x-2">
                <FiWifi className={`h-4 w-4 ${isConnected ? 'text-green-500' : 'text-red-500'}`} />
                <span className={`font-medium ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
                  {isConnected ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>
              <div className="text-gray-500">Updated {lastUpdated.toLocaleTimeString()}</div>
            </div>
          </div>
        </div>

        {/* TASKS - Full Screen Messages Widget */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 lg:p-8 h-[calc(100vh-200px)] flex flex-col">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <FiMessageSquare className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-indigo-500" />
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">TASKS</h2>
              </div>
              {((unreadMessages || []).length > 0 || (upcomingCallbacks || []).length > 0) && (
              <div className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                  {(unreadMessages || []).length + (upcomingCallbacks || []).length}
                </div>
              )}
            </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {/* Upcoming Callback Reminders */}
              {(upcomingCallbacks || []).length > 0 && (
                <>
                  {upcomingCallbacks.map((callback) => (
                    <div
                      key={callback.id}
                      className={`bg-white border-l-4 rounded-lg p-5 hover:shadow-md transition-shadow ${
                        callback.isOverdue
                          ? 'border-red-700 bg-red-100'
                          : callback.isToday
                            ? 'border-red-500 bg-red-50'
                            : callback.isTomorrow
                              ? 'border-orange-400 bg-orange-50'
                              : 'border-purple-400'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`rounded-full p-2 ${
                            callback.isOverdue
                              ? 'bg-red-200'
                              : callback.isToday
                                ? 'bg-red-100'
                                : callback.isTomorrow
                                  ? 'bg-orange-100'
                                  : 'bg-purple-100'
                          }`}>
                            <FiPhone className={`h-5 w-5 ${
                              callback.isOverdue
                                ? 'text-red-800'
                                : callback.isToday
                                  ? 'text-red-600'
                                  : callback.isTomorrow
                                    ? 'text-orange-600'
                                    : 'text-purple-600'
                            }`} />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">
                              {callback.leadName || 'Unknown Lead'}
                            </p>
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                              callback.isOverdue
                                ? 'text-red-800 bg-red-200 animate-pulse'
                                : callback.isToday
                                  ? 'text-red-700 bg-red-100'
                                  : callback.isTomorrow
                                    ? 'text-orange-700 bg-orange-100'
                                    : 'text-purple-700 bg-purple-100'
                            }`}>
                              {callback.isOverdue ? '⚠️ OVERDUE' : callback.isToday ? '📞 CALL TODAY' : callback.isTomorrow ? '📅 TOMORROW' : '📆 SCHEDULED'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className={`font-semibold mb-2 ${
                        callback.isOverdue ? 'text-red-800' : callback.isToday ? 'text-red-700' : callback.isTomorrow ? 'text-orange-700' : 'text-gray-900'
                      }`}>
                        ⏰ {callback.callbackTimeDisplay}
                      </p>

                      {callback.callbackNote && (
                        <p className="text-gray-700 text-sm mb-3">
                          📝 {callback.callbackNote}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                          {callback.leadPhone && `📱 ${callback.leadPhone}`}
                        </p>
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => handleCompleteCallback(callback.id, callback.leadName)}
                            disabled={completingCallbackId === callback.id}
                            className="text-green-500 hover:text-green-700 transition-colors disabled:opacity-50"
                            title="Mark as complete"
                          >
                            {completingCallbackId === callback.id ? (
                              <span className="text-xs">...</span>
                            ) : (
                              <FiCheckCircle className="h-5 w-5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteCallback(callback.id, callback.leadName)}
                            disabled={deletingCallbackId === callback.id}
                            className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                            title="Delete callback"
                          >
                            {deletingCallbackId === callback.id ? (
                              <span className="text-xs">...</span>
                            ) : (
                              <FiTrash2 className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => window.location.href = `/leads/${callback.leadId}`}
                            className={`font-medium text-sm flex items-center space-x-1 ${
                              callback.isOverdue
                                ? 'text-red-700 hover:text-red-800'
                                : callback.isToday
                                  ? 'text-red-600 hover:text-red-700'
                                  : callback.isTomorrow
                                    ? 'text-orange-600 hover:text-orange-700'
                                    : 'text-purple-600 hover:text-purple-700'
                            }`}
                          >
                            <span>View Lead</span>
                            <FiArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Unread Messages */}
              {(unreadMessages || []).length === 0 && (upcomingCallbacks || []).length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <FiMessageSquare className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg">No unread messages or upcoming tasks</p>
                </div>
              ) : (
                (unreadMessages || []).map((message) => (
                  <div key={message.id} className="bg-white border-l-4 border-orange-400 rounded-lg p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="bg-green-100 rounded-full p-2">
                          {message.type === 'email' ? (
                            <FiMail className="h-5 w-5 text-green-600" />
                          ) : (
                            <FiMessageSquare className="h-5 w-5 text-green-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">
                            {message.leadName || message.from || message.sender_name || 'Unknown'}
                          </p>
                          <span className="inline-block px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
                            {message.type === 'email' ? 'EMAIL' : 'SMS'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {message.subject && (
                      <p className="font-semibold text-gray-900 mb-2">{message.subject}</p>
                    )}

                    <p className="text-gray-700 text-sm mb-3 line-clamp-2">
                      {(message.message || message.content || message.details?.body || message.body || message.preview || '').trim() || 'No content'}
                    </p>

                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        {(message.timestamp || message.created_at) ? new Date(message.timestamp || message.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                      <button
                        onClick={() => handleMessageClick(message)}
                        className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center space-x-1"
                      >
                        <span>Click to reply</span>
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      </button>
                    </div>
                  </div>
                ))
              )}
          </div>
        </div>
      </div>

      {/* Message Reply Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-full sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">Reply to Message</h3>
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FiX className="h-6 w-6" />
                </button>
              </div>

              <div className="mb-6">
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  {/* Message Header */}
                  <div className="mb-3 pb-3 border-b border-gray-200">
                    <p className="text-sm font-semibold text-gray-900 mb-1">
                      <span className="text-gray-500">From:</span> {selectedMessage.leadName || selectedMessage.from || 'Unknown'}
                    </p>
                    {selectedMessage.leadEmail && (
                      <p className="text-sm text-gray-600 mb-1">
                        <span className="text-gray-500">Email:</span> {selectedMessage.leadEmail}
                      </p>
                    )}
                    {selectedMessage.leadPhone && (
                      <p className="text-sm text-gray-600 mb-1">
                        <span className="text-gray-500">Phone:</span> {selectedMessage.leadPhone}
                      </p>
                    )}
                    {selectedMessage.subject && (
                      <p className="text-sm text-gray-700 mt-2">
                        <span className="text-gray-500">Subject:</span> {selectedMessage.subject}
                      </p>
                    )}
                  </div>
                  
                  {/* Email Content - Use Gmail-style HTML renderer */}
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    {selectedMessage.type === 'email' && (selectedMessage.email_body || selectedMessage.html_content) ? (
                      <GmailEmailRenderer
                        htmlContent={selectedMessage.email_body || selectedMessage.html_content}
                        textContent={selectedMessage.content}
                        attachments={selectedMessage.attachments || []}
                        embeddedImages={selectedMessage.embedded_images || []}
                      />
                    ) : (
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedMessage.content || selectedMessage.preview}</p>
                    )}
                  </div>
                </div>

                {/* Reply Recipient Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <p className="text-sm font-medium text-blue-900">
                    <span className="text-blue-600">Reply will be sent to:</span>{' '}
                    {replyMode === 'email' ? (
                      selectedMessage.leadEmail ? (
                        <>{selectedMessage.leadName} ({selectedMessage.leadEmail})</>
                      ) : (
                        <span className="text-red-600">⚠️ No email address available</span>
                      )
                    ) : (
                      selectedMessage.leadPhone ? (
                        <>{selectedMessage.leadName} ({selectedMessage.leadPhone})</>
                      ) : (
                        <span className="text-red-600">⚠️ No phone number available</span>
                      )
                    )}
                  </p>
                </div>

                <div className="flex items-center space-x-4 mb-4">
                  <button
                    onClick={() => setReplyMode('sms')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      replyMode === 'sms'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    SMS
                  </button>
                  <button
                    onClick={() => setReplyMode('email')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      replyMode === 'email'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Email
                  </button>
                </div>

                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Type your ${replyMode} message here...`}
                  className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="6"
                />
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => setSelectedMessage(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendReply}
                  disabled={
                    !replyText.trim() || 
                    sendingReply || 
                    (replyMode === 'email' && !selectedMessage?.leadEmail) ||
                    (replyMode === 'sms' && !selectedMessage?.leadPhone)
                  }
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSend className="h-4 w-4" />
                  <span>{sendingReply ? 'Sending...' : 'Send'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Dashboard;
