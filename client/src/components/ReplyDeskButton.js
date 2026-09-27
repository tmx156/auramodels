import React, { useState } from 'react';
import axios from 'axios';
import { FiSend, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

const ReplyDeskButton = ({ lead, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');

  const handleSendToReplyDesk = async () => {
    if (!lead || !lead.id) {
      setStatus('error');
      setMessage('Invalid lead data');
      return;
    }

    if (!lead.phone || lead.phone.trim() === '') {
      setStatus('error');
      setMessage('Lead must have a phone number');
      return;
    }

    if (lead.status === 'Booked' || lead.date_booked) {
      if (!window.confirm('This lead is already booked. Still send to Alex A.I?')) {
        return;
      }
    }

    if (!window.confirm(`Send ${lead.name} to Alex A.I (ReplyDesk) for WhatsApp qualification?\n\nAlex will contact them via WhatsApp automatically.`)) {
      return;
    }

    setLoading(true);
    setStatus(null);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `/api/leads/${lead.id}/send-to-replydesk`,
        {},
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      setStatus('success');
      setMessage('Sent to Alex A.I successfully!');

      if (onSuccess) onSuccess(response.data);

      setTimeout(() => {
        setStatus(null);
        setMessage('');
      }, 5000);
    } catch (error) {
      console.error('Error sending to ReplyDesk:', error);
      setStatus('error');
      setMessage(error.response?.data?.message || 'Failed to send to Alex A.I');

      setTimeout(() => {
        setStatus(null);
        setMessage('');
      }, 10000);
    } finally {
      setLoading(false);
    }
  };

  const alreadySent = lead?.replydesk_lead_id || lead?.replydesk_sent_at;

  const getStatusBadgeColor = (rdStatus) => {
    switch (rdStatus) {
      case 'New': return 'bg-blue-100 text-blue-700';
      case 'Qualifying': return 'bg-yellow-100 text-yellow-700';
      case 'Objection_Distance': return 'bg-orange-100 text-orange-700';
      case 'Booking_Offered': return 'bg-purple-100 text-purple-700';
      case 'Booked': return 'bg-green-100 text-green-700';
      case 'Human_Required': return 'bg-red-100 text-red-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Alex A.I (ReplyDesk)</p>
      <button
        onClick={handleSendToReplyDesk}
        disabled={loading || status === 'success'}
        className={`
          w-full inline-flex items-center justify-center px-4 py-2.5 border rounded-lg shadow-sm text-sm font-medium
          transition-all duration-200
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}
          ${status === 'success'
            ? 'border-green-300 text-green-700 bg-green-50'
            : status === 'error'
            ? 'border-red-300 text-red-700 bg-red-50'
            : alreadySent
            ? 'border-teal-300 text-teal-700 bg-teal-50 hover:bg-teal-100'
            : 'border-teal-400 text-white bg-teal-600 hover:bg-teal-700'
          }
        `}
      >
        {loading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Sending...
          </>
        ) : status === 'success' ? (
          <>
            <FiCheckCircle className="mr-2 h-4 w-4" />
            Sent to Alex A.I
          </>
        ) : status === 'error' ? (
          <>
            <FiAlertCircle className="mr-2 h-4 w-4" />
            Failed
          </>
        ) : alreadySent ? (
          <>
            <FiSend className="mr-2 h-4 w-4" />
            Resend to Alex A.I
          </>
        ) : (
          <>
            <FiSend className="mr-2 h-4 w-4" />
            Send to Alex A.I
          </>
        )}
      </button>

      {message && (
        <div className={`mt-2 text-xs ${status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </div>
      )}

      {alreadySent && (
        <div className="mt-2 space-y-1">
          {lead.replydesk_sent_at && (
            <div className="text-xs text-gray-500">
              Sent: {new Date(lead.replydesk_sent_at).toLocaleString()}
            </div>
          )}
          {lead.replydesk_status && (
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${getStatusBadgeColor(lead.replydesk_status)}`}>
              {lead.replydesk_status.replace(/_/g, ' ')}
            </span>
          )}
          {lead.replydesk_error && (
            <div className="text-xs text-red-500">Error: {lead.replydesk_error}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReplyDeskButton;
