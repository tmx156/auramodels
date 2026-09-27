import React, { useState } from 'react';
import { 
  FiChevronDown, 
  FiChevronUp, 
  FiMail, 
  FiMessageSquare,
  FiClock,
  FiUser,
  FiPaperclip,
  FiCheck,
  FiSend,
  FiInbox
} from 'react-icons/fi';
import { decodeEmailContent, getEmailContentPreview } from '../utils/emailContentDecoder';
import GmailEmailRenderer from './GmailEmailRenderer';

const EmailThread = ({ thread, onThreadClick, isSelected = false, userRole = 'user', onMarkThreadAsRead }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Sort messages by timestamp (oldest first for conversation view)
  const sortedMessages = [...thread.messages].sort((a, b) => {
    const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
    const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
    return timeA - timeB;
  });

  const latestMessage = thread.lastMessage || sortedMessages[sortedMessages.length - 1];
  const hasUnread = thread.unreadCount > 0;
  const isEmail = thread.type === 'email' || thread.hasEmail;
  const isSMS = thread.type === 'sms' || thread.hasSMS;

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'Just now';
      
      const now = new Date();
      const diff = now - date;
      const hours = diff / (1000 * 60 * 60);
      const days = diff / (1000 * 60 * 60 * 24);
      
      if (hours < 1) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 0 ? 'Just now' : `${minutes}m ago`;
      } else if (hours < 24) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (days < 7) {
        return `${Math.floor(days)}d ago`;
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    } catch {
      return 'Just now';
    }
  };

  const getPreview = (message) => {
    if (isEmail && message.subject) {
      return message.subject;
    }
    return getEmailContentPreview(message.content || message.details?.body || '', 80);
  };

  return (
    <div 
      className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
        hasUnread ? 'bg-blue-50' : 'bg-white'
      } ${isSelected ? 'bg-blue-100' : ''}`}
    >
      {/* Thread Header - Clickable */}
      <div 
        className="px-4 py-3 cursor-pointer"
        onClick={async () => {
          const wasExpanded = isExpanded;
          setIsExpanded(!isExpanded);
          
          // When expanding, mark all unread messages in thread as read
          if (!wasExpanded && thread.unreadCount > 0 && onMarkThreadAsRead) {
            // Mark all unread messages in the thread as read
            await onMarkThreadAsRead(thread);
          }
          
          if (!wasExpanded && onThreadClick) {
            onThreadClick(thread);
          }
        }}
      >
        <div className="flex items-start space-x-3">
          {/* Checkbox (Admin only) */}
          {userRole === 'admin' && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                if (onThreadClick) onThreadClick(thread);
              }}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          )}

          {/* Icon */}
          <div className="flex-shrink-0 mt-1">
            {isEmail ? (
              <FiMail className={`h-5 w-5 ${hasUnread ? 'text-blue-600' : 'text-gray-400'}`} />
            ) : (
              <FiMessageSquare className={`h-5 w-5 ${hasUnread ? 'text-green-600' : 'text-gray-400'}`} />
            )}
          </div>

          {/* Thread Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                {/* Sender/Recipient Name */}
                <p className={`text-sm font-medium truncate ${
                  hasUnread ? 'text-gray-900 font-semibold' : 'text-gray-700'
                }`}>
                  {thread.leadName || 'Unknown'}
                </p>
                
                {/* Thread Subject (for emails) */}
                {isEmail && latestMessage?.subject && (
                  <span className="text-sm text-gray-600 truncate flex-1">
                    {latestMessage.subject}
                  </span>
                )}

                {/* Unread Badge */}
                {hasUnread && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-600 text-white">
                    {thread.unreadCount}
                  </span>
                )}

                {/* Message Count Badge */}
                {thread.messageCount > 1 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
                    {thread.messageCount}
                  </span>
                )}
              </div>

              {/* Timestamp */}
              <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                <span className="text-xs text-gray-500">
                  {formatTime(latestMessage?.timestamp || latestMessage?.created_at)}
                </span>
                {isExpanded ? (
                  <FiChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <FiChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="mt-1 flex items-center space-x-2">
              <p className="text-sm text-gray-600 truncate flex-1">
                {getPreview(latestMessage)}
              </p>
              
              {/* Attachment indicator */}
              {latestMessage?.attachments && Array.isArray(latestMessage.attachments) && latestMessage.attachments.length > 0 && (
                <div className="flex items-center space-x-1 text-gray-400 flex-shrink-0">
                  <FiPaperclip className="h-3 w-3" />
                  <span className="text-xs">{latestMessage.attachments.length}</span>
                </div>
              )}
            </div>

            {/* Thread Metadata */}
            <div className="mt-1 flex items-center space-x-3 text-xs text-gray-500">
              <span>{thread.leadPhone || thread.leadEmail || ''}</span>
              {isEmail && isSMS && (
                <span className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">
                  Mixed
                </span>
              )}
              {latestMessage?.direction === 'sent' && (
                <span className="flex items-center space-x-1">
                  <FiSend className="h-3 w-3" />
                  <span>Sent</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Thread View - Gmail Style */}
      {isExpanded && (
        <div className="px-4 pb-3 bg-gray-50 border-t border-gray-200">
          <div className="mt-3 space-y-2">
            {sortedMessages.map((message, index) => {
              const isSent = message.direction === 'sent';
              const messageTime = new Date(message.timestamp || message.created_at);
              
              return (
                <div
                  key={message.id || `${message.timestamp}-${index}`}
                  className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] rounded-lg shadow-sm ${
                    isSent 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white border border-gray-200 text-gray-900'
                  }`}>
                    {/* Message Header */}
                    <div className={`px-4 py-2 border-b ${
                      isSent ? 'border-blue-500' : 'border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-medium ${
                            isSent ? 'text-blue-100' : 'text-gray-900'
                          }`}>
                            {isSent ? 'You' : (thread.leadName || 'Unknown')}
                          </span>
                          {isEmail && message.subject && (
                            <span className={`text-xs ${
                              isSent ? 'text-blue-200' : 'text-gray-600'
                            }`}>
                              {message.subject}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs ${
                            isSent ? 'text-blue-200' : 'text-gray-500'
                          }`}>
                            {formatTime(message.timestamp || message.created_at)}
                          </span>
                          {isSent && (
                            <FiCheck className={`h-3 w-3 ${
                              message.delivery_status === 'delivered' 
                                ? 'text-blue-200' 
                                : 'text-blue-300'
                            }`} />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Message Body */}
                    <div className="px-4 py-3">
                      {(thread.type === 'email' || message.type === 'email') && (message.email_body || message.details?.email_body || message.html_content) ? (
                        <div className={isSent ? 'email-sent' : 'email-received'}>
                          <GmailEmailRenderer
                            htmlContent={message.email_body || message.details?.email_body || message.html_content}
                            textContent={message.content || message.details?.body || message.details?.message}
                            attachments={message.attachments || message.details?.attachments || []}
                            embeddedImages={message.embedded_images || message.details?.embedded_images || []}
                          />
                        </div>
                      ) : (
                        <p className={`text-sm whitespace-pre-wrap break-words ${
                          isSent ? 'text-white' : 'text-gray-900'
                        }`}>
                          {decodeEmailContent(message.content || message.details?.body || message.details?.message || 'No content')}
                        </p>
                      )}

                      {/* Attachments */}
                      {message.attachments && Array.isArray(message.attachments) && message.attachments.length > 0 && (
                        <div className={`mt-3 pt-3 border-t ${
                          isSent ? 'border-blue-500' : 'border-gray-200'
                        }`}>
                          <div className="flex flex-wrap gap-2">
                            {message.attachments.map((attachment, idx) => (
                              <div
                                key={idx}
                                className={`flex items-center space-x-2 px-2 py-1 rounded ${
                                  isSent 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                <FiPaperclip className="h-3 w-3" />
                                <span className="text-xs truncate max-w-[150px]">
                                  {attachment.filename || `Attachment ${idx + 1}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Delivery Status */}
                      {isSent && message.delivery_status && (
                        <div className="mt-2 pt-2 border-t border-blue-500">
                          <span className={`text-xs ${
                            message.delivery_status === 'delivered'
                              ? 'text-blue-200'
                              : message.delivery_status === 'failed'
                              ? 'text-red-200'
                              : 'text-yellow-200'
                          }`}>
                            {message.delivery_status === 'delivered' && '✓ Delivered'}
                            {message.delivery_status === 'failed' && '✗ Failed'}
                            {message.delivery_status === 'pending' && '⏳ Pending'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailThread;

