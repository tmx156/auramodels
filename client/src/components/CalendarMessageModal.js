import React, { useState, useEffect, useCallback } from 'react';
import { 
  FiX, 
  FiMessageSquare, 
  FiMail,
  FiSend, 
  FiClock,
  FiCheck,
  FiPaperclip,
  FiUser,
  FiAlertCircle
} from 'react-icons/fi';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { decodeEmailContent } from '../utils/emailContentDecoder';
import GmailEmailRenderer from './GmailEmailRenderer';

/**
 * CalendarMessageModal - Popup modal for viewing and replying to SMS/Email
 * Separate from Calendar modal to avoid scrolling issues
 */
const CalendarMessageModal = ({ 
  isOpen, 
  onClose, 
  lead,
  initialChannel = 'sms' // 'sms' or 'email'
}) => {
  const [channel, setChannel] = useState(initialChannel);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [debugInfo, setDebugInfo] = useState({});
  const [sendSuccess, setSendSuccess] = useState(false);
  const { socket } = useSocket();

  // DEBUG: Comprehensive message fetching with logging
  const fetchMessages = useCallback(async () => {
    if (!lead?.id) {
      console.error('❌ No lead ID provided');
      return;
    }
    
    setLoading(true);
    const debug = { steps: [], errors: [], apiMessages: 0, filteredMessages: 0 };
    
    try {
      const token = localStorage.getItem('token');
      debug.steps.push('Starting fetch for lead: ' + lead.id);
      
      // Use lead-specific messages endpoint
      let finalMessages = [];
      try {
        debug.steps.push(`Calling /api/leads/${lead.id}/messages...`);
        const response = await axios.get(`/api/leads/${lead.id}/messages`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        const apiMessages = response.data?.messages || [];
        debug.apiMessages = apiMessages.length;
        debug.steps.push(`API returned ${apiMessages.length} messages for lead`);

        // Filter by channel and convert to display format
        finalMessages = apiMessages
          .filter(msg => {
            const isEmail = msg.action?.startsWith('EMAIL');
            const isSms = msg.action?.startsWith('SMS');
            return channel === 'email' ? isEmail : isSms;
          })
          .map((msg, idx) => ({
            id: msg.id || `${msg.action}_${msg.timestamp}_${idx}`,
            leadId: lead.id,
            type: msg.action?.startsWith('EMAIL') ? 'email' : 'sms',
            direction: msg.details?.direction || (msg.action?.includes('SENT') ? 'sent' : 'received'),
            content: msg.details?.body || msg.details?.message || '',
            subject: msg.details?.subject,
            email_body: msg.details?.email_body || msg.details?.html_content,
            timestamp: msg.timestamp,
            attachments: msg.details?.attachments || [],
            action: msg.action
          }));

        debug.filteredMessages = finalMessages.length;
        debug.steps.push(`Filtered to ${finalMessages.length} ${channel} messages`);
      } catch (apiErr) {
        debug.errors.push('Lead messages API error: ' + apiErr.message);
        debug.steps.push('API failed, trying booking history fallback...');
      }

      // Fallback: booking history if API returned nothing
      if (finalMessages.length === 0) {
        try {
          debug.steps.push('Trying booking history fallback...');
          const leadResponse = await axios.get(`/api/leads/${lead.id}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });

          const leadData = leadResponse.data?.lead || leadResponse.data;
          let bookingHistory = leadData?.bookingHistory || leadData?.booking_history || [];

          if (typeof bookingHistory === 'string') {
            try { bookingHistory = JSON.parse(bookingHistory); } catch { bookingHistory = []; }
          }
          if (!Array.isArray(bookingHistory)) bookingHistory = [];

          const historyMessages = bookingHistory
            .filter(h => ['SMS_SENT', 'SMS_RECEIVED', 'EMAIL_SENT', 'EMAIL_RECEIVED'].includes(h.action))
            .map((h, idx) => ({
              id: `${h.action}_${h.timestamp}_${idx}`,
              leadId: lead.id,
              type: h.action?.startsWith('EMAIL') ? 'email' : 'sms',
              direction: h.action?.includes('SENT') ? 'sent' : 'received',
              content: h.details?.body || h.details?.message || '',
              subject: h.details?.subject,
              email_body: h.details?.email_body || h.details?.html_content,
              timestamp: h.timestamp || h.created_at,
              attachments: h.details?.attachments || [],
              action: h.action
            }))
            .filter(h => channel === 'email' ? h.type === 'email' : h.type === 'sms');
          
          if (historyMessages.length > 0) {
            finalMessages = historyMessages;
            debug.steps.push(`Found ${historyMessages.length} messages in booking history`);
          }
        } catch (leadErr) {
          debug.errors.push('Booking history fallback error: ' + leadErr.message);
        }
      }
      
      // Normalize message format for display
      const normalized = finalMessages.map(msg => ({
        ...msg,
        direction: msg.direction || 
                   (msg.isOutgoing || msg.outgoing || msg.sent || 
                    msg.action?.includes('SENT') ? 'sent' : 'received'),
        content: msg.content || msg.body || msg.message || msg.text || msg.details?.body || '',
        timestamp: msg.timestamp || msg.created_at || msg.createdAt || msg.date,
        email_body: msg.email_body || msg.htmlContent || msg.html || null,
        subject: msg.subject || msg.details?.subject
      }));
      
      // Sort by timestamp (oldest first for conversation view)
      normalized.sort((a, b) => {
        const dateA = new Date(a.timestamp || 0);
        const dateB = new Date(b.timestamp || 0);
        return dateA - dateB;
      });
      
      debug.steps.push(`Final message count: ${normalized.length}`);
      console.log(`✅ Final: ${normalized.length} messages to display`);
      setMessages(normalized);
      
    } catch (error) {
      debug.errors.push('Fatal error: ' + error.message);
      console.error('❌ Error fetching messages:', error);
      setMessages([]);
    } finally {
      setDebugInfo(debug);
      setLoading(false);
      
      // Log all debug info
      console.log('📨 Message Fetch Debug:', debug);
    }
  }, [lead?.id, channel]);

  // Fetch messages when modal opens or channel changes
  useEffect(() => {
    if (isOpen) {
      console.log('📱 Modal opened, fetching messages...');
      fetchMessages();
    }
  }, [isOpen, channel, fetchMessages]);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket || !isOpen || !lead?.id) return;
    
    const handleMessageReceived = (data) => {
      console.log('📨 Real-time message received:', data);
      if (data?.leadId === lead.id || data?.lead_id === lead.id) {
        fetchMessages();
      }
    };

    socket.on('message_received', handleMessageReceived);
    socket.on('sms_received', handleMessageReceived);
    socket.on('email_received', handleMessageReceived);
    
    return () => {
      socket.off('message_received', handleMessageReceived);
      socket.off('sms_received', handleMessageReceived);
      socket.off('email_received', handleMessageReceived);
    };
  }, [socket, isOpen, lead?.id, fetchMessages]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0 && !loading) {
      setTimeout(() => {
        const scrollContainer = document.getElementById('msg-scroll-container');
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      }, 100);
    }
  }, [messages, loading]);

  const handleSendReply = async () => {
    if (!replyText.trim() || sending) return;

    setSending(true);
    setSendSuccess(false);
    try {
      if (channel === 'email') {
        const lastEmail = messages.find(m => m.direction === 'received' || m.direction === 'sent');
        const lastSubject = lastEmail?.subject || '';
        const subject = lastSubject && !lastSubject.startsWith('Re:') 
          ? `Re: ${lastSubject}` 
          : (lastSubject || 'Re: Your email');

        console.log('📧 Sending email to:', lead.email);
        const response = await axios.post(`/api/leads/${lead.id}/send-email`, {
          subject,
          body: replyText.trim()
        });

        if (response.data.success) {
          setReplyText('');
          setSendSuccess(true);
          setTimeout(() => setSendSuccess(false), 3000);
          fetchMessages();
        } else {
          alert('Failed to send email: ' + (response.data.message || 'Unknown error'));
        }
      } else {
        console.log('📱 Sending SMS to:', lead.phone);
        const response = await axios.post(`/api/leads/${lead.id}/send-sms`, {
          message: replyText.trim(),
          type: 'custom'
        });

        if (response.data.success) {
          setReplyText('');
          setSendSuccess(true);
          setTimeout(() => setSendSuccess(false), 3000);
          fetchMessages();
        } else {
          alert('Failed to send SMS: ' + (response.data.message || 'Unknown error'));
        }
      }
    } catch (error) {
      console.error('❌ Error sending reply:', error);
      alert('Error sending message: ' + (error.response?.data?.message || error.message));
    } finally {
      setSending(false);
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      
      const now = new Date();
      const diffMs = now - date;
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      
      if (diffHours < 1) {
        const minutes = Math.floor(diffMs / (1000 * 60));
        return minutes <= 0 ? 'Just now' : `${minutes}m ago`;
      } else if (diffDays < 1) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      } else if (diffDays < 7) {
        return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    } catch {
      return '';
    }
  };
  
  // Format date for date separators
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return '';
      
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const isYesterday = new Date(now - 86400000).toDateString() === date.toDateString();
      
      if (isToday) return 'Today';
      if (isYesterday) return 'Yesterday';
      
      return date.toLocaleDateString([], { 
        weekday: 'long', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return '';
    }
  };

  if (!isOpen || !lead) return null;

  const hasEmail = !!lead.email;
  const hasPhone = !!lead.phone;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${
          channel === 'email' ? 'bg-gradient-to-r from-indigo-500 to-purple-600' : 'bg-gradient-to-r from-blue-500 to-cyan-500'
        }`}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              {channel === 'email' ? (
                <FiMail className="w-5 h-5 text-white" />
              ) : (
                <FiMessageSquare className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg leading-tight">
                {channel === 'email' ? 'Email' : 'SMS'} with {lead.name}
              </h3>
              <p className="text-white/70 text-xs">
                {channel === 'email' ? lead.email : lead.phone}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Channel Toggle (if both available) */}
            {hasEmail && hasPhone && (
              <div className="flex bg-white/20 rounded-lg p-0.5 mr-2">
                <button
                  onClick={() => setChannel('sms')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    channel === 'sms' 
                      ? 'bg-white text-blue-600 shadow-sm' 
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  SMS
                </button>
                <button
                  onClick={() => setChannel('email')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    channel === 'email' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  Email
                </button>
              </div>
            )}
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <FiX className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Messages Thread */}
        <div 
          id="msg-scroll-container"
          className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50"
        >
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              {channel === 'email' ? (
                <FiMail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              ) : (
                <FiMessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              )}
              <p className="text-sm text-gray-500">No {channel} messages found</p>
              
              {/* Debug info panel */}
              {debugInfo.steps && (
                <div className="mt-4 mx-4 p-3 bg-gray-100 rounded-lg text-left">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Debug Info:</p>
                  <ul className="text-[10px] text-gray-500 space-y-1 max-h-32 overflow-y-auto">
                    {debugInfo.steps.map((step, i) => (
                      <li key={i} className="truncate">{step}</li>
                    ))}
                  </ul>
                  {debugInfo.errors?.length > 0 && (
                    <div className="mt-2 text-[10px] text-red-500">
                      {debugInfo.errors.map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              <p className="text-xs text-gray-400 mt-3">
                {channel === 'email' && !hasEmail ? 'No email address for this lead' : 
                 channel === 'sms' && !hasPhone ? 'No phone number for this lead' : 
                 'Start the conversation below'}
              </p>
            </div>
          ) : (
            messages.map((message, idx) => {
              const isSent = message.direction === 'sent';
              const timestamp = message.timestamp;
              const prevMsg = messages[idx - 1];
              const prevTimestamp = prevMsg?.timestamp;
              const showDate = idx === 0 || 
                (timestamp && prevTimestamp && 
                  new Date(timestamp).toDateString() !== new Date(prevTimestamp).toDateString());

              return (
                <React.Fragment key={message.id || idx}>
                  {/* Date separator */}
                  {showDate && (
                    <div className="flex items-center justify-center my-4">
                      <div className="bg-gray-200 px-3 py-1 rounded-full text-xs text-gray-500">
                        {formatDate(timestamp)}
                      </div>
                    </div>
                  )}
                  
                  {/* Message bubble */}
                  <div className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl shadow-sm overflow-hidden ${
                      isSent 
                        ? channel === 'email' 
                          ? 'bg-indigo-500 text-white rounded-br-md' 
                          : 'bg-blue-500 text-white rounded-br-md'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md'
                    }`}>
                      {/* Header - sender info */}
                      <div className={`px-4 py-2 text-xs font-medium flex items-center space-x-2 ${
                        isSent 
                          ? 'bg-black/10 text-white/80' 
                          : 'bg-gray-100 text-gray-600 border-b border-gray-200'
                      }`}>
                        <FiUser className="w-3 h-3" />
                        <span>{isSent ? 'You' : lead.name}</span>
                        {message.subject && (
                          <>
                            <span className="opacity-50">•</span>
                            <span className="truncate max-w-[150px]">{message.subject}</span>
                          </>
                        )}
                      </div>
                      
                      {/* Body */}
                      <div className="px-4 py-3">
                        {channel === 'email' && (message.email_body || message.htmlContent) ? (
                          <div className={`max-h-64 overflow-y-auto bg-white rounded ${isSent ? '' : ''}`}>
                            <GmailEmailRenderer
                              htmlContent={message.email_body || message.htmlContent || message.content}
                              textContent={message.content}
                              attachments={message.attachments || []}
                              embeddedImages={message.embedded_images || []}
                            />
                          </div>
                        ) : (
                          <p className={`text-sm whitespace-pre-wrap leading-relaxed ${
                            isSent ? 'text-white' : 'text-gray-800'
                          }`}>
                            {decodeEmailContent(message.content || 'No content')}
                          </p>
                        )}
                        
                        {/* Attachments indicator */}
                        {message.attachments?.length > 0 && (
                          <div className={`mt-2 flex items-center space-x-1 text-xs ${
                            isSent ? 'text-white/70' : 'text-gray-500'
                          }`}>
                            <FiPaperclip className="w-3 h-3" />
                            <span>{message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Footer - time */}
                      <div className={`px-4 py-1.5 flex items-center justify-end space-x-2 ${
                        isSent 
                          ? 'bg-black/10 text-white/60' 
                          : 'bg-gray-50 text-gray-400 border-t border-gray-100'
                      }`}>
                        <FiClock className="w-3 h-3" />
                        <span className="text-xs">{formatTime(timestamp)}</span>
                        {isSent && (
                          <FiCheck className="w-3 h-3" />
                        )}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Reply Input */}
        <div className="border-t border-gray-200 bg-white p-4">
          {(() => {
            const canSend = channel === 'email' ? hasEmail : hasPhone;
            
            if (!canSend) {
              return (
                <div className="text-center py-3 text-amber-600 bg-amber-50 rounded-lg">
                  <FiAlertCircle className="w-4 h-4 inline mr-1" />
                  <span className="text-sm">
                    Cannot send {channel} - no {channel === 'email' ? 'email address' : 'phone number'} for this lead
                  </span>
                </div>
              );
            }
            
            return (
              <>
                <div className="flex items-end space-x-3">
                  <div className="flex-1 relative">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Type your ${channel}...`}
                      rows={replyText.includes('\n') ? 3 : 1}
                      className="w-full px-4 py-3 pr-12 bg-gray-100 border-0 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                    />
                    {replyText.length > 0 && (
                      <div className="absolute right-3 bottom-3 text-xs text-gray-400">
                        {replyText.length}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sending}
                    className={`p-3 rounded-xl transition-all ${
                      replyText.trim() && !sending
                        ? channel === 'email'
                          ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                          : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {sending ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                    ) : (
                      <FiSend className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-gray-400">Press Enter to send, Shift+Enter for new line</span>
                  {sendSuccess ? (
                    <span className="text-green-600 font-medium flex items-center">
                      <FiCheck className="w-3 h-3 mr-1" /> Sent!
                    </span>
                  ) : (
                    <span className="text-gray-400">Replying to {channel === 'email' ? lead.email : lead.phone}</span>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default CalendarMessageModal;
