import React, { useMemo, useState, useEffect, useRef } from 'react';
import { FiCheckCircle, FiClock, FiMessageSquare, FiMail } from 'react-icons/fi';
import { toLocalDateStr } from '../utils/timeUtils';

// Time slots configuration matching updated schedule
// 🔵 = Male, 🩷 = Female, 💛🔵 = Child/Male (striped), ⚫ = Blank/Unavailable
const TIME_SLOTS = [
  { time: '10:00', slot1Type: 'child-male', slot1Emoji: '💛🔵', slot2Type: 'female', slot2Emoji: '🩷', slot3Type: 'female', slot3Emoji: '🩷', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '10:30', slot1Type: 'child-male', slot1Emoji: '💛🔵', slot2Type: 'child-male', slot2Emoji: '💛🔵', slot3Type: 'child-male', slot3Emoji: '💛🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '11:00', slot1Type: 'female', slot1Emoji: '🩷', slot2Type: 'child-male', slot2Emoji: '💛🔵', slot3Type: 'child-male', slot3Emoji: '💛🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '11:30', slot1Type: 'female', slot1Emoji: '🩷', slot2Type: 'female', slot2Emoji: '🩷', slot3Type: 'female', slot3Emoji: '🩷', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '12:00', slot1Type: 'child-male', slot1Emoji: '💛🔵', slot2Type: 'male', slot2Emoji: '🔵', slot3Type: 'male', slot3Emoji: '🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '12:30', slot1Type: 'female', slot1Emoji: '🩷', slot2Type: 'female', slot2Emoji: '🩷', slot3Type: 'female', slot3Emoji: '🩷', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '13:00', slot1Type: 'female', slot1Emoji: '🩷', slot2Type: 'male', slot2Emoji: '🔵', slot3Type: 'male', slot3Emoji: '🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '13:30', slot1Type: 'female', slot1Emoji: '🩷', slot2Type: 'child-male', slot2Emoji: '💛🔵', slot3Type: 'child-male', slot3Emoji: '💛🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '14:00', slot1Type: 'child-male', slot1Emoji: '💛🔵', slot2Type: 'child-male', slot2Emoji: '💛🔵', slot3Type: 'child-male', slot3Emoji: '💛🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '14:30', slot1Type: 'female', slot1Emoji: '🩷', slot2Type: 'child-male', slot2Emoji: '💛🔵', slot3Type: 'child-male', slot3Emoji: '💛🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '15:00', slot1Type: 'female', slot1Emoji: '🩷', slot2Type: 'female', slot2Emoji: '🩷', slot3Type: 'female', slot3Emoji: '🩷', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '15:30', slot1Type: 'child-male', slot1Emoji: '💛🔵', slot2Type: 'child-male', slot2Emoji: '💛🔵', slot3Type: 'child-male', slot3Emoji: '💛🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '16:00', slot1Type: 'male', slot1Emoji: '🔵', slot2Type: 'male', slot2Emoji: '🔵', slot3Type: 'male', slot3Emoji: '🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' },
  { time: '16:30', slot1Type: 'male', slot1Emoji: '🔵', slot2Type: 'male', slot2Emoji: '🔵', slot3Type: 'male', slot3Emoji: '🔵', slot4Type: 'child-male', slot4Emoji: '💛🔵' }
];

