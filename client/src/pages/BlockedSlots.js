import React, { useState, useEffect } from 'react';
import { FiCalendar, FiLock, FiUnlock, FiX } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { toLocalDateStr } from '../utils/timeUtils';
import axios from 'axios';

const BlockedSlots = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr(new Date()));
  const [blockedSlots, setBlockedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockType, setBlockType] = useState('full-day'); // 'full-day', 'time-slot', 'slot-column'
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [selectedSlotNumber, setSelectedSlotNumber] = useState(null);

  // Time slots (10:00 - 16:30 in 30-minute increments)
  const timeSlots = [
    '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30'
  ];

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchBlockedSlots();
    }
  }, [user, selectedDate]);

  const fetchBlockedSlots = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/blocked-slots', {
        params: {
          start_date: selectedDate,
          end_date: selectedDate
        }
      });
      setBlockedSlots(response.data);
    } catch (error) {
      console.error('Error fetching blocked slots:', error);
      alert('Error loading blocked slots');
    } finally {
      setLoading(false);
    }
  };

  const isSlotBlocked = (timeSlot = null, slotNumber = null) => {
    return blockedSlots.some(block => {
      // Full day block
      if (!block.time_slot) {
        // If checking a specific slot number
        if (slotNumber && block.slot_number) {
          return parseInt(block.slot_number) === parseInt(slotNumber);
        }
        // If block has no slot_number, all slots are blocked
        if (!block.slot_number) {
          return true;
        }
      }

      // Specific time slot block
      if (timeSlot && block.time_slot === timeSlot) {
        if (slotNumber && block.slot_number) {
          return parseInt(block.slot_number) === parseInt(slotNumber);
        }
        if (!block.slot_number) {
          return true;
        }
      }

      return false;
    });
  };

  const getBlockReason = (timeSlot = null, slotNumber = null) => {
    const block = blockedSlots.find(b => {
      if (!timeSlot) {
        // Looking for full day block
        if (!b.time_slot) {
          if (slotNumber && b.slot_number) {
            return parseInt(b.slot_number) === parseInt(slotNumber);
          }
          return !b.slot_number;
        }
      } else {
        // Looking for time slot block
        if (b.time_slot === timeSlot) {
          if (slotNumber && b.slot_number) {
            return parseInt(b.slot_number) === parseInt(slotNumber);
          }
          return !b.slot_number;
        }
      }
      return false;
    });
    return block?.reason || '';
  };

  const handleBlockSlot = async () => {
    try {
      setLoading(true);

      const payload = {
        date: selectedDate,
        reason: blockReason || 'Unavailable'
      };

      if (blockType === 'time-slot') {
        payload.time_slot = selectedTimeSlot;
      }

      if (blockType === 'slot-column') {
        payload.time_slot = selectedTimeSlot;
        payload.slot_number = selectedSlotNumber;
      }

      if (blockType === 'full-day' && selectedSlotNumber) {
        payload.slot_number = selectedSlotNumber;
      }

      await axios.post('/api/blocked-slots', payload);

      setShowBlockModal(false);
      setBlockReason('');
      setSelectedTimeSlot('');
      setSelectedSlotNumber(null);
      fetchBlockedSlots();
      alert('Slot blocked successfully');
    } catch (error) {
      console.error('Error blocking slot:', error);
      if (error.response?.status === 409) {
        alert('This slot is already blocked');
      } else {
        alert('Error blocking slot: ' + (error.response?.data?.message || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUnblockSlot = async (blockId) => {
    if (!window.confirm('Are you sure you want to unblock this slot?')) {
      return;
    }

    try {
      setLoading(true);
      await axios.delete(`/api/blocked-slots/${blockId}`);
      fetchBlockedSlots();
      alert('Slot unblocked successfully');
    } catch (error) {
      console.error('Error unblocking slot:', error);
      alert('Error unblocking slot');
    } finally {
      setLoading(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only administrators can manage blocked slots.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FiCalendar className="text-2xl text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-800">Manage Blocked Slots</h1>
            </div>
            <button
              onClick={() => setShowBlockModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <FiLock />
              Block Slot
            </button>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Select Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Blocked Slots List */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Blocked Slots for {new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h2>

          {loading ? (
            <p className="text-gray-600">Loading...</p>
          ) : blockedSlots.length === 0 ? (
            <p className="text-gray-600">No blocked slots for this date.</p>
          ) : (
            <div className="space-y-3">
              {blockedSlots.map((block) => (
                <div
                  key={block.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <FiLock className="text-red-500" />
                    <div>
                      <p className="font-medium text-gray-800">
                        {!block.time_slot ? (
                          <>
                            Full Day Blocked
                            {block.slot_number && ` - Slot ${block.slot_number} only`}
                          </>
                        ) : (
                          <>
                            {block.time_slot}
                            {block.slot_number ? ` - Slot ${block.slot_number}` : ' - All Slots'}
                          </>
                        )}
                      </p>
                      <p className="text-sm text-gray-600">{block.reason}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblockSlot(block.id)}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
                  >
                    <FiUnlock />
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Visual Time Slots Grid */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Time Slots Overview</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Slot 1 Column */}
            <div>
              <h3 className="text-md font-semibold text-gray-700 mb-3 text-center">Slot 1</h3>
              <div className="space-y-2">
                {timeSlots.map((time) => (
                  <div
                    key={`slot1-${time}`}
                    className={`p-3 rounded-lg border ${
                      isSlotBlocked(time, 1)
                        ? 'bg-red-100 border-red-300'
                        : 'bg-green-100 border-green-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{time}</span>
                      {isSlotBlocked(time, 1) ? (
                        <span className="text-sm text-red-600 flex items-center gap-1">
                          <FiLock /> Blocked
                        </span>
                      ) : (
                        <span className="text-sm text-green-600">Available</span>
                      )}
                    </div>
                    {isSlotBlocked(time, 1) && (
                      <p className="text-xs text-gray-600 mt-1">{getBlockReason(time, 1)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Slot 2 Column */}
            <div>
              <h3 className="text-md font-semibold text-gray-700 mb-3 text-center">Slot 2</h3>
              <div className="space-y-2">
                {timeSlots.map((time) => (
                  <div
                    key={`slot2-${time}`}
                    className={`p-3 rounded-lg border ${
                      isSlotBlocked(time, 2)
                        ? 'bg-red-100 border-red-300'
                        : 'bg-green-100 border-green-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{time}</span>
                      {isSlotBlocked(time, 2) ? (
                        <span className="text-sm text-red-600 flex items-center gap-1">
                          <FiLock /> Blocked
                        </span>
                      ) : (
                        <span className="text-sm text-green-600">Available</span>
                      )}
                    </div>
                    {isSlotBlocked(time, 2) && (
                      <p className="text-xs text-gray-600 mt-1">{getBlockReason(time, 2)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Slot 3 Column */}
            <div>
              <h3 className="text-md font-semibold text-gray-700 mb-3 text-center">Slot 3</h3>
              <div className="space-y-2">
                {timeSlots.map((time) => (
                  <div
                    key={`slot3-${time}`}
                    className={`p-3 rounded-lg border ${
                      isSlotBlocked(time, 3)
                        ? 'bg-red-100 border-red-300'
                        : 'bg-green-100 border-green-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{time}</span>
                      {isSlotBlocked(time, 3) ? (
                        <span className="text-sm text-red-600 flex items-center gap-1">
                          <FiLock /> Blocked
                        </span>
                      ) : (
                        <span className="text-sm text-green-600">Available</span>
                      )}
                    </div>
                    {isSlotBlocked(time, 3) && (
                      <p className="text-xs text-gray-600 mt-1">{getBlockReason(time, 3)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Slot 4 Column */}
            <div>
              <h3 className="text-md font-semibold text-gray-700 mb-3 text-center">Slot 4</h3>
              <div className="space-y-2">
                {timeSlots.map((time) => (
                  <div
                    key={`slot4-${time}`}
                    className={`p-3 rounded-lg border ${
                      isSlotBlocked(time, 4)
                        ? 'bg-red-100 border-red-300'
                        : 'bg-green-100 border-green-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{time}</span>
                      {isSlotBlocked(time, 4) ? (
                        <span className="text-sm text-red-600 flex items-center gap-1">
                          <FiLock /> Blocked
                        </span>
                      ) : (
                        <span className="text-sm text-green-600">Available</span>
                      )}
                    </div>
                    {isSlotBlocked(time, 4) && (
                      <p className="text-xs text-gray-600 mt-1">{getBlockReason(time, 4)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Block Slot Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">Block Slot</h2>
              <button
                onClick={() => setShowBlockModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FiX className="text-xl" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Block Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Block Type
                </label>
                <select
                  value={blockType}
                  onChange={(e) => setBlockType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="full-day">Full Day (All Slots)</option>
                  <option value="time-slot">Specific Time (All Slots)</option>
                  <option value="slot-column">Specific Time & Slot Number</option>
                </select>
              </div>

              {/* Time Slot Selection */}
              {(blockType === 'time-slot' || blockType === 'slot-column') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time Slot
                  </label>
                  <select
                    value={selectedTimeSlot}
                    onChange={(e) => setSelectedTimeSlot(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select time...</option>
                    {timeSlots.map((time) => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Slot Number Selection */}
              {blockType === 'slot-column' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Slot Number
                  </label>
                  <select
                    value={selectedSlotNumber || ''}
                    onChange={(e) => setSelectedSlotNumber(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select slot...</option>
                    <option value="1">Slot 1</option>
                    <option value="2">Slot 2</option>
                    <option value="3">Slot 3</option>
                    <option value="4">Slot 4</option>
                  </select>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g., Holiday, Staff unavailable"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBlockSlot}
                  disabled={loading || (blockType !== 'full-day' && !selectedTimeSlot) || (blockType === 'slot-column' && !selectedSlotNumber)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {loading ? 'Blocking...' : 'Block Slot'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockedSlots;
