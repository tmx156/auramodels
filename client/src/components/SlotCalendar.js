import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FiCheckCircle, FiClock, FiUser, FiMessageSquare, FiMail } from 'react-icons/fi';
import { toLocalDateStr } from '../utils/timeUtils';

// Time slots configuration matching the visual design
// Striped pattern for child/male slots: bg-gradient-to-r from-yellow-100 to-blue-100
const TIME_SLOTS = [
  // 10:00 - Slot 1: child/male, Slot 2: female, Slot 3: female
  { time: '10:00', slot1Type: 'child-male', slot1Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot1BorderColor: 'border-yellow-300', slot1Label: 'Child/Male',
                    slot2Type: 'female', slot2Color: 'bg-pink-100', slot2BorderColor: 'border-pink-200', slot2Label: 'Female',
                    slot3Type: 'female', slot3Color: 'bg-pink-100', slot3BorderColor: 'border-pink-200', slot3Label: 'Female',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 10:30 - Slot 1: child/male, Slot 2: child/male, Slot 3: child/male, Slot 4: child/male
  { time: '10:30', slot1Type: 'child-male', slot1Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot1BorderColor: 'border-yellow-300', slot1Label: 'Child/Male',
                    slot2Type: 'child-male', slot2Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot2BorderColor: 'border-yellow-300', slot2Label: 'Child/Male',
                    slot3Type: 'child-male', slot3Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot3BorderColor: 'border-yellow-300', slot3Label: 'Child/Male',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 11:00 - Slot 1: female, Slot 2: child/male, Slot 3: child/male, Slot 4: child/male
  { time: '11:00', slot1Type: 'female', slot1Color: 'bg-pink-100', slot1BorderColor: 'border-pink-200', slot1Label: 'Female',
                    slot2Type: 'child-male', slot2Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot2BorderColor: 'border-yellow-300', slot2Label: 'Child/Male',
                    slot3Type: 'child-male', slot3Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot3BorderColor: 'border-yellow-300', slot3Label: 'Child/Male',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 11:30 - Slot 1: female, Slot 2: female, Slot 3: female, Slot 4: child/male
  { time: '11:30', slot1Type: 'female', slot1Color: 'bg-pink-100', slot1BorderColor: 'border-pink-200', slot1Label: 'Female',
                    slot2Type: 'female', slot2Color: 'bg-pink-100', slot2BorderColor: 'border-pink-200', slot2Label: 'Female',
                    slot3Type: 'female', slot3Color: 'bg-pink-100', slot3BorderColor: 'border-pink-200', slot3Label: 'Female',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 12:00 - Slot 1: child/male, Slot 2: male, Slot 3: male, Slot 4: child/male
  { time: '12:00', slot1Type: 'child-male', slot1Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot1BorderColor: 'border-yellow-300', slot1Label: 'Child/Male',
                    slot2Type: 'male', slot2Color: 'bg-blue-100', slot2BorderColor: 'border-blue-200', slot2Label: 'Male',
                    slot3Type: 'male', slot3Color: 'bg-blue-100', slot3BorderColor: 'border-blue-200', slot3Label: 'Male',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 12:30 - Slot 1: female, Slot 2: female, Slot 3: female, Slot 4: child/male
  { time: '12:30', slot1Type: 'female', slot1Color: 'bg-pink-100', slot1BorderColor: 'border-pink-200', slot1Label: 'Female',
                    slot2Type: 'female', slot2Color: 'bg-pink-100', slot2BorderColor: 'border-pink-200', slot2Label: 'Female',
                    slot3Type: 'female', slot3Color: 'bg-pink-100', slot3BorderColor: 'border-pink-200', slot3Label: 'Female',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 13:00 - Slot 1: female, Slot 2: male, Slot 3: male, Slot 4: child/male
  { time: '13:00', slot1Type: 'female', slot1Color: 'bg-pink-100', slot1BorderColor: 'border-pink-200', slot1Label: 'Female',
                    slot2Type: 'male', slot2Color: 'bg-blue-100', slot2BorderColor: 'border-blue-200', slot2Label: 'Male',
                    slot3Type: 'male', slot3Color: 'bg-blue-100', slot3BorderColor: 'border-blue-200', slot3Label: 'Male',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 13:30 - Slot 1: female, Slot 2: male/child, Slot 3: male/child, Slot 4: child/male
  { time: '13:30', slot1Type: 'female', slot1Color: 'bg-pink-100', slot1BorderColor: 'border-pink-200', slot1Label: 'Female',
                    slot2Type: 'child-male', slot2Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot2BorderColor: 'border-yellow-300', slot2Label: 'Male/Child',
                    slot3Type: 'child-male', slot3Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot3BorderColor: 'border-yellow-300', slot3Label: 'Male/Child',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 14:00 - Slot 1: male/child, Slot 2: male/child, Slot 3: male/child, Slot 4: child/male
  { time: '14:00', slot1Type: 'child-male', slot1Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot1BorderColor: 'border-yellow-300', slot1Label: 'Male/Child',
                    slot2Type: 'child-male', slot2Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot2BorderColor: 'border-yellow-300', slot2Label: 'Male/Child',
                    slot3Type: 'child-male', slot3Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot3BorderColor: 'border-yellow-300', slot3Label: 'Male/Child',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 14:30 - Slot 1: female, Slot 2: male/child, Slot 3: male/child, Slot 4: child/male
  { time: '14:30', slot1Type: 'female', slot1Color: 'bg-pink-100', slot1BorderColor: 'border-pink-200', slot1Label: 'Female',
                    slot2Type: 'child-male', slot2Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot2BorderColor: 'border-yellow-300', slot2Label: 'Male/Child',
                    slot3Type: 'child-male', slot3Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot3BorderColor: 'border-yellow-300', slot3Label: 'Male/Child',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 15:00 - Slot 1: female, Slot 2: female, Slot 3: female, Slot 4: child/male
  { time: '15:00', slot1Type: 'female', slot1Color: 'bg-pink-100', slot1BorderColor: 'border-pink-200', slot1Label: 'Female',
                    slot2Type: 'female', slot2Color: 'bg-pink-100', slot2BorderColor: 'border-pink-200', slot2Label: 'Female',
                    slot3Type: 'female', slot3Color: 'bg-pink-100', slot3BorderColor: 'border-pink-200', slot3Label: 'Female',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 15:30 - Slot 1: male/child, Slot 2: male/child, Slot 3: male/child, Slot 4: child/male
  { time: '15:30', slot1Type: 'child-male', slot1Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot1BorderColor: 'border-yellow-300', slot1Label: 'Male/Child',
                    slot2Type: 'child-male', slot2Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot2BorderColor: 'border-yellow-300', slot2Label: 'Male/Child',
                    slot3Type: 'child-male', slot3Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot3BorderColor: 'border-yellow-300', slot3Label: 'Male/Child',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 16:00 - Slot 1: male, Slot 2: male, Slot 3: male, Slot 4: child/male
  { time: '16:00', slot1Type: 'male', slot1Color: 'bg-blue-100', slot1BorderColor: 'border-blue-200', slot1Label: 'Male',
                    slot2Type: 'male', slot2Color: 'bg-blue-100', slot2BorderColor: 'border-blue-200', slot2Label: 'Male',
                    slot3Type: 'male', slot3Color: 'bg-blue-100', slot3BorderColor: 'border-blue-200', slot3Label: 'Male',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' },

  // 16:30 - Slot 1: male, Slot 2: male, Slot 3: male, Slot 4: child/male
  { time: '16:30', slot1Type: 'male', slot1Color: 'bg-blue-100', slot1BorderColor: 'border-blue-200', slot1Label: 'Male',
                    slot2Type: 'male', slot2Color: 'bg-blue-100', slot2BorderColor: 'border-blue-200', slot2Label: 'Male',
                    slot3Type: 'male', slot3Color: 'bg-blue-100', slot3BorderColor: 'border-blue-200', slot3Label: 'Male',
                    slot4Type: 'child-male', slot4Color: 'bg-gradient-to-r from-yellow-100 to-blue-100', slot4BorderColor: 'border-yellow-300', slot4Label: 'Child/Male' }
];

const SlotCalendar = ({ selectedDate, events, blockedSlots = [], onSlotClick, onEventClick }) => {
  const [overflowDropdown, setOverflowDropdown] = useState(null); // { time, slot }
  const dropdownRef = useRef(null);

  // Close dropdown on click-outside or Escape
  useEffect(() => {
    if (!overflowDropdown) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOverflowDropdown(null);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setOverflowDropdown(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [overflowDropdown]);

  // PERFORMANCE: Index events by date+time+slot once per render — stores ARRAYS
  const eventsBySlot = useMemo(() => {
    if (!events || events.length === 0) return new Map();

    const dateStr = toLocalDateStr(selectedDate);
    const index = new Map();

    events.forEach(event => {
      if (!event.date_booked) return;
      const eventDateStr = toLocalDateStr(new Date(event.date_booked));
      if (eventDateStr !== dateStr) return;

      const key = `${event.time_booked || ''}_${event.booking_slot || 1}`;
      if (!index.has(key)) {
        index.set(key, []);
      }
      index.get(key).push(event);
    });

    return index;
  }, [events, selectedDate]);

  // PERFORMANCE: Index blocked slots by date once per render
  const blockedSlotsByDate = useMemo(() => {
    if (!blockedSlots || blockedSlots.length === 0) return new Map();
    
    const index = new Map();
    blockedSlots.forEach(block => {
      const blockDateStr = toLocalDateStr(new Date(block.date));
      if (!index.has(blockDateStr)) {
        index.set(blockDateStr, []);
      }
      index.get(blockDateStr).push(block);
    });
    return index;
  }, [blockedSlots]);

  // Check if a slot is blocked - OPTIMIZED: Use pre-indexed map
  const isSlotBlocked = (timeSlot = null, slotNumber = null) => {
    const dateStr = toLocalDateStr(selectedDate);
    const dayBlocks = blockedSlotsByDate.get(dateStr) || [];
    
    if (dayBlocks.length === 0) return false;
    
    return dayBlocks.some(block => {
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

  // Get all REAL events for a slot (excludes rescheduled-away ghosts)
  const getEventsForSlot = (time, slot) => {
    const key = `${time}_${slot}`;
    return (eventsBySlot.get(key) || []).filter(e => !e.isRescheduledAway);
  };

  // Get primary (first) real event for a slot — keeps existing rendering unchanged
  const getEventForSlot = (time, slot) => {
    const arr = getEventsForSlot(time, slot);
    return arr.length > 0 ? arr[0] : null;
  };

  // Get a "rescheduled away" ghost marker for a slot (booking that used to be here)
  const getGhostForSlot = (time, slot) => {
    const key = `${time}_${slot}`;
    const arr = eventsBySlot.get(key) || [];
    return arr.find(e => e.isRescheduledAway) || null;
  };

  // Render the greyed ghost marker (strikethrough name + where it moved to)
  const getGhostContent = (ghost) => {
    if (!ghost) return null;
    let movedLabel = '';
    if (ghost.movedTo) {
      const d = new Date(ghost.movedTo);
      if (!isNaN(d.getTime())) movedLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    return (
      <div className="text-sm text-gray-500 truncate flex items-center justify-center gap-1" title={`${ghost.name} rescheduled${movedLabel ? ` to ${movedLabel}` : ''}`}>
        <span className="line-through font-medium">{ghost.name}</span>
        {movedLabel && <span className="text-xs">→ {movedLabel}</span>}
      </div>
    );
  };

  // Get status indicator - LARGER AND MORE VISIBLE
  // PRIORITY: Booking Status > Confirmation Status
  const getStatusIndicator = (event) => {
    if (!event) return null;

    // Check booking_status FIRST (these override confirmation status)
    if (event.booking_status === 'Arrived') {
      return <span className="inline-block w-3 h-3 rounded-full mr-2 shadow-sm" style={{ backgroundColor: '#2563eb' }}></span>;
    }

    if (event.booking_status === 'Left') {
      return <span className="inline-block w-3 h-3 rounded-full mr-2 shadow-sm" style={{ backgroundColor: '#1f2937' }}></span>;
    }

    if (event.booking_status === 'No Show') {
      return <span className="inline-block w-3 h-3 rounded-full mr-2 shadow-sm" style={{ backgroundColor: '#ef4444' }}></span>;
    }

    if (event.booking_status === 'No Sale') {
      return <span className="inline-block w-3 h-3 rounded-full mr-2 shadow-sm" style={{ backgroundColor: '#b91c1c' }}></span>;
    }

    if (event.booking_status === 'Review') {
      return <span className="inline-block w-3 h-3 rounded-full mr-2 shadow-sm" style={{ backgroundColor: '#8b5cf6' }}></span>;
    }

    // Then check confirmation status (use == 1 for explicit check)
    if (event.is_double_confirmed == 1) {
      return <span className="inline-block text-green-700 font-black text-sm mr-1">✓✓</span>;
    }

    if (event.is_confirmed == 1) {
      return <FiCheckCircle className="inline-block w-5 h-5 text-green-500 mr-1" />;
    }

    return <FiClock className="inline-block w-5 h-5 text-orange-400 mr-1" />;
  };

  // Get cell background based on booking status and blocked state - VIBRANT COLORS
  const getCellBackground = (slotConfig, event, time, slotNumber) => {
    // Check if slot is blocked first - blocked slots are always grey
    if (isSlotBlocked(time, slotNumber)) {
      return 'bg-gray-300 opacity-60'; // Greyed out for blocked slots
    }

    // Get the appropriate color for this specific slot
    const slotColor = slotNumber === 1 ? slotConfig.slot1Color : slotNumber === 2 ? slotConfig.slot2Color : slotNumber === 3 ? slotConfig.slot3Color : slotConfig.slot4Color;

    if (!event) return slotColor;

    // PRIORITY ORDER: Sale > Booking Status > Confirmation Status
    if (event.has_sale) return 'bg-blue-300'; // Sale made - brighter blue

    // Check booking_status FIRST (these override confirmation status)
    if (event.booking_status === 'Arrived') return 'bg-blue-300'; // Arrived - VIVID BLUE
    if (event.booking_status === 'Left') return 'bg-gray-400'; // Left - darker gray
    if (event.booking_status === 'No Show') return 'bg-red-300'; // No Show - BRIGHT RED
    if (event.booking_status === 'No Sale') return 'bg-red-200'; // No Sale - red
    if (event.booking_status === 'Review') return 'bg-purple-300'; // Review - VIVID PURPLE

    // Then check confirmation status (use == 1 for explicit check)
    if (event.is_double_confirmed == 1) return 'bg-green-400'; // Double Confirmed - VIVID DARK GREEN
    if (event.is_confirmed == 1) return 'bg-green-300'; // Confirmed - BRIGHT GREEN

    return 'bg-orange-200'; // Unconfirmed - brighter orange
  };

  return (
    <div className="slot-calendar-container">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          {selectedDate.toLocaleDateString('en-GB', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </h2>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-blue-100 border border-blue-200 rounded mr-2"></div>
            <span>Male</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-pink-100 border border-pink-200 rounded mr-2"></div>
            <span>Female</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gradient-to-r from-yellow-100 to-blue-100 border border-yellow-300 rounded mr-2"></div>
            <span>Child/Male</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-50 border border-gray-300 rounded mr-2"></div>
            <span>Unavailable</span>
          </div>
        </div>
        {/* Status Legend - VIBRANT COLORS */}
        <div className="flex flex-wrap gap-3 text-xs mt-2 pt-2 border-t border-gray-200">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full mr-1 shadow-sm" style={{ backgroundColor: '#fb923c' }}></div>
            <span className="font-medium">Unconfirmed</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full mr-1 shadow-sm" style={{ backgroundColor: '#22c55e' }}></div>
            <span className="font-medium">Confirmed</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full mr-1 shadow-sm" style={{ backgroundColor: '#15803d' }}></div>
            <span className="font-medium">Double Confirmed</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full mr-1 shadow-sm" style={{ backgroundColor: '#2563eb' }}></div>
            <span className="font-medium">Arrived</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full mr-1 shadow-sm" style={{ backgroundColor: '#1f2937' }}></div>
            <span className="font-medium">Left</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full mr-1 shadow-sm" style={{ backgroundColor: '#ef4444' }}></div>
            <span className="font-medium">No Show</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full mr-1 shadow-sm" style={{ backgroundColor: '#8b5cf6' }}></div>
            <span className="font-medium">Review</span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="slot-calendar-grid border border-gray-300 rounded-lg overflow-hidden shadow-sm">
        {/* Header Row */}
        <div className="grid grid-cols-5 bg-gray-50 border-b border-gray-300">
          <div className="p-3 font-semibold text-center border-r border-gray-300">TIME</div>
          <div className="p-3 font-semibold text-center border-r border-gray-300">SLOT 1</div>
          <div className="p-3 font-semibold text-center border-r border-gray-300">SLOT 2</div>
          <div className="p-3 font-semibold text-center border-r border-gray-300">SLOT 3</div>
          <div className="p-3 font-semibold text-center">SLOT 4</div>
        </div>

        {/* Time Slot Rows */}
        {TIME_SLOTS.map((slotConfig, index) => {
          const slot1Event = getEventForSlot(slotConfig.time, 1);
          const slot2Event = getEventForSlot(slotConfig.time, 2);
          const slot3Event = getEventForSlot(slotConfig.time, 3);
          const slot4Event = getEventForSlot(slotConfig.time, 4);
          const slot1All = getEventsForSlot(slotConfig.time, 1);
          const slot2All = getEventsForSlot(slotConfig.time, 2);
          const slot3All = getEventsForSlot(slotConfig.time, 3);
          const slot4All = getEventsForSlot(slotConfig.time, 4);
          const slot1Overflow = slot1All.length > 1 ? slot1All.slice(1) : [];
          const slot2Overflow = slot2All.length > 1 ? slot2All.slice(1) : [];
          const slot3Overflow = slot3All.length > 1 ? slot3All.slice(1) : [];
          const slot4Overflow = slot4All.length > 1 ? slot4All.slice(1) : [];
          // Rescheduled-away ghost markers (only shown when the slot has no real booking)
          const slot1Ghost = !slot1Event ? getGhostForSlot(slotConfig.time, 1) : null;
          const slot2Ghost = !slot2Event ? getGhostForSlot(slotConfig.time, 2) : null;
          const slot3Ghost = !slot3Event ? getGhostForSlot(slotConfig.time, 3) : null;
          const slot4Ghost = !slot4Event ? getGhostForSlot(slotConfig.time, 4) : null;

          return (
            <div
              key={slotConfig.time}
              className={`grid grid-cols-5 border-b border-gray-200 ${index === TIME_SLOTS.length - 1 ? 'border-b-0' : ''}`}
            >
              {/* Time Column */}
              <div className="p-4 font-medium text-center border-r border-gray-300 bg-gray-50 flex items-center justify-center">
                {slotConfig.time}
              </div>

              {/* Slot 1 */}
              <div
                className={`p-4 border-r border-gray-300 ${getCellBackground(slotConfig, slot1Event, slotConfig.time, 1)} ${slotConfig.slot1BorderColor} ${isSlotBlocked(slotConfig.time, 1) || slotConfig.slot1Type === 'blank' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity min-h-[80px] flex items-center justify-center relative`}
                onClick={() => {
                  if (isSlotBlocked(slotConfig.time, 1) || slotConfig.slot1Type === 'blank') return;
                  slot1Event ? onEventClick(slot1Event) : onSlotClick(slotConfig.time, 1, slotConfig);
                }}
              >
                {isSlotBlocked(slotConfig.time, 1) ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-600 flex items-center justify-center">
                      <span className="text-xs">🔒 Blocked</span>
                    </div>
                  </div>
                ) : slotConfig.slot1Type === 'blank' ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-500 flex items-center justify-center">
                      <span className="text-xs">Unavailable</span>
                    </div>
                  </div>
                ) : slot1Event ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-800 flex items-center justify-center">
                      {getStatusIndicator(slot1Event)}
                      <span className="truncate">{slot1Event.name}</span>
                      {/* Unread received message - flashing icon */}
                      {(slot1Event.hasUnreadSms || slot1Event.hasUnreadEmail) ? (
                        <span className="relative ml-1.5 flex-shrink-0 animate-pulse">
                          {slot1Event.hasUnreadSms ? (
                            <FiMessageSquare className="inline-block w-4 h-4 text-green-500" />
                          ) : (
                            <FiMail className="inline-block w-4 h-4 text-blue-500" />
                          )}
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-ping" style={{animationDuration: '1.5s'}} />
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                        </span>
                      ) : (slot1Event.hasReceivedSms || slot1Event.hasReceivedEmail) ? (
                        /* Read received message - static opened icon */
                        <span className="ml-1.5 flex-shrink-0">
                          {slot1Event.hasReceivedSms ? (
                            <FiMessageSquare className="inline-block w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <FiMail className="inline-block w-3.5 h-3.5 text-gray-400" />
                          )}
                        </span>
                      ) : null}
                    </div>
                    {slot1Event.phone && (
                      <div className="text-xs text-gray-600 mt-1">{slot1Event.phone}</div>
                    )}
                  </div>
                ) : slot1Ghost ? (
                  <div className="text-center w-full">
                    {getGhostContent(slot1Ghost)}
                    <div className="text-gray-400 text-xs mt-1">Click to Book</div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm text-center">
                    Click to Book
                  </div>
                )}
                {/* Overflow badge */}
                {slot1Overflow.length > 0 && (
                  <div className="absolute top-1 right-1" ref={overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 1 ? dropdownRef : null}>
                    <button
                      className="bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverflowDropdown(
                          overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 1
                            ? null
                            : { time: slotConfig.time, slot: 1 }
                        );
                      }}
                      title={`${slot1Overflow.length} more booking(s)`}
                    >
                      +{slot1Overflow.length}
                    </button>
                    {overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 1 && (
                      <div className="absolute top-7 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
                        <div className="px-3 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200">
                          +{slot1Overflow.length} more booking{slot1Overflow.length > 1 ? 's' : ''}
                        </div>
                        {slot1Overflow.map((evt, i) => (
                          <button
                            key={evt.id || i}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowDropdown(null);
                              onEventClick(evt);
                            }}
                          >
                            {getStatusIndicator(evt)}
                            <span className="truncate font-medium">{evt.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Slot 2 */}
              <div
                className={`p-4 ${getCellBackground(slotConfig, slot2Event, slotConfig.time, 2)} ${slotConfig.slot2BorderColor} ${isSlotBlocked(slotConfig.time, 2) || slotConfig.slot2Type === 'blank' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity min-h-[80px] flex items-center justify-center relative`}
                onClick={() => {
                  if (isSlotBlocked(slotConfig.time, 2) || slotConfig.slot2Type === 'blank') return;
                  slot2Event ? onEventClick(slot2Event) : onSlotClick(slotConfig.time, 2, slotConfig);
                }}
              >
                {isSlotBlocked(slotConfig.time, 2) ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-600 flex items-center justify-center">
                      <span className="text-xs">🔒 Blocked</span>
                    </div>
                  </div>
                ) : slotConfig.slot2Type === 'blank' ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-500 flex items-center justify-center">
                      <span className="text-xs">Unavailable</span>
                    </div>
                  </div>
                ) : slot2Event ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-800 flex items-center justify-center">
                      {getStatusIndicator(slot2Event)}
                      <span className="truncate">{slot2Event.name}</span>
                      {/* Unread received message - flashing icon */}
                      {(slot2Event.hasUnreadSms || slot2Event.hasUnreadEmail) ? (
                        <span className="relative ml-1.5 flex-shrink-0 animate-pulse">
                          {slot2Event.hasUnreadSms ? (
                            <FiMessageSquare className="inline-block w-4 h-4 text-green-500" />
                          ) : (
                            <FiMail className="inline-block w-4 h-4 text-blue-500" />
                          )}
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-ping" style={{animationDuration: '1.5s'}} />
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                        </span>
                      ) : (slot2Event.hasReceivedSms || slot2Event.hasReceivedEmail) ? (
                        /* Read received message - static opened icon */
                        <span className="ml-1.5 flex-shrink-0">
                          {slot2Event.hasReceivedSms ? (
                            <FiMessageSquare className="inline-block w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <FiMail className="inline-block w-3.5 h-3.5 text-gray-400" />
                          )}
                        </span>
                      ) : null}
                    </div>
                    {slot2Event.phone && (
                      <div className="text-xs text-gray-600 mt-1">{slot2Event.phone}</div>
                    )}
                  </div>
                ) : slot2Ghost ? (
                  <div className="text-center w-full">
                    {getGhostContent(slot2Ghost)}
                    <div className="text-gray-400 text-xs mt-1">Click to Book</div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm text-center">
                    Click to Book
                  </div>
                )}
                {/* Overflow badge */}
                {slot2Overflow.length > 0 && (
                  <div className="absolute top-1 right-1" ref={overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 2 ? dropdownRef : null}>
                    <button
                      className="bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverflowDropdown(
                          overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 2
                            ? null
                            : { time: slotConfig.time, slot: 2 }
                        );
                      }}
                      title={`${slot2Overflow.length} more booking(s)`}
                    >
                      +{slot2Overflow.length}
                    </button>
                    {overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 2 && (
                      <div className="absolute top-7 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
                        <div className="px-3 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200">
                          +{slot2Overflow.length} more booking{slot2Overflow.length > 1 ? 's' : ''}
                        </div>
                        {slot2Overflow.map((evt, i) => (
                          <button
                            key={evt.id || i}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowDropdown(null);
                              onEventClick(evt);
                            }}
                          >
                            {getStatusIndicator(evt)}
                            <span className="truncate font-medium">{evt.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Slot 3 */}
              <div
                className={`p-4 ${getCellBackground(slotConfig, slot3Event, slotConfig.time, 3)} ${slotConfig.slot3BorderColor} ${isSlotBlocked(slotConfig.time, 3) || slotConfig.slot3Type === 'blank' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity min-h-[80px] flex items-center justify-center relative`}
                onClick={() => {
                  if (isSlotBlocked(slotConfig.time, 3) || slotConfig.slot3Type === 'blank') return;
                  slot3Event ? onEventClick(slot3Event) : onSlotClick(slotConfig.time, 3, slotConfig);
                }}
              >
                {isSlotBlocked(slotConfig.time, 3) ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-600 flex items-center justify-center">
                      <span className="text-xs">🔒 Blocked</span>
                    </div>
                  </div>
                ) : slotConfig.slot3Type === 'blank' ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-500 flex items-center justify-center">
                      <span className="text-xs">Unavailable</span>
                    </div>
                  </div>
                ) : slot3Event ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-800 flex items-center justify-center">
                      {getStatusIndicator(slot3Event)}
                      <span className="truncate">{slot3Event.name}</span>
                      {(slot3Event.hasUnreadSms || slot3Event.hasUnreadEmail) ? (
                        <span className="relative ml-1.5 flex-shrink-0 animate-pulse">
                          {slot3Event.hasUnreadSms ? (
                            <FiMessageSquare className="inline-block w-4 h-4 text-green-500" />
                          ) : (
                            <FiMail className="inline-block w-4 h-4 text-blue-500" />
                          )}
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-ping" style={{animationDuration: '1.5s'}} />
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                        </span>
                      ) : (slot3Event.hasReceivedSms || slot3Event.hasReceivedEmail) ? (
                        <span className="ml-1.5 flex-shrink-0">
                          {slot3Event.hasReceivedSms ? (
                            <FiMessageSquare className="inline-block w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <FiMail className="inline-block w-3.5 h-3.5 text-gray-400" />
                          )}
                        </span>
                      ) : null}
                    </div>
                    {slot3Event.phone && (
                      <div className="text-xs text-gray-600 mt-1">{slot3Event.phone}</div>
                    )}
                  </div>
                ) : slot3Ghost ? (
                  <div className="text-center w-full">
                    {getGhostContent(slot3Ghost)}
                    <div className="text-gray-400 text-xs mt-1">Click to Book</div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm text-center">
                    Click to Book
                  </div>
                )}
                {/* Overflow badge */}
                {slot3Overflow.length > 0 && (
                  <div className="absolute top-1 right-1" ref={overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 3 ? dropdownRef : null}>
                    <button
                      className="bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverflowDropdown(
                          overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 3
                            ? null
                            : { time: slotConfig.time, slot: 3 }
                        );
                      }}
                      title={`${slot3Overflow.length} more booking(s)`}
                    >
                      +{slot3Overflow.length}
                    </button>
                    {overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 3 && (
                      <div className="absolute top-7 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
                        <div className="px-3 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200">
                          +{slot3Overflow.length} more booking{slot3Overflow.length > 1 ? 's' : ''}
                        </div>
                        {slot3Overflow.map((evt, i) => (
                          <button
                            key={evt.id || i}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowDropdown(null);
                              onEventClick(evt);
                            }}
                          >
                            {getStatusIndicator(evt)}
                            <span className="truncate font-medium">{evt.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Slot 4 */}
              <div
                className={`p-4 ${getCellBackground(slotConfig, slot4Event, slotConfig.time, 4)} ${slotConfig.slot4BorderColor} ${isSlotBlocked(slotConfig.time, 4) || slotConfig.slot4Type === 'blank' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity min-h-[80px] flex items-center justify-center relative`}
                onClick={() => {
                  if (isSlotBlocked(slotConfig.time, 4) || slotConfig.slot4Type === 'blank') return;
                  slot4Event ? onEventClick(slot4Event) : onSlotClick(slotConfig.time, 4, slotConfig);
                }}
              >
                {isSlotBlocked(slotConfig.time, 4) ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-600 flex items-center justify-center">
                      <span className="text-xs">🔒 Blocked</span>
                    </div>
                  </div>
                ) : slotConfig.slot4Type === 'blank' ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-500 flex items-center justify-center">
                      <span className="text-xs">Unavailable</span>
                    </div>
                  </div>
                ) : slot4Event ? (
                  <div className="text-center w-full">
                    <div className="font-semibold text-gray-800 flex items-center justify-center">
                      {getStatusIndicator(slot4Event)}
                      <span className="truncate">{slot4Event.name}</span>
                      {(slot4Event.hasUnreadSms || slot4Event.hasUnreadEmail) ? (
                        <span className="relative ml-1.5 flex-shrink-0 animate-pulse">
                          {slot4Event.hasUnreadSms ? (
                            <FiMessageSquare className="inline-block w-4 h-4 text-green-500" />
                          ) : (
                            <FiMail className="inline-block w-4 h-4 text-blue-500" />
                          )}
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-ping" style={{animationDuration: '1.5s'}} />
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                        </span>
                      ) : (slot4Event.hasReceivedSms || slot4Event.hasReceivedEmail) ? (
                        <span className="ml-1.5 flex-shrink-0">
                          {slot4Event.hasReceivedSms ? (
                            <FiMessageSquare className="inline-block w-3.5 h-3.5 text-gray-400" />
                          ) : (
                            <FiMail className="inline-block w-3.5 h-3.5 text-gray-400" />
                          )}
                        </span>
                      ) : null}
                    </div>
                    {slot4Event.phone && (
                      <div className="text-xs text-gray-600 mt-1">{slot4Event.phone}</div>
                    )}
                  </div>
                ) : slot4Ghost ? (
                  <div className="text-center w-full">
                    {getGhostContent(slot4Ghost)}
                    <div className="text-gray-400 text-xs mt-1">Click to Book</div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-sm text-center">
                    Click to Book
                  </div>
                )}
                {/* Overflow badge */}
                {slot4Overflow.length > 0 && (
                  <div className="absolute top-1 right-1" ref={overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 4 ? dropdownRef : null}>
                    <button
                      className="bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOverflowDropdown(
                          overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 4
                            ? null
                            : { time: slotConfig.time, slot: 4 }
                        );
                      }}
                      title={`${slot4Overflow.length} more booking(s)`}
                    >
                      +{slot4Overflow.length}
                    </button>
                    {overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 4 && (
                      <div className="absolute top-7 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
                        <div className="px-3 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200">
                          +{slot4Overflow.length} more booking{slot4Overflow.length > 1 ? 's' : ''}
                        </div>
                        {slot4Overflow.map((evt, i) => (
                          <button
                            key={evt.id || i}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowDropdown(null);
                              onEventClick(evt);
                            }}
                          >
                            {getStatusIndicator(evt)}
                            <span className="truncate font-medium">{evt.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SlotCalendar;

