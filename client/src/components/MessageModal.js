import React, { useState, useEffect, useCallback } from 'react';
import { 
  FiX, 
  FiMessageSquare, 
  FiMail,
  FiSend, 
  FiUser, 
  FiClock,
  FiArrowRight,
  FiCheck,
  FiAlertCircle,
  FiPaperclip,
  FiDownload,
  FiFile
} from 'react-icons/fi';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { decodeEmailContent, isEmailContentEncoded } from '../utils/emailContentDecoder';
import GmailEmailRenderer from './GmailEmailRenderer';

const MessageModal = ({ notification, isOpen, onClose, onReply }) => {
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [markingAsRead, setMarkingAsRead] = useState(false);
  const [readError, setReadError] = useState(null);
  const { socket } = useSocket();

  // Define fetchConversationHistory function first
  const fetchConversationHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      
      // Fetch messages from messages-list API to get full content including email_body
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/messages-list', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        params: { limit: 200 }
      });
      
      const messages = response.data.messages || [];
      
      // Filter messages for this lead and type
      const filteredMessages = messages.filter(msg => {
        if (msg.leadId !== notification.leadId) return false;
        if (notification?.type === 'email' && msg.type === 'email') return true;
        if (notification?.type === 'sms' && msg.type === 'sms') return true;
        return false;
      });
      
      // Convert to conversation format
      const convo = filteredMessages
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map(msg => ({
          action: msg.direction === 'sent' 
            ? (msg.type === 'email' ? 'EMAIL_SENT' : 'SMS_SENT')
            : (msg.type === 'email' ? 'EMAIL_RECEIVED' : 'SMS_RECEIVED'),
          timestamp: msg.timestamp,
          performed_by: msg.performedBy,
          performed_by_name: msg.performedByName,
          details: {
            subject: msg.subject,
            body: msg.content,
            message: msg.content,
            email_body: msg.email_body || msg.details?.email_body || null,
            html_content: msg.email_body || msg.details?.email_body || null,
            direction: msg.direction,
            channel: msg.type,
            attachments: msg.attachments || [],
            embedded_images: msg.embedded_images || []
          }
        }));

      // CLIENT-SIDE DEDUPLICATION - Remove exact duplicates
      const seenKeys = new Set();
      const dedupedConvo = convo.filter(entry => {
        const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : '';
        const action = entry.action || '';
        const body = entry.details?.body || entry.details?.message || '';
        const subject = entry.details?.subject || '';
        const performedBy = entry.performed_by || '';
        
        // Create a unique key including body content to catch duplicates
        const timeKey = timestamp ? new Date(timestamp).setSeconds(0, 0) : 0;
        const bodyContent = body.substring(0, 200).trim().toLowerCase();
        const key = `${action}_${timeKey}_${performedBy}_${subject.substring(0, 50)}_${bodyContent}`;
        
        if (seenKeys.has(key)) {
          console.log('🔄 Client-side deduplication: Removing duplicate entry');
          return false;
        }
        seenKeys.add(key);
        return true;
      });

      setConversationHistory(dedupedConvo);
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      setConversationHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [notification?.leadId, notification?.type]);

  // Reset state when modal opens with a new notification
  useEffect(() => {
    if (isOpen && notification) {
      setMarkingAsRead(false);
      setReadError(null);
      fetchConversationHistory();
      
      // Mark the message as read when modal opens (always try, even if marked as read)
      // This ensures the database is updated even if UI state is stale
      const markMessageAsRead = async () => {
        // Always try to mark as read, even if notification.read is true
        // This handles cases where UI state is stale but database isn't updated
        console.log('📱 MessageModal: Marking message as read (always attempt for consistency)');

        try {
          setMarkingAsRead(true);
          setReadError(null);
          console.log('📱 MessageModal: Attempting to mark message as read:', notification.id);
          console.log('📱 MessageModal: Notification object:', notification);
          
          // Use the stored messageId if available, otherwise use notification.id
          // Priority: messageId > id (both should be UUIDs from messages table)
          let messageIdentifier = notification.messageId || notification.id;
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

          // Validate it's a UUID
          if (!uuidRegex.test(messageIdentifier)) {
            // If not a UUID, try to extract UUID part if composite
            const uuidPart = messageIdentifier.includes('_') ? messageIdentifier.split('_')[0] : messageIdentifier;
            if (uuidRegex.test(uuidPart)) {
              messageIdentifier = uuidPart;
              console.log('📱 MessageModal: Extracted UUID from composite ID:', messageIdentifier);
            } else {
              console.warn('📱 MessageModal: Invalid message ID format, may fail:', messageIdentifier);
            }
          }

          console.log('📱 MessageModal: Final message identifier:', messageIdentifier);
          console.log('📱 MessageModal: Has leadId:', !!notification.leadId, 'Has timestamp:', !!notification.timestamp);

          const token = localStorage.getItem('token');
          const response = await axios.put(`/api/messages-list/${messageIdentifier}/read`, {}, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          
          console.log('📱 MessageModal: API response:', response.data);

          if (response.data.success) {
            console.log('✅ MessageModal: Message marked as read successfully:', notification.id);
            console.log('📋 MessageModal: Update method used:', response.data.method || 'booking_history');
            setMarkingAsRead(false);

            // Also emit a direct socket event as backup to ensure synchronization
            if (socket) {
              socket.emit('message_read_direct', {
                messageId: notification.id,
                leadId: notification.leadId,
                leadName: notification.leadName
              });
              console.log('📡 MessageModal: Emitted direct socket event as backup');
            }
          } else {
            console.error('❌ MessageModal: API response indicates failure:', response.data);
            setReadError('Failed to mark message as read');
            setMarkingAsRead(false);
          }
        } catch (error) {
          console.error('❌ MessageModal: Error marking message as read:', error);
          console.error('❌ MessageModal: Error details:', error.response?.data);

          // Handle 404 - message doesn't exist
          if (error.response?.status === 404) {
            console.log('🗑️ MessageModal: Message not found (404), but keeping modal open:', notification.id);
            setReadError('Message not found in database');
            setMarkingAsRead(false);
            // Don't close the modal - just log the error and continue showing the modal
            // The user can still see the conversation history even if read status fails
          } else {
            setReadError(error.response?.data?.message || 'Failed to mark message as read');
            setMarkingAsRead(false);
          }
        }
      };
      
      // Add a small delay to ensure modal is fully rendered
      const timeoutId = setTimeout(() => {
        markMessageAsRead();
      }, 100);

      return () => clearTimeout(timeoutId);
    } else if (!isOpen) {
      // Reset state when modal closes
      setMarkingAsRead(false);
      setReadError(null);
    }
  }, [isOpen, notification, fetchConversationHistory, socket]);

  // Listen for real-time updates to refresh conversation fast
  useEffect(() => {
    if (socket && isOpen && notification) {
      const handleLeadUpdate = (update) => {
        if (update.type === 'LEAD_UPDATED' && update.data.lead && 
            update.data.lead.id === notification.leadId) {
          // Refresh conversation history when this lead is updated
          fetchConversationHistory();
        }
      };
      const handleSmsReceived = (data) => {
        if (data && data.leadId === notification.leadId) {
          fetchConversationHistory();
        }
      };
      
      const handleMessageReceived = (data) => {
        if (data && data.leadId === notification.leadId) {
          fetchConversationHistory();
        }
      };

      socket.on('lead_updated', handleLeadUpdate);
      socket.on('sms_received', handleSmsReceived);
      socket.on('message_received', handleMessageReceived);
      
      return () => {
        socket.off('lead_updated', handleLeadUpdate);
        socket.off('sms_received', handleSmsReceived);
        socket.off('message_received', handleMessageReceived);
      };
    }
  }, [socket, isOpen, notification, fetchConversationHistory]);

  // Auto-scroll to bottom when conversation loads
  useEffect(() => {
    if (conversationHistory.length > 0) {
      const conversationDiv = document.querySelector('.conversation-scroll');
      if (conversationDiv) {
        conversationDiv.scrollTop = conversationDiv.scrollHeight;
      }
    }
  }, [conversationHistory]);

  if (!isOpen || !notification) return null;

  const handleSendReply = async () => {
    if (!replyText.trim()) {
      alert('Please enter a reply message');
      return;
    }

    // Prevent duplicate sends
    if (sending) {
      console.log('Reply already being sent, ignoring duplicate request');
      return;
    }

    try {
      setSending(true);
      if (notification?.type === 'email') {
        // Send Email reply
        const subjectBase = notification?.subject || notification?.content || '';
        const subject = subjectBase && !/^re\s*:/i.test(subjectBase) ? `Re: ${subjectBase}` : (subjectBase || 'Re:');
        const response = await axios.post(`/api/leads/${notification.leadId}/send-email`, {
          subject,
          body: replyText
        });
        if (response.data.success) {
          alert('Email sent successfully!');
          setReplyText('');
          try { await axios.put(`/api/messages-list/${notification.id}/read`); } catch {}
          await fetchConversationHistory();
          onReply && onReply({ leadId: notification.leadId, leadName: notification.leadName, content: replyText });
          if (socket) { socket.emit('message_read', { leadId: notification.leadId }); }
        } else {
          alert('Failed to send email: ' + (response.data.message || 'Unknown error'));
        }
      } else {
        // Send SMS reply (unchanged)
        const response = await axios.post(`/api/leads/${notification.leadId}/send-sms`, {
          message: replyText,
          type: 'custom'
        });
        if (response.data.success) {
          alert('SMS reply sent successfully!');
          const sentMessageText = replyText;
          setReplyText('');
          try { await axios.put(`/api/messages-list/${notification.id}/read`); } catch {}
          await fetchConversationHistory();
          onReply && onReply({
            leadId: notification.leadId,
            leadName: notification.leadName,
            leadPhone: notification.leadPhone,
            content: sentMessageText
          });
          if (socket) { socket.emit('message_read', { leadId: notification.leadId }); }
        } else {
          alert('Failed to send SMS: ' + (response.data.message || 'Unknown error'));
        }
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Error sending message: ' + (error.response?.data?.message || error.message));
    } finally {
      setSending(false);
    }
  };

  // Improved timestamp formatting with error handling
  const formatTime = (timestamp) => {
    try {
      if (!timestamp) return 'Unknown time';
      
      // Handle different timestamp formats
      let date;
      if (typeof timestamp === 'string') {
        // Try parsing ISO string or other formats
        date = new Date(timestamp);
      } else if (typeof timestamp === 'number') {
        // Handle Unix timestamp (both seconds and milliseconds)
        date = new Date(timestamp > 1000000000000 ? timestamp : timestamp * 1000);
      } else {
        date = new Date(timestamp);
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid timestamp:', timestamp);
        return 'Invalid date';
      }
      
      const now = new Date();
      const diffMs = now - date;
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      
      // Format based on how recent the message is
      if (diffHours < 1) {
        const minutes = Math.floor(diffMs / (1000 * 60));
        return minutes <= 0 ? 'Just now' : `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
      } else if (diffHours < 24) {
        return date.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: true 
        });
      } else if (diffDays < 7) {
        const days = Math.floor(diffDays);
        return `${days} day${days === 1 ? '' : 's'} ago at ${date.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: true 
        })}`;
      } else {
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: true 
        });
      }
    } catch (error) {
      console.error('Error formatting timestamp:', error, 'Timestamp:', timestamp);
      return 'Unknown time';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            {notification?.type === 'email' 
              ? <FiMail className="h-5 w-5 text-green-600" /> 
              : <FiMessageSquare className="h-5 w-5 text-blue-600" />}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {notification.isGrouped ? 'Conversation with' : 'Message from'} {notification.leadName || 'Unknown'}
                {notification.isGrouped && notification.conversationCount > 1 && (
                  <span className="ml-2 text-sm font-normal text-purple-600">
                    ({notification.conversationCount} messages)
                  </span>
                )}
              </h3>
              <div className="flex items-center space-x-2">
                <p className="text-sm text-gray-500">
                  <FiClock className="h-3 w-3 inline mr-1" />
                  {notification.isGrouped ? 'Latest message: ' : ''}
                  {formatTime(notification.timestamp)}
                </p>
                {markingAsRead && (
                  <span className="text-xs text-blue-600 flex items-center">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-1"></div>
                    Marking as read...
                  </span>
                )}
                {readError && (
                  <span className="text-xs text-red-600 flex items-center">
                    <FiAlertCircle className="h-3 w-3 mr-1" />
                    {readError}
                  </span>
                )}
                {!markingAsRead && !readError && notification.read && (
                  <span className="text-xs text-green-600 flex items-center">
                    <FiCheck className="h-3 w-3 mr-1" />
                    Read
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* Conversation History - Gmail Style */}
        <div className="p-4 max-h-96 overflow-y-auto conversation-scroll bg-white">
          {/* Display the current message if available */}
          {notification?.content && (
            <div className={`mb-4 rounded-lg shadow-sm ${
              notification.direction === 'sent' 
                ? 'bg-blue-600 text-white ml-auto max-w-[85%]' 
                : 'bg-gray-100 text-gray-900 mr-auto max-w-[85%]'
            }`}>
              <div className={`px-4 py-3 border-b ${
                notification.direction === 'sent' ? 'border-blue-500' : 'border-gray-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm font-semibold ${
                      notification.direction === 'sent' ? 'text-blue-100' : 'text-gray-900'
                    }`}>
                      {notification.direction === 'sent' ? 'You' : (notification.leadName || 'Unknown')}
                    </span>
                    {notification.subject && (
                      <span className={`text-xs ${
                        notification.direction === 'sent' ? 'text-blue-200' : 'text-gray-600'
                      }`}>
                        {notification.subject}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs ${
                    notification.direction === 'sent' ? 'text-blue-200' : 'text-gray-500'
                  }`}>
                    {formatTime(notification.timestamp)}
                  </span>
                </div>
              </div>
              <div className="px-4 py-3">
                {/* Use GmailEmailRenderer for emails, fallback to text for SMS */}
                {notification?.type === 'email' && (notification.email_body || notification.html_content) ? (
                  <div className="email-html-wrapper">
                    <GmailEmailRenderer
                      htmlContent={notification.email_body || notification.html_content}
                      textContent={notification.content}
                      attachments={notification.attachments || []}
                      embeddedImages={notification.embedded_images || []}
                    />
                  </div>
                ) : (
                  <>
                    <p className={`text-sm whitespace-pre-wrap break-words ${
                      notification.direction === 'sent' ? 'text-white' : 'text-gray-900'
                    }`}>
                      {decodeEmailContent(notification.content)}
                    </p>
                    {isEmailContentEncoded(notification.content) && (
                      <span className={`mt-2 inline-block px-2 py-0.5 text-xs rounded ${
                        notification.direction === 'sent' 
                          ? 'bg-blue-500 text-blue-100' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        Auto-decoded
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-500">Loading conversation...</span>
            </div>
          ) : conversationHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FiMessageSquare className="mx-auto h-8 w-8 mb-2" />
              <p>No previous conversation history</p>
              <p className="text-xs mt-1">This is the start of your conversation</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversationHistory
                .filter((message, index) => {
                  // Filter out the current notification message to prevent duplication
                  const currentMessageContent = notification?.content || '';
                  const historyMessageContent = message.details?.body || message.details?.message || message.details?.subject || '';
                  
                  // Skip if this is the same message as the current notification
                  if (currentMessageContent.trim() === historyMessageContent.trim()) {
                    console.log('🔄 Filtering out duplicate message from conversation history');
                    return false;
                  }
                  
                  // Skip if timestamps are very close (within 5 seconds) and content is similar
                  if (notification?.timestamp && message.timestamp) {
                    const currentTime = new Date(notification.timestamp).getTime();
                    const historyTime = new Date(message.timestamp).getTime();
                    const timeDiff = Math.abs(currentTime - historyTime);
                    
                    if (timeDiff < 5000 && currentMessageContent.includes(historyMessageContent.substring(0, 50))) {
                      console.log('🔄 Filtering out near-duplicate message from conversation history');
                      return false;
                    }
                  }
                  
                  return true;
                })
                .map((message, index) => {
                  const isSent = ['SMS_SENT', 'EMAIL_SENT'].includes(message.action);
                  const isFailed = message.action === 'SMS_FAILED';
                  
                  return (
                    <div 
                      key={`${message.timestamp}-${index}`}
                      className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-3`}
                    >
                      <div className={`max-w-[85%] rounded-lg shadow-sm ${
                        isSent
                          ? 'bg-blue-600 text-white' 
                          : isFailed
                            ? 'bg-red-50 border border-red-300 text-red-800'
                            : 'bg-gray-100 text-gray-900'
                      }`}>
                        {/* Message Header */}
                        <div className={`px-4 py-2 border-b ${
                          isSent ? 'border-blue-500' : isFailed ? 'border-red-300' : 'border-gray-300'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className={`text-sm font-semibold ${
                                isSent ? 'text-blue-100' : isFailed ? 'text-red-900' : 'text-gray-900'
                              }`}>
                                {isSent ? 'You' : (notification.leadName || 'Unknown')}
                              </span>
                              {message.details?.subject && (
                                <span className={`text-xs ${
                                  isSent ? 'text-blue-200' : isFailed ? 'text-red-700' : 'text-gray-600'
                                }`}>
                                  {message.details.subject}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`text-xs ${
                                isSent ? 'text-blue-200' : isFailed ? 'text-red-700' : 'text-gray-500'
                              }`}>
                                {formatTime(message.timestamp)}
                              </span>
                              {isSent && (
                                <FiCheck className={`h-3 w-3 ${
                                  message.delivery_status === 'delivered' 
                                    ? 'text-blue-200' 
                                    : 'text-blue-300'
                                }`} />
                              )}
                              {isFailed && (
                                <FiAlertCircle className="h-3 w-3 text-red-600" title={message.details?.error_message || 'Failed'} />
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Message Body */}
                        <div className="px-4 py-3">
                          {/* Use GmailEmailRenderer for emails if HTML content is available */}
                          {notification?.type === 'email' && (message.details?.email_body || message.details?.html_content) ? (
                            <div className={isSent ? 'email-sent' : isFailed ? 'email-failed' : 'email-received'}>
                              <GmailEmailRenderer
                                htmlContent={message.details?.email_body || message.details?.html_content}
                                textContent={message.details?.body || message.details?.message || message.details?.subject || 'No content'}
                                attachments={message.details?.attachments || []}
                                embeddedImages={message.details?.embedded_images || []}
                              />
                            </div>
                          ) : (
                            <p className={`text-sm whitespace-pre-wrap break-words ${
                              isSent ? 'text-white' : isFailed ? 'text-red-900' : 'text-gray-900'
                            }`}>
                              {decodeEmailContent(message.details?.body || message.details?.message || message.details?.subject || 'No content')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Reply Section */}
        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              {notification?.type === 'email' ? 'Reply via Email' : 'Reply via SMS'}
            </label>
            <div className="flex space-x-3">
              <div className="flex-1">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply message..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows="3"
                  maxLength={notification?.type === 'email' ? 5000 : 160}
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-gray-500">
                    {replyText.length}/{notification?.type === 'email' ? 5000 : 160} characters
                  </p>
                  {replyText.length > 140 && (
                    <p className="text-xs text-orange-500">
                      May be sent as multiple messages
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-50 px-4 py-3 flex justify-between items-center">
          <button
            onClick={() => window.open(`/leads/${notification.leadId}`, '_blank')}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center space-x-1"
          >
            <FiUser className="h-4 w-4" />
            <span>View Lead Details</span>
            <FiArrowRight className="h-3 w-3" />
          </button>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Close
            </button>
            <button
              onClick={handleSendReply}
              disabled={sending || !replyText.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <FiSend className="h-4 w-4" />
                  <span>{notification?.type === 'email' ? 'Send Email' : 'Send SMS'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageModal;