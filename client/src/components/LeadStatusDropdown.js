import React, { useState, useEffect, useMemo } from 'react';
import { FiChevronDown, FiCheck, FiClock, FiX } from 'react-icons/fi';
import axios from 'axios';
import { getCurrentUKTime, getTodayUK, formatUKTime, ukTimeToUTC } from '../utils/timeUtils';

const LeadStatusDropdown = ({ leadId, lead, onStatusUpdate }) => {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [callbackNote, setCallbackNote] = useState('');
  const [pendingStatus, setPendingStatus] = useState(null);
  const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);
  const [showNoPhotoModal, setShowNoPhotoModal] = useState(false);
  const [hasNoAnswerBefore, setHasNoAnswerBefore] = useState(false);
  const [noAnswerCount, setNoAnswerCount] = useState(0);

  // Check if "No answer" has been selected before by checking booking history
  useEffect(() => {
    if (lead && lead.booking_history) {
      try {
        const history = typeof lead.booking_history === 'string' 
          ? JSON.parse(lead.booking_history) 
          : lead.booking_history;
        
        if (Array.isArray(history)) {
          // Count how many times "No answer" (or x2/x3) has been selected
          const noAnswerEntries = history.filter(entry => 
            entry.action === 'CALL_STATUS_UPDATE' && 
            entry.details?.callStatus && 
            (entry.details.callStatus === 'No answer' || 
             entry.details.callStatus === 'No Answer x2' || 
             entry.details.callStatus === 'No Answer x3')
          );
          
          const hasNoAnswer = noAnswerEntries.length > 0;
          setHasNoAnswerBefore(hasNoAnswer);
          setNoAnswerCount(noAnswerEntries.length);
        }
      } catch (e) {
        console.warn('Error parsing booking_history:', e);
      }
    }
  }, [lead]);

  // Base status options with workflow triggers
  const baseStatusOptions = [
    { value: 'No answer', label: 'No answer', trigger: 'email' },
    { value: 'No photo', label: 'No photo', trigger: 'email' },
    { value: 'Left Message', label: 'Left Message', trigger: 'email' },
    { value: 'Not interested', label: 'Not interested', trigger: 'close' },
    { value: 'Call back', label: 'Call back', trigger: 'callback' },
    { value: 'Wrong number', label: 'Wrong number', trigger: 'close' },
    { value: 'Sales/converted - purchased', label: 'Sales/converted - purchased', trigger: 'callback' },
    { value: 'Not Qualified', label: 'Not Qualified', trigger: 'close' },
    { value: 'In Progress', label: 'In Progress', trigger: null }
  ];

  // Dynamically build status options - add x2/x3 if "No answer" was selected before
  const statusOptions = useMemo(() => {
    const options = [...baseStatusOptions];
    
    if (hasNoAnswerBefore) {
      // Find the index of "No answer" and insert x2/x3 after it
      const noAnswerIndex = options.findIndex(opt => opt.value === 'No answer');
      if (noAnswerIndex !== -1) {
        // Insert x2 and x3 options after "No answer"
        options.splice(noAnswerIndex + 1, 0,
          { value: 'No Answer x2', label: 'No Answer x2', trigger: null }, // No email trigger
          { value: 'No Answer x3', label: 'No Answer x3', trigger: null }  // No email trigger
        );
      }
    }
    
    return options;
  }, [hasNoAnswerBefore]);

  // Fetch current status from lead (use dedicated call_status column)
  useEffect(() => {
    if (lead) {
      // Use dedicated call_status column (preferred)
      if (lead.call_status) {
        setSelectedStatus(lead.call_status);
      }
      // Fallback to custom_fields for backward compatibility (old data)
      else if (lead.custom_fields) {
        try {
          const customFields = typeof lead.custom_fields === 'string'
            ? JSON.parse(lead.custom_fields)
            : lead.custom_fields;
          if (customFields && customFields.call_status) {
            setSelectedStatus(customFields.call_status);
          }
        } catch (e) {
          console.warn('Error parsing custom_fields:', e);
        }
      }
    }
  }, [lead]);

  const handleStatusChange = async (status) => {
    if (loading) return;

    setIsOpen(false);

    // If status is "Call back", show modal to schedule callback
    if (status === 'Call back') {
      setPendingStatus(status);
      setShowCallbackModal(true);
      return;
    }

    // If status is "No answer", show confirmation modal before sending email (only first time)
    if (status === 'No answer') {
      setPendingStatus(status);
      setShowNoAnswerModal(true);
      return;
    }

    // If status is "No photo", show confirmation modal before sending email
    if (status === 'No photo') {
      setPendingStatus(status);
      setShowNoPhotoModal(true);
      return;
    }

    // For "No Answer x2" or "No Answer x3", proceed directly (no email)
    if (status === 'No Answer x2' || status === 'No Answer x3') {
      await updateStatus(status);
      return;
    }

    // For other statuses, proceed directly
    await updateStatus(status);
  };

  const updateStatus = async (status, callbackTime = null, callbackNote = '') => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.patch(`/api/leads/${leadId}/call-status`, {
        callStatus: status,
        callbackTime: callbackTime,
        callbackNote: callbackNote
      });

      if (response.data.success) {
        setSelectedStatus(status);
        
        // Notify parent component
        if (onStatusUpdate) {
          onStatusUpdate(status, response.data);
        }

        // Show success message based on workflow trigger
        const option = statusOptions.find(opt => opt.value === status);
        if (option) {
          switch (option.trigger) {
            case 'email':
              // Email will be sent automatically by backend
              break;
            case 'close':
              // Lead will be closed automatically by backend
              break;
            case 'callback':
              if (callbackTime) {
                // Show confirmation that callback is scheduled
                // Format the datetime nicely for display
                const formattedDateTime = callbackTime.includes('T')
                  ? new Date(callbackTime).toLocaleString('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Europe/London'
                    })
                  : callbackTime;
                alert(`Callback scheduled for ${formattedDateTime}. You'll receive a reminder notification.`);
              }
              break;
          }
        }
      } else {
        setError(response.data.message || 'Failed to update status');
      }
    } catch (err) {
      console.error('Error updating call status:', err);
      setError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setLoading(false);
      setShowCallbackModal(false);
      setPendingStatus(null);
      setCallbackDate('');
      setCallbackTime('');
      setCallbackNote('');
    }
  };

  const handleCallbackSubmit = () => {
    if (!callbackDate) {
      setError('Please select a callback date');
      return;
    }
    if (!callbackTime) {
      setError('Please select a callback time');
      return;
    }

    // Combine date and time into a single datetime string
    const callbackDateTime = `${callbackDate}T${callbackTime}`;
    updateStatus(pendingStatus, callbackDateTime, callbackNote);
  };

  // Get current time in UK timezone for default value (using CRM time utils)
  const getCurrentUKTimeString = () => {
    const ukTime = getCurrentUKTime();
    const hours = String(ukTime.getHours()).padStart(2, '0');
    const minutes = String(ukTime.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Get current date in UK timezone for default value
  const getCurrentUKDateString = () => {
    const ukTime = getCurrentUKTime();
    const year = ukTime.getFullYear();
    const month = String(ukTime.getMonth() + 1).padStart(2, '0');
    const day = String(ukTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Initialize callback date and time with current UK values when modal opens
  useEffect(() => {
    if (showCallbackModal) {
      // Always reset to current UK date/time when modal opens fresh
      setCallbackDate(getCurrentUKDateString());
      setCallbackTime(getCurrentUKTimeString());
    }
  }, [showCallbackModal]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'No answer':
      case 'No Answer x2':
      case 'No Answer x3':
      case 'Left Message':
      case 'No photo':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'Call back':
      case 'Sales/converted - purchased':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Not interested':
      case 'Not Qualified':
      case 'Wrong number':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'In Progress':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200 shadow-sm">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2 bg-purple-100 rounded-lg">
          <FiChevronDown className="h-5 w-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">Lead Status</h3>
          <p className="text-sm text-gray-600">Select the status after placing a call</p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => !loading && setIsOpen(!isOpen)}
          disabled={loading}
          className={`
            w-full px-4 py-3 rounded-lg border-2 text-left font-medium
            flex items-center justify-between
            transition-all duration-200
            ${selectedStatus 
              ? `${getStatusColor(selectedStatus)} border-current` 
              : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
            }
            ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}
          `}
        >
          <span>{selectedStatus || 'Select status...'}</span>
          <FiChevronDown 
            className={`h-5 w-5 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute z-20 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  className={`
                    w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors
                    flex items-center justify-between
                    ${selectedStatus === option.value ? 'bg-purple-50' : ''}
                    ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                  disabled={loading}
                >
                  <span className="font-medium">{option.label}</span>
                  {selectedStatus === option.value && (
                    <FiCheck className="h-5 w-5 text-purple-600" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Status Info */}
      {selectedStatus && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Current Status:</strong> {selectedStatus}
          </p>
          {(() => {
            const option = statusOptions.find(opt => opt.value === selectedStatus);
            if (option) {
              switch (option.trigger) {
                case 'email':
                  return (
                    <p className="text-xs text-blue-600 mt-1">
                      An automatic email will be sent to the client.
                    </p>
                  );
                case 'close':
                  return (
                    <p className="text-xs text-blue-600 mt-1">
                      This lead will be closed.
                    </p>
                  );
                case 'callback':
                  return (
                    <p className="text-xs text-blue-600 mt-1">
                      Please call the client back.
                    </p>
                  );
                default:
                  return null;
              }
            }
            return null;
          })()}
        </div>
      )}

      {loading && (
        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">Updating status...</p>
        </div>
      )}

      {/* No Answer Confirmation Modal */}
      {showNoAnswerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Send No Answer Email?</h3>
              <button
                onClick={() => {
                  setShowNoAnswerModal(false);
                  setPendingStatus(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Do you want to send your "No Answer" template email to <strong>{lead?.name}</strong>?
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={async () => {
                  await updateStatus(pendingStatus);
                  setShowNoAnswerModal(false);
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Yes, Send Email
              </button>
              <button
                onClick={() => {
                  setShowNoAnswerModal(false);
                  setPendingStatus(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No Photo Confirmation Modal */}
      {showNoPhotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Send No Photo Email?</h3>
              <button
                onClick={() => {
                  setShowNoPhotoModal(false);
                  setPendingStatus(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Do you want to send your "No Photo" template email to <strong>{lead?.name}</strong>?
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={async () => {
                  await updateStatus(pendingStatus);
                  setShowNoPhotoModal(false);
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Yes, Send Email
              </button>
              <button
                onClick={() => {
                  setShowNoPhotoModal(false);
                  setPendingStatus(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Callback Scheduling Modal */}
      {showCallbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Schedule Callback</h3>
              <button
                onClick={() => {
                  setShowCallbackModal(false);
                  setPendingStatus(null);
                  setCallbackDate('');
                  setCallbackTime('');
                  setCallbackNote('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Callback Date
                </label>
                <input
                  type="date"
                  value={callbackDate}
                  onChange={(e) => setCallbackDate(e.target.value)}
                  min={getCurrentUKDateString()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Callback Time (UK Time)
                </label>
                <input
                  type="time"
                  value={callbackTime}
                  onChange={(e) => setCallbackTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  You'll receive a notification at this date and time to call back
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note (Optional)
                </label>
                <textarea
                  value={callbackNote}
                  onChange={(e) => setCallbackNote(e.target.value)}
                  placeholder="e.g., back 5pm, discuss pricing, follow up on quote"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  rows="3"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-100 border border-red-300 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={handleCallbackSubmit}
                  disabled={loading || !callbackDate || !callbackTime}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <FiClock className="h-4 w-4" />
                  <span>Schedule Callback</span>
                </button>
                <button
                  onClick={() => {
                    setShowCallbackModal(false);
                    setPendingStatus(null);
                    setCallbackDate('');
                    setCallbackTime('');
                    setCallbackNote('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadStatusDropdown;

