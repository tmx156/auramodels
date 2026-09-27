import React, { useState } from 'react';
import axios from 'axios';
import { FiSend, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

/**
 * Alex A.I Trigger Button Component
 * Allows users to send a lead to Alex A.I for automated contact
 */
const Alex A.IButton = ({ lead, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error' | null
  const [message, setMessage] = useState('');

  const handleTriggerAlex A.I = async () => {
    if (!lead || !lead.id) {
      setStatus('error');
      setMessage('Invalid lead data');
      return;
    }

    // Validate lead before sending
    if (!lead.phone || lead.phone.trim() === '') {
      setStatus('error');
      setMessage('Lead must have a phone number to send to Alex A.I');
      return;
    }

    if (lead.status === 'Booked' || lead.date_booked) {
      if (!window.confirm(`⚠️ This lead is already booked. Still send to Alex A.I?`)) {
        return;
      }
    }

    // Confirm before sending
    if (!window.confirm(`Send ${lead.name} to Alex A.I for automated contact?\n\nThis will trigger automated SMS/WhatsApp messages.`)) {
      return;
    }

    setLoading(true);
    setStatus(null);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `/api/salesape-webhook/trigger/${lead.id}`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      setStatus('success');
      setMessage('Lead sent to Alex A.I successfully!');
      
      if (onSuccess) {
        onSuccess(response.data);
      }

      // Clear success message after 5 seconds
      setTimeout(() => {
        setStatus(null);
        setMessage('');
      }, 5000);

    } catch (error) {
      console.error('Error triggering Alex A.I:', error);
      setStatus('error');
      setMessage(
        error.response?.data?.message || 
        error.response?.data?.error || 
        'Failed to send lead to Alex A.I'
      );

      // Clear error message after 10 seconds
      setTimeout(() => {
        setStatus(null);
        setMessage('');
      }, 10000);
    } finally {
      setLoading(false);
    }
  };

  // Check if lead was already sent to Alex A.I
  const alreadySent = lead?.salesape_record_id || lead?.salesape_sent_at;

  return (
    <div className="salesape-button-container">
      <button
        onClick={handleTriggerAlex A.I}
        disabled={loading || status === 'success'}
        className={`
          inline-flex items-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}
          ${status === 'success' 
            ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100' 
            : status === 'error'
            ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100'
            : alreadySent
            ? 'border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100'
            : 'border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
          }
        `}
        title={alreadySent ? 'Lead already sent to Alex A.I' : 'Send lead to Alex A.I'}
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
            <FiCheckCircle className="mr-2 h-4 w-4" />
            Resend to Alex A.I
          </>
        ) : (
          <>
            <FiSend className="mr-2 h-4 w-4" />
            Send to Alex A.I
          </>
        )}
      </button>

      {/* Status message */}
      {message && (
        <div className={`
          mt-2 text-sm
          ${status === 'success' ? 'text-green-600' : 'text-red-600'}
        `}>
          {message}
        </div>
      )}

      {/* Alex A.I status info */}
      {alreadySent && (
        <div className="mt-2 text-xs text-gray-500">
          {lead.salesape_sent_at && (
            <div>Sent: {new Date(lead.salesape_sent_at).toLocaleString()}</div>
          )}
          {lead.salesape_status && (
            <div>Status: {lead.salesape_status}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Alex A.IButton;
