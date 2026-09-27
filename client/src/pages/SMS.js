import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FiMessageSquare,
  FiSearch,
  FiRefreshCw,
  FiSend,
  FiChevronLeft,
  FiUser,
  FiPhone
} from 'react-icons/fi';

const SMS = () => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const response = await axios.get('/api/messages-list', {
        params: { limit: 2000, since, type: 'sms' }
      });
      const fetched = (response.data.messages || []).filter(m => m.type === 'sms');
      setMessages(fetched);
    } catch (error) {
      console.error('Error fetching SMS messages:', error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    // Background refresh as a fallback — new SMS arrive live via socket
    const interval = setInterval(fetchMessages, 300000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingSms = (data) => {
      if (!data || (data.channel !== 'sms' && data.type !== 'sms' && data.type !== 'SMS_RECEIVED')) return;
      if (!data.leadId) return;
      const newMsg = {
        id: data.messageId || `sms_${Date.now()}`,
        messageId: data.messageId,
        leadId: data.leadId,
        leadName: data.leadName || 'Unknown',
        leadPhone: data.leadPhone || data.phone || '',
        leadEmail: data.leadEmail || '',
        leadStatus: data.leadStatus || null,
        content: data.content || data.body || '',
        type: 'sms',
        direction: 'received',
        timestamp: data.timestamp || new Date().toISOString(),
        isRead: false
      };
      setMessages(prev => {
        const exists = prev.some(m => m.id === newMsg.id);
        return exists ? prev : [newMsg, ...prev];
      });
    };

    const handleMessageRead = (data) => {
      setMessages(prev => prev.map(m =>
        m.id === data.messageId || m.messageId === data.messageId
          ? { ...m, isRead: true } : m
      ));
    };

    socket.on('message_received', handleIncomingSms);
    socket.on('sms_received', handleIncomingSms);
    socket.on('message_read', handleMessageRead);

    return () => {
      socket.off('message_received', handleIncomingSms);
      socket.off('sms_received', handleIncomingSms);
      socket.off('message_read', handleMessageRead);
    };
  }, [socket]);

  // Group messages into one conversation per lead
  const threads = useMemo(() => {
    const map = new Map();
    messages.forEach(m => {
      if (!m.leadId) return;
      if (!map.has(m.leadId)) {
        map.set(m.leadId, {
          leadId: m.leadId,
          leadName: m.leadName || 'Unknown',
          leadPhone: m.leadPhone || '',
          leadStatus: m.leadStatus || null,
          messages: []
        });
      }
      const t = map.get(m.leadId);
      t.messages.push(m);
      // Prefer non-empty lead info from any message in the thread
      if (!t.leadPhone && m.leadPhone) t.leadPhone = m.leadPhone;
      if (!t.leadStatus && m.leadStatus) t.leadStatus = m.leadStatus;
      if ((t.leadName === 'Unknown' || !t.leadName) && m.leadName) t.leadName = m.leadName;
    });
    const list = Array.from(map.values());
    list.forEach(t => {
      t.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      t.lastMessage = t.messages[t.messages.length - 1];
      t.unreadCount = t.messages.filter(m => m.direction === 'received' && !m.isRead).length;
    });
    list.sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
    return list;
  }, [messages]);

  const filteredThreads = useMemo(() => {
    if (!searchTerm) return threads;
    const term = searchTerm.toLowerCase();
    return threads.filter(t =>
      (t.leadName || '').toLowerCase().includes(term) ||
      (t.leadPhone || '').toLowerCase().includes(term) ||
      t.messages.some(m => (m.content || '').toLowerCase().includes(term))
    );
  }, [threads, searchTerm]);

  const selectedThread = useMemo(
    () => threads.find(t => t.leadId === selectedLeadId) || null,
    [threads, selectedLeadId]
  );

  const totalUnread = useMemo(
    () => threads.reduce((sum, t) => sum + t.unreadCount, 0),
    [threads]
  );

  // Scroll chat to the latest message
  useEffect(() => {
    if (selectedThread && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [selectedLeadId, selectedThread?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const markThreadAsRead = useCallback((thread) => {
    const unread = thread.messages.filter(m => m.direction === 'received' && !m.isRead);
    if (unread.length === 0) return;
    setMessages(prev => prev.map(m =>
      m.leadId === thread.leadId && m.direction === 'received' ? { ...m, isRead: true } : m
    ));
    unread.forEach(m => {
      axios.put(`/api/messages-list/${m.messageId || m.id}/read`).catch(e =>
        console.error('Error marking SMS as read:', e)
      );
    });
  }, []);

  const handleOpenThread = (thread) => {
    setSelectedLeadId(thread.leadId);
    setReplyText('');
    markThreadAsRead(thread);
  };

  // Mark newly arrived messages read while their conversation is open
  useEffect(() => {
    if (selectedThread && selectedThread.unreadCount > 0) {
      markThreadAsRead(selectedThread);
    }
  }, [selectedThread, markThreadAsRead]);

  const handleSend = async () => {
    if (!replyText.trim() || !selectedThread || sending) return;
    const text = replyText.trim();
    setSending(true);
    try {
      const anchor = selectedThread.lastMessage;
      await axios.post('/api/messages-list/reply', {
        messageId: anchor.messageId || anchor.id,
        reply: text,
        replyType: 'sms'
      });
      // Optimistically append the sent bubble; the next fetch reconciles ids
      setMessages(prev => [{
        id: `local_${Date.now()}`,
        leadId: selectedThread.leadId,
        leadName: selectedThread.leadName,
        leadPhone: selectedThread.leadPhone,
        leadStatus: selectedThread.leadStatus,
        content: text,
        type: 'sms',
        direction: 'sent',
        performedByName: user?.name,
        timestamp: new Date().toISOString(),
        isRead: true
      }, ...prev]);
      setReplyText('');
      setTimeout(fetchMessages, 1500);
    } catch (e) {
      console.error('Error sending SMS:', e);
      alert(e.response?.data?.message || 'Failed to send SMS');
    } finally {
      setSending(false);
    }
  };

  const formatListDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    if (now.getFullYear() === date.getFullYear()) return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDayLabel = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getAvatarColor = (name) => {
    const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-600', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  // Insert day separators between messages from different days
  const chatItems = useMemo(() => {
    if (!selectedThread) return [];
    const items = [];
    let lastDay = null;
    selectedThread.messages.forEach(m => {
      const day = new Date(m.timestamp).toDateString();
      if (day !== lastDay) {
        items.push({ kind: 'day', key: `day_${day}`, label: formatDayLabel(m.timestamp) });
        lastDay = day;
      }
      items.push({ kind: 'msg', key: m.id, message: m });
    });
    return items;
  }, [selectedThread]);

  const segments = Math.max(1, Math.ceil(replyText.length / 160));

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f6f8fc]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b57d0]"></div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#f6f8fc] overflow-hidden">
      {/* Conversation list */}
      <div className={`w-full md:w-96 flex-shrink-0 flex-col md:flex ${selectedThread ? 'hidden' : 'flex'}`}>
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <h2 className="text-xl text-gray-800 flex items-center gap-3">
            <FiMessageSquare className="text-[#0b57d0] h-6 w-6" /> SMS
            {totalUnread > 0 && (
              <span className="text-xs font-bold text-white bg-[#0b57d0] rounded-full px-2 py-0.5">{totalUnread}</span>
            )}
          </h2>
          <button
            onClick={fetchMessages}
            disabled={loading}
            className="p-2.5 hover:bg-gray-200/70 rounded-full transition-colors"
            title="Refresh"
          >
            <FiRefreshCw className={`h-4 w-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <FiSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search conversations"
              className="w-full pl-11 pr-4 py-2.5 bg-[#eaf1fb] border-0 rounded-full text-sm focus:outline-none focus:bg-white focus:shadow-md transition-shadow"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto md:mx-3 md:mb-3 bg-white md:rounded-2xl md:shadow-sm">
          {filteredThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <FiMessageSquare className="h-16 w-16 mb-4" />
              <p className="text-lg font-medium text-gray-500">
                {searchTerm ? 'No conversations match your search' : 'No SMS conversations yet'}
              </p>
            </div>
          ) : (
            filteredThreads.map(thread => (
              <div
                key={thread.leadId}
                onClick={() => handleOpenThread(thread)}
                className={`flex items-center px-4 py-3 cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                  selectedLeadId === thread.leadId ? 'bg-[#e8f0fe]' : ''
                }`}
              >
                <div className={`w-11 h-11 rounded-full ${getAvatarColor(thread.leadName)} flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0`}>
                  {getInitials(thread.leadName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${thread.unreadCount > 0 ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>
                      {thread.leadName}
                    </span>
                    <span className={`text-xs flex-shrink-0 ${thread.unreadCount > 0 ? 'text-[#0b57d0] font-semibold' : 'text-gray-500'}`}>
                      {formatListDate(thread.lastMessage.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className={`truncate text-xs ${thread.unreadCount > 0 ? 'text-gray-800' : 'text-gray-500'}`}>
                      {thread.lastMessage.direction === 'sent' && 'You: '}
                      {(thread.lastMessage.content || '').slice(0, 80)}
                    </span>
                    {thread.unreadCount > 0 && (
                      <span className="flex-shrink-0 text-[10px] font-bold text-white bg-[#0b57d0] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {thread.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat view */}
      <div className={`flex-1 flex-col min-w-0 md:pr-4 md:pb-4 md:pt-4 ${selectedThread ? 'flex' : 'hidden md:flex'}`}>
        {!selectedThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-white md:rounded-2xl md:shadow-sm">
            <FiMessageSquare className="h-16 w-16 mb-4" />
            <p className="text-lg font-medium text-gray-500">Select a conversation</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 bg-white md:rounded-2xl md:shadow-sm overflow-hidden">
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
              <button onClick={() => setSelectedLeadId(null)} className="md:hidden p-2 hover:bg-gray-100 rounded-full">
                <FiChevronLeft className="h-5 w-5 text-gray-600" />
              </button>
              <div className={`w-10 h-10 rounded-full ${getAvatarColor(selectedThread.leadName)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                {getInitials(selectedThread.leadName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{selectedThread.leadName}</div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                  <FiPhone className="h-3 w-3" />
                  {selectedThread.leadPhone || 'No phone'}
                </div>
              </div>
              {selectedThread.leadStatus && (
                <span className={`hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  selectedThread.leadStatus === 'Cancelled' ? 'bg-red-100 text-red-700' :
                  ['Booked', 'Confirmed', 'Unconfirmed'].includes(selectedThread.leadStatus) ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {selectedThread.leadStatus}
                </span>
              )}
              <button
                onClick={() => navigate(`/leads/${selectedThread.leadId}`)}
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-full text-xs text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
                title="Open lead"
              >
                <FiUser className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View lead</span>
              </button>
            </div>

            {/* Message bubbles */}
            <div className="flex-1 overflow-y-auto px-4 py-4 bg-[#f6f8fc]">
              {chatItems.map(item => (
                item.kind === 'day' ? (
                  <div key={item.key} className="flex justify-center my-3">
                    <span className="text-[11px] text-gray-500 bg-white rounded-full px-3 py-1 shadow-sm">{item.label}</span>
                  </div>
                ) : (
                  <div key={item.key} className={`flex mb-1.5 ${item.message.direction === 'sent' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] sm:max-w-[65%] px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm ${
                      item.message.direction === 'sent'
                        ? 'bg-[#0b57d0] text-white rounded-2xl rounded-br-md'
                        : 'bg-white text-gray-800 rounded-2xl rounded-bl-md'
                    }`}>
                      {item.message.content}
                      <div className={`text-[10px] mt-1 text-right ${item.message.direction === 'sent' ? 'text-blue-100' : 'text-gray-400'}`}>
                        {item.message.direction === 'sent' && item.message.performedByName && (
                          <span className="mr-1">{item.message.performedByName} ·</span>
                        )}
                        {new Date(item.message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Composer */}
            <div className="px-3 py-3 border-t border-gray-100 flex items-end gap-2 flex-shrink-0 bg-white">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={selectedThread.leadPhone ? 'Text message' : 'Lead has no phone number'}
                disabled={!selectedThread.leadPhone}
                rows={Math.min(4, Math.max(1, replyText.split('\n').length))}
                className="flex-1 px-4 py-2.5 bg-[#eaf1fb] border-0 rounded-2xl text-sm resize-none focus:outline-none focus:bg-white focus:shadow-md transition-shadow disabled:opacity-60"
              />
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                {replyText.length > 0 && (
                  <span className="text-[10px] text-gray-400">{replyText.length}/{segments * 160}</span>
                )}
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim() || sending || !selectedThread.leadPhone}
                  className="p-3 bg-[#0b57d0] text-white rounded-full hover:bg-[#0842a0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Send SMS"
                >
                  <FiSend className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SMS;