const WeeklySlotCalendar = ({ weekStart, events, blockedSlots = [], onDayClick, onEventClick }) => {
  const [overflowDropdown, setOverflowDropdown] = useState(null); // { dateStr, time, slot }
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
  // Generate 7 days starting from weekStart
  const getDaysOfWeek = () => {
    const days = [];
    const start = new Date(weekStart);
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    
    return days;
  };

  const days = getDaysOfWeek();

  // PERFORMANCE: Index events by date+time+slot once per render — stores ARRAYS
  const eventsBySlot = useMemo(() => {
    if (!events || events.length === 0) return new Map();

    const index = new Map();
    events.forEach(event => {
      if (!event.date_booked) return;
      const eventDateStr = toLocalDateStr(new Date(event.date_booked));
      const key = `${eventDateStr}_${event.time_booked || ''}_${event.booking_slot || 1}`;
      if (!index.has(key)) {
        index.set(key, []);
      }
      index.get(key).push(event);
    });
    return index;
  }, [events]);

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
  const isSlotBlocked = (day, timeSlot = null, slotNumber = null) => {
    const dateStr = toLocalDateStr(day);
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
  const getEventsForDayTimeSlot = (day, time, slot) => {
    const dayStr = toLocalDateStr(day);
    const key = `${dayStr}_${time}_${slot}`;
    return (eventsBySlot.get(key) || []).filter(e => !e.isRescheduledAway);
  };

  // Get primary (first) real event for a slot
  const getEventForDayTimeSlot = (day, time, slot) => {
    const arr = getEventsForDayTimeSlot(day, time, slot);
    return arr.length > 0 ? arr[0] : null;
  };

  // Get a "rescheduled away" ghost marker for a slot (booking that used to be here)
  const getGhostForDayTimeSlot = (day, time, slot) => {
    const dayStr = toLocalDateStr(day);
    const key = `${dayStr}_${time}_${slot}`;
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
      <div className="text-sm text-gray-500 truncate flex items-center gap-0.5" title={`${ghost.name} rescheduled${movedLabel ? ` to ${movedLabel}` : ''}`}>
        <FiClock className="inline-block w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="line-through font-medium">{ghost.name}</span>
        {movedLabel && <span className="not-italic text-xs">→{movedLabel}</span>}
      </div>
    );
  };

  // Get cell content for compact view
  const getCellContent = (event) => {
    if (!event) return null;

    return (
      <div className="text-xs font-medium truncate flex items-center" title={event.name}>
        {event.is_confirmed ? (
          <FiCheckCircle className="inline-block w-3 h-3 text-green-600" />
        ) : (
          <FiClock className="inline-block w-3 h-3 text-orange-500" />
        )}
        {/* Unread received - flashing */}
        {(event.hasUnreadSms || event.hasUnreadEmail) ? (
          <span className="relative ml-0.5 flex-shrink-0 animate-pulse">
            {event.hasUnreadSms ? (
              <FiMessageSquare className="inline-block w-3 h-3 text-green-500" />
            ) : (
              <FiMail className="inline-block w-3 h-3 text-blue-500" />
            )}
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
          </span>
        ) : (event.hasReceivedSms || event.hasReceivedEmail) ? (
          /* Read received - static grey icon */
          <span className="ml-0.5 flex-shrink-0">
            {event.hasReceivedSms ? (
              <FiMessageSquare className="inline-block w-3 h-3 text-gray-400" />
            ) : (
              <FiMail className="inline-block w-3 h-3 text-gray-400" />
            )}
          </span>
        ) : null}
      </div>
    );
  };

  // Get cell background color
  const getCellBackground = (event, day, time, slot) => {
    // Check if slot is blocked first - blocked slots are always grey
    if (isSlotBlocked(day, time, slot)) {
      return 'bg-gray-300 opacity-60'; // Greyed out for blocked slots
    }
    
    if (!event) return 'bg-white';
    
    if (event.has_sale) return 'bg-blue-400';
    if (event.booking_status === 'Review') return 'bg-purple-400'; // Review - purple (matches day view)
    if (event.is_confirmed) return 'bg-green-400';
    if (event.booking_status === 'Arrived') return 'bg-red-400';
    if (event.booking_status === 'Left') return 'bg-gray-400';

    return 'bg-orange-400';
  };

  return (
    <div className="weekly-slot-calendar-container">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          Week of {weekStart.toLocaleDateString('en-GB', { month: 'long', day: 'numeric', year: 'numeric' })}
        </h2>
      </div>

      {/* Compact Weekly Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[1400px]">
          {/* Day Headers */}
          <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-0 border border-gray-300 rounded-lg overflow-hidden bg-white">
            {/* Top-left corner cell */}
            <div className="bg-gray-50 border-r border-b border-gray-300 p-2 font-semibold text-center text-sm">
              TIME
            </div>
            
            {/* Day headers */}
            {days.map((day, index) => {
              const isToday = day.toDateString() === new Date().toDateString();
              // Check for full day block (no time_slot and no slot_number)
              const isDayBlocked = blockedSlots && blockedSlots.some(block => {
                const dateStr = toLocalDateStr(day);
                const blockDateStr = toLocalDateStr(new Date(block.date));
                return blockDateStr === dateStr && !block.time_slot && !block.slot_number;
              });
              
              return (
                <div
                  key={index}
                  className={`bg-gray-50 border-r border-b border-gray-300 p-2 text-center ${
                    isDayBlocked 
                      ? 'bg-gray-300 opacity-60 cursor-not-allowed' 
                      : 'cursor-pointer hover:bg-gray-100'
                  } transition-colors ${
                    index === 6 ? 'border-r-0' : ''
                  } ${isToday && !isDayBlocked ? 'bg-blue-50 font-bold' : ''}`}
                  onClick={() => {
                    if (isDayBlocked) {
                      alert('This day is blocked and cannot be viewed');
                      return;
                    }
                    onDayClick(day);
                  }}
                >
                  <div className="text-xs font-semibold">
                    {day.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
                  </div>
                  <div className={`text-lg ${isToday ? 'text-blue-600' : ''}`}>
                    {day.getDate()}
                  </div>
                  <div className="text-xs text-gray-500 flex justify-center gap-1 items-center">
                    {isDayBlocked ? (
                      <span>🔒 Blocked</span>
                    ) : (
                      <>
                        <span>S1</span>
                        <span>S2</span>
                        <span>S3</span>
                        <span>S4</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Time slot rows */}
            {TIME_SLOTS.map((slotConfig, timeIndex) => (
              <React.Fragment key={slotConfig.time}>
                {/* Time label */}
                <div className={`bg-gray-50 border-r border-gray-300 p-2 text-center text-sm font-medium flex items-center justify-center ${
                  timeIndex === TIME_SLOTS.length - 1 ? '' : 'border-b'
                }`}>
                  {slotConfig.time}
                </div>

                {/* Day columns */}
                {days.map((day, dayIndex) => {
                  const slot1Event = getEventForDayTimeSlot(day, slotConfig.time, 1);
                  const slot2Event = getEventForDayTimeSlot(day, slotConfig.time, 2);
                  const slot3Event = getEventForDayTimeSlot(day, slotConfig.time, 3);
                  const slot4Event = getEventForDayTimeSlot(day, slotConfig.time, 4);
                  const slot1All = getEventsForDayTimeSlot(day, slotConfig.time, 1);
                  const slot2All = getEventsForDayTimeSlot(day, slotConfig.time, 2);
                  const slot3All = getEventsForDayTimeSlot(day, slotConfig.time, 3);
                  const slot4All = getEventsForDayTimeSlot(day, slotConfig.time, 4);
                  const slot1Overflow = slot1All.length > 1 ? slot1All.slice(1) : [];
                  const slot2Overflow = slot2All.length > 1 ? slot2All.slice(1) : [];
                  const slot3Overflow = slot3All.length > 1 ? slot3All.slice(1) : [];
                  const slot4Overflow = slot4All.length > 1 ? slot4All.slice(1) : [];
                  // Rescheduled-away ghost markers (only shown when the slot has no real booking)
                  const slot1Ghost = !slot1Event ? getGhostForDayTimeSlot(day, slotConfig.time, 1) : null;
                  const slot2Ghost = !slot2Event ? getGhostForDayTimeSlot(day, slotConfig.time, 2) : null;
                  const slot3Ghost = !slot3Event ? getGhostForDayTimeSlot(day, slotConfig.time, 3) : null;
                  const slot4Ghost = !slot4Event ? getGhostForDayTimeSlot(day, slotConfig.time, 4) : null;
                  const dayStr = toLocalDateStr(day);

                  return (
                    <div
                      key={`${day.toISOString()}-${slotConfig.time}`}
                      className={`border-r border-gray-300 p-1 ${
                        timeIndex === TIME_SLOTS.length - 1 ? '' : 'border-b'
                      } ${dayIndex === 6 ? 'border-r-0' : ''}`}
                    >
                      <div className="grid grid-cols-4 gap-1 h-full">
                        {/* Slot 1 */}
                        <div
                          className={`compact-cell ${getCellBackground(slot1Event, day, slotConfig.time, 1)} rounded ${isSlotBlocked(day, slotConfig.time, 1) || slotConfig.slot1Type === 'blank' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity flex items-center justify-center border border-gray-200 relative`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSlotBlocked(day, slotConfig.time, 1) || slotConfig.slot1Type === 'blank') return;
                            if (slot1Event) {
                              onEventClick(slot1Event);
                            } else {
                              onDayClick(day, slotConfig.time, 1);
                            }
                          }}
                          title={isSlotBlocked(day, slotConfig.time, 1) ? 'Blocked' : slotConfig.slot1Type === 'blank' ? 'Unavailable' : (slot1Event ? `${slot1Event.name} - Slot 1${slot1Overflow.length ? ` (+${slot1Overflow.length} more)` : ''}` : `Book ${slotConfig.time} Slot 1 (${slotConfig.slot1Type})`)}
                        >
                          {isSlotBlocked(day, slotConfig.time, 1) ? (
                            <span className="text-xs">🔒</span>
                          ) : slot1Event ? getCellContent(slot1Event) : slot1Ghost ? getGhostContent(slot1Ghost) : slotConfig.slot1Emoji && <span className="text-xs">{slotConfig.slot1Emoji}</span>}
                          {/* Overflow badge */}
                          {slot1Overflow.length > 0 && (
                            <div className="absolute -top-1 -right-1" ref={overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 1 ? dropdownRef : null}>
                              <button
                                className="bg-red-500 text-white font-bold rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                                style={{ fontSize: '9px', width: '16px', height: '16px', lineHeight: '16px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOverflowDropdown(
                                    overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 1
                                      ? null
                                      : { dateStr: dayStr, time: slotConfig.time, slot: 1 }
                                  );
                                }}
                                title={`${slot1Overflow.length} more booking(s)`}
                              >
                                +{slot1Overflow.length}
                              </button>
                              {overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 1 && (
                                <div className="absolute top-5 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200">
                                    +{slot1Overflow.length} more
                                  </div>
                                  {slot1Overflow.map((evt, i) => (
                                    <button
                                      key={evt.id || i}
                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 truncate transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOverflowDropdown(null);
                                        onEventClick(evt);
                                      }}
                                    >
                                      {evt.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Slot 2 */}
                        <div
                          className={`compact-cell ${getCellBackground(slot2Event, day, slotConfig.time, 2)} rounded ${isSlotBlocked(day, slotConfig.time, 2) || slotConfig.slot2Type === 'blank' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity flex items-center justify-center border border-gray-200 relative`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSlotBlocked(day, slotConfig.time, 2) || slotConfig.slot2Type === 'blank') return;
                            if (slot2Event) {
                              onEventClick(slot2Event);
                            } else {
                              onDayClick(day, slotConfig.time, 2);
                            }
                          }}
                          title={isSlotBlocked(day, slotConfig.time, 2) ? 'Blocked' : slotConfig.slot2Type === 'blank' ? 'Unavailable' : (slot2Event ? `${slot2Event.name} - Slot 2${slot2Overflow.length ? ` (+${slot2Overflow.length} more)` : ''}` : `Book ${slotConfig.time} Slot 2 (${slotConfig.slot2Type})`)}
                        >
                          {isSlotBlocked(day, slotConfig.time, 2) ? (
                            <span className="text-xs">🔒</span>
                          ) : slot2Event ? getCellContent(slot2Event) : slot2Ghost ? getGhostContent(slot2Ghost) : slotConfig.slot2Emoji && <span className="text-xs">{slotConfig.slot2Emoji}</span>}
                          {/* Overflow badge */}
                          {slot2Overflow.length > 0 && (
                            <div className="absolute -top-1 -right-1" ref={overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 2 ? dropdownRef : null}>
                              <button
                                className="bg-red-500 text-white font-bold rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                                style={{ fontSize: '9px', width: '16px', height: '16px', lineHeight: '16px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOverflowDropdown(
                                    overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 2
                                      ? null
                                      : { dateStr: dayStr, time: slotConfig.time, slot: 2 }
                                  );
                                }}
                                title={`${slot2Overflow.length} more booking(s)`}
                              >
                                +{slot2Overflow.length}
                              </button>
                              {overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 2 && (
                                <div className="absolute top-5 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200">
                                    +{slot2Overflow.length} more
                                  </div>
                                  {slot2Overflow.map((evt, i) => (
                                    <button
                                      key={evt.id || i}
                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 truncate transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOverflowDropdown(null);
                                        onEventClick(evt);
                                      }}
                                    >
                                      {evt.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Slot 3 */}
                        <div
                          className={`compact-cell ${getCellBackground(slot3Event, day, slotConfig.time, 3)} rounded ${isSlotBlocked(day, slotConfig.time, 3) || slotConfig.slot3Type === 'blank' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity flex items-center justify-center border border-gray-200 relative`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSlotBlocked(day, slotConfig.time, 3) || slotConfig.slot3Type === 'blank') return;
                            if (slot3Event) {
                              onEventClick(slot3Event);
                            } else {
                              onDayClick(day, slotConfig.time, 3);
                            }
                          }}
                          title={isSlotBlocked(day, slotConfig.time, 3) ? 'Blocked' : slotConfig.slot3Type === 'blank' ? 'Unavailable' : (slot3Event ? `${slot3Event.name} - Slot 3${slot3Overflow.length ? ` (+${slot3Overflow.length} more)` : ''}` : `Book ${slotConfig.time} Slot 3 (${slotConfig.slot3Type})`)}
                        >
                          {isSlotBlocked(day, slotConfig.time, 3) ? (
                            <span className="text-xs">🔒</span>
                          ) : slot3Event ? getCellContent(slot3Event) : slot3Ghost ? getGhostContent(slot3Ghost) : slotConfig.slot3Emoji && <span className="text-xs">{slotConfig.slot3Emoji}</span>}
                          {/* Overflow badge */}
                          {slot3Overflow.length > 0 && (
                            <div className="absolute -top-1 -right-1" ref={overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 3 ? dropdownRef : null}>
                              <button
                                className="bg-red-500 text-white font-bold rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                                style={{ fontSize: '9px', width: '16px', height: '16px', lineHeight: '16px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOverflowDropdown(
                                    overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 3
                                      ? null
                                      : { dateStr: dayStr, time: slotConfig.time, slot: 3 }
                                  );
                                }}
                                title={`${slot3Overflow.length} more booking(s)`}
                              >
                                +{slot3Overflow.length}
                              </button>
                              {overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 3 && (
                                <div className="absolute top-5 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200">
                                    +{slot3Overflow.length} more
                                  </div>
                                  {slot3Overflow.map((evt, i) => (
                                    <button
                                      key={evt.id || i}
                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 truncate transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOverflowDropdown(null);
                                        onEventClick(evt);
                                      }}
                                    >
                                      {evt.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Slot 4 */}
                        <div
                          className={`compact-cell ${getCellBackground(slot4Event, day, slotConfig.time, 4)} rounded ${isSlotBlocked(day, slotConfig.time, 4) || slotConfig.slot4Type === 'blank' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity flex items-center justify-center border border-gray-200 relative`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSlotBlocked(day, slotConfig.time, 4) || slotConfig.slot4Type === 'blank') return;
                            if (slot4Event) {
                              onEventClick(slot4Event);
                            } else {
                              onDayClick(day, slotConfig.time, 4);
                            }
                          }}
                          title={isSlotBlocked(day, slotConfig.time, 4) ? 'Blocked' : slotConfig.slot4Type === 'blank' ? 'Unavailable' : (slot4Event ? `${slot4Event.name} - Slot 4${slot4Overflow.length ? ` (+${slot4Overflow.length} more)` : ''}` : `Book ${slotConfig.time} Slot 4 (${slotConfig.slot4Type})`)}
                        >
                          {isSlotBlocked(day, slotConfig.time, 4) ? (
                            <span className="text-xs">🔒</span>
                          ) : slot4Event ? getCellContent(slot4Event) : slot4Ghost ? getGhostContent(slot4Ghost) : slotConfig.slot4Emoji && <span className="text-xs">{slotConfig.slot4Emoji}</span>}
                          {/* Overflow badge */}
                          {slot4Overflow.length > 0 && (
                            <div className="absolute -top-1 -right-1" ref={overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 4 ? dropdownRef : null}>
                              <button
                                className="bg-red-500 text-white font-bold rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                                style={{ fontSize: '9px', width: '16px', height: '16px', lineHeight: '16px' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOverflowDropdown(
                                    overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 4
                                      ? null
                                      : { dateStr: dayStr, time: slotConfig.time, slot: 4 }
                                  );
                                }}
                                title={`${slot4Overflow.length} more booking(s)`}
                              >
                                +{slot4Overflow.length}
                              </button>
                              {overflowDropdown?.dateStr === dayStr && overflowDropdown?.time === slotConfig.time && overflowDropdown?.slot === 4 && (
                                <div className="absolute top-5 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
                                  <div className="px-2 py-1 text-xs font-semibold text-gray-500 border-b border-gray-200">
                                    +{slot4Overflow.length} more
                                  </div>
                                  {slot4Overflow.map((evt, i) => (
                                    <button
                                      key={evt.id || i}
                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 truncate transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOverflowDropdown(null);
                                        onEventClick(evt);
                                      }}
                                    >
                                      {evt.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs">
            <div className="flex items-center">
              <span className="mr-2">🔵</span>
              <span>Male</span>
            </div>
            <div className="flex items-center">
              <span className="mr-2">🩷</span>
              <span>Female</span>
            </div>
            <div className="flex items-center">
              <span className="mr-2">💛</span>
              <span>Family</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-400 rounded mr-2"></div>
              <span>Confirmed</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-orange-400 rounded mr-2"></div>
              <span>Unconfirmed</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-400 rounded mr-2"></div>
              <span>Sale</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeeklySlotCalendar;

