import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FiCalendar, FiLink, FiCopy, FiCheck } from 'react-icons/fi';
import axios from 'axios';

const ConversationViewer = ({ lead, conversation, onRefresh, onCalendarLinkSent }) => {
  const messagesEndRef = useRef(null);
  const [showCalendarLinkModal, setShowCalendarLinkModal] = useState(false);
  const [calendarLink, setCalendarLink] = useState('');
  const [customLink, setCustomLink] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation]);

  // Generate CRM booking link for public booking page
  const generateCalendarLink = () => {
    if (!lead) return '';
    
    // Generate a booking link to the public booking page
    // This allows clients to book appointments without logging in
    const baseUrl = window.location.origin;
    const bookingLink = `${baseUrl}/book/${lead.id}`;
    return bookingLink;
  };

  const handleSendCalendarLink = async () => {
    if (!lead || !lead.salesape_record_id) {
      alert('This lead has not been sent to SalesApe yet');
      return;
    }

    const linkToSend = customLink.trim() || calendarLink;
    if (!linkToSend) {
      alert('Please enter or generate a calendar link');
      return;
    }

    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `/api/salesape-webhook/send-calendar-link/${lead.id}`,
        { calendarLink: linkToSend, eventType: 'Meeting Booked' },
        { headers: { 'x-auth-token': token } }
      );

      if (response.data.success) {
        alert('✅ Calendar link sent to SalesApe successfully!');
        setShowCalendarLinkModal(false);
        setCustomLink('');
        if (onCalendarLinkSent) {
          onCalendarLinkSent();
        }
        if (onRefresh) {
          onRefresh();
        }
      }
    } catch (error) {
      console.error('Error sending calendar link:', error);
      alert(`Failed to send calendar link: ${error.response?.data?.message || error.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = (link) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!lead) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-4xl mb-4">💬</p>
          <p className="text-gray-500">Select a lead from the queue</p>
          <p className="text-sm text-gray-400 mt-2">
            to view their conversation with SalesApe
          </p>
        </div>
      </div>
    );
  }

  const messages = conversation?.messages || [];
  const stats = conversation?.stats || {};
  const defaultCalendarLink = generateCalendarLink();

  const exportTranscript = () => {
    const transcript = messages.map(msg => 
      `[${new Date(msg.sent_at).toLocaleString()}] ${msg.sender === 'salesape' ? '🤖 SalesApe' : '👤 ' + lead.name}: ${msg.message}`
    ).join('\n\n');
    
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${lead.name}-${Date.now()}.txt`;
    a.click();
  };

  const getStatusBadge = () => {
    if (lead.salesape_goal_hit) {
      return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">✅ Booked</span>;
    }
    if (lead.salesape_goal_presented) {
      return <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">🎯 Goal Presented</span>;
    }
    if (lead.salesape_user_engaged) {
      return <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">💬 Engaged</span>;
    }
    if (lead.salesape_initial_message_sent) {
      return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">📤 Message Sent</span>;
    }
    return <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">⏳ Queued</span>;
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-md h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                💬 Conversation: {lead.name}
              </h2>
              <p className="text-sm text-gray-600">{lead.phone || lead.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setCalendarLink(defaultCalendarLink);
                  setShowCalendarLinkModal(true);
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                title="Send Calendar Link"
              >
                <FiCalendar className="w-4 h-4" />
                Send Calendar Link
              </button>
              <button
                onClick={onRefresh}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Refresh"
              >
                🔄
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {getStatusBadge()}
            {lead.salesape_portal_link && (
              <a
                href={lead.salesape_portal_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                🔗 View in SalesApe Portal →
              </a>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-4">🤖</p>
              <p className="text-gray-500">No messages yet</p>
              <p className="text-sm text-gray-400 mt-2">
                Conversation will appear here once SalesApe engages
              </p>
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`flex ${message.sender === 'salesape' ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[70%] ${message.sender === 'salesape' ? 'order-1' : 'order-2'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-700">
                        {message.sender === 'salesape' ? '🤖 SalesApe' : '👤 ' + lead.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(message.sent_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className={`rounded-lg p-3 ${
                      message.sender === 'salesape' 
                        ? 'bg-blue-100 text-blue-900' 
                        : 'bg-green-100 text-green-900'
                    }`}>
                      <p className="whitespace-pre-wrap">{message.message}</p>
                      {/* Show calendar link if present in message */}
                      {message.calendarLink && (
                        <div className="mt-2 pt-2 border-t border-blue-300">
                          <a
                            href={message.calendarLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 hover:text-blue-900 flex items-center gap-2 text-sm"
                          >
                            <FiCalendar className="w-4 h-4" />
                            Calendar Link
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Conversation Stats */}
        <div className="p-4 border-t bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <p className="text-xs text-gray-600">Messages</p>
              <p className="text-lg font-semibold text-gray-900">{stats.messageCount || messages.length}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Duration</p>
              <p className="text-lg font-semibold text-gray-900">{stats.duration || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Engagement</p>
              <p className="text-lg font-semibold text-gray-900">
                {lead.salesape_user_engaged ? 'High' : 'Low'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Goal Status</p>
              <p className="text-lg font-semibold text-gray-900">
                {lead.salesape_goal_hit ? '✅ Hit' : '⏳ Pending'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {lead.salesape_conversation_summary && (
              <button
                onClick={() => alert(lead.salesape_conversation_summary)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium transition-colors text-sm"
              >
                📝 View Summary
              </button>
            )}
            {messages.length > 0 && (
              <button
                onClick={exportTranscript}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium transition-colors text-sm"
              >
                📥 Export Transcript
              </button>
            )}
            {lead.salesape_portal_link && (
              <a
                href={lead.salesape_portal_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors text-sm text-center"
              >
                🔗 SalesApe Portal
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Calendar Link Modal */}
      {showCalendarLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FiCalendar className="w-5 h-5" />
              Send Calendar Link to SalesApe
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Generated Link (Default)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={calendarLink}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    onClick={() => handleCopyLink(calendarLink)}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Copy link"
                  >
                    {copied ? <FiCheck className="w-4 h-4 text-green-600" /> : <FiCopy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or Enter Custom Link
                </label>
                <input
                  type="text"
                  value={customLink}
                  onChange={(e) => setCustomLink(e.target.value)}
                  placeholder="https://example.com/book"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowCalendarLinkModal(false);
                    setCustomLink('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendCalendarLink}
                  disabled={sending}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <FiLink className="w-4 h-4" />
                      Send to SalesApe
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
};

export default ConversationViewer;
