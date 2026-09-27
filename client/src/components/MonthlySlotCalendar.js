import React, { useMemo } from 'react';
import { FiCheckCircle, FiClock, FiMessageSquare, FiMail } from 'react-icons/fi';
import { toLocalDateStr } from '../utils/timeUtils';

// Get status color for a booking (matches SlotCalendar colors)
const getStatusColor = (event) => {
  // PRIORITY ORDER: Sale > Booking Status > Confirmation Status
  if (event.has_sale) return 'bg-blue-300'; // Sale made

  // Check booking_status FIRST (these override confirmation status)
  if (event.booking_status === 'Arrived') return 'bg-blue-400'; // Arrived - VIVID BLUE
  if (event.booking_status === 'Left') return 'bg-gray-400'; // Left - gray
  if (event.booking_status === 'No Show') return 'bg-red-400'; // No Show - BRIGHT RED
  if (event.booking_status === 'No Sale') return 'bg-red-300'; // No Sale - red
  if (event.booking_status === 'Review') return 'bg-purple-400'; // Review - purple
  if (event.booking_status === 'Reschedule') return 'bg-yellow-400'; // Reschedule - yellow

  // Then check confirmation status
  if (event.is_double_confirmed == 1) return 'bg-green-500'; // Double Confirmed - VIVID DARK GREEN
  if (event.is_confirmed == 1) return 'bg-green-400'; // Confirmed - BRIGHT GREEN

  return 'bg-orange-300'; // Unconfirmed - orange
};

// Get text color based on background
const getTextColor = (event) => {
  const bgColor = getStatusColor(event);
  // Use white text for darker backgrounds
  if (bgColor.includes('500') || bgColor.includes('400')) return 'text-white';
  return 'text-gray-800';
};

const MonthlySlotCalendar = ({ currentDate, events, blockedSlots = [], onDayClick, onEventClick }) => {
  // PERFORMANCE: Index events by date once per render instead of filtering repeatedly
  const eventsByDate = useMemo(() => {
    if (!events || events.length === 0) return new Map();
    
    const index = new Map();
    events.forEach(event => {
      if (!event.date_booked) return;
      if (event.isRescheduledAway) return; // ghosts don't count toward monthly totals
      const dateStr = toLocalDateStr(new Date(event.date_booked));
      if (!index.has(dateStr)) {
        index.set(dateStr, []);
      }
      index.get(dateStr).push(event);
    });
    return index;
  }, [events]);

  // Get days in month
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Get day of week for first day (0 = Sunday, 1 = Monday, etc.)
    const firstDayOfWeek = firstDay.getDay();
    const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Adjust so Monday = 0
    
    const daysInMonth = lastDay.getDate();
    
    // Create array of days
    const days = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < adjustedFirstDay; i++) {
      days.push(null);
    }
    
    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  // Get bookings for a specific day - OPTIMIZED: Use pre-indexed map instead of filtering
  const getBookingsForDay = (day) => {
    if (!day) return { slot1: [], slot2: [], slot3: [], slot4: [] };

    const dayStr = toLocalDateStr(day);
    const dayBookings = eventsByDate.get(dayStr) || [];

    const slot1 = dayBookings.filter(e => e.booking_slot === 1);
    const slot2 = dayBookings.filter(e => e.booking_slot === 2);
    const slot3 = dayBookings.filter(e => e.booking_slot === 3);
    const slot4 = dayBookings.filter(e => e.booking_slot === 4);

    return { slot1, slot2, slot3, slot4 };
  };

  // Get booking count summary for a day
  const getBookingSummary = (day) => {
    const { slot1, slot2, slot3, slot4 } = getBookingsForDay(day);
    const allBookings = [...slot1, ...slot2, ...slot3, ...slot4];
    const total = allBookings.length;
    const confirmed = allBookings.filter(e => e.is_confirmed).length;

    // Message stats
    const unreadSms = allBookings.filter(e => e.hasUnreadSms).length;
    const unreadEmail = allBookings.filter(e => e.hasUnreadEmail).length;
    const readSms = allBookings.filter(e => e.hasReceivedSms && !e.hasUnreadSms).length;
    const readEmail = allBookings.filter(e => e.hasReceivedEmail && !e.hasUnreadEmail).length;

    return { total, confirmed, slot1Count: slot1.length, slot2Count: slot2.length, slot3Count: slot3.length, slot4Count: slot4.length, unreadSms, unreadEmail, readSms, readEmail };
  };

  // Check if a day is fully blocked (entire day blocked, not just specific time slots)
  const isDayFullyBlocked = (day) => {
    if (!day || !blockedSlots || blockedSlots.length === 0) return false;
    
    const dateStr = toLocalDateStr(day);

    // Check if there's a full day block (no time_slot specified)
    return blockedSlots.some(block => {
      const blockDateStr = toLocalDateStr(new Date(block.date));
      // Full day block: date matches AND no time_slot AND no slot_number (blocks all slots for entire day)
      return blockDateStr === dateStr && !block.time_slot && !block.slot_number;
    });
  };

  const days = getDaysInMonth();
  const monthName = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="monthly-slot-calendar-container">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">{monthName}</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-orange-300 rounded mr-1"></div>
            <span>Unconfirmed</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-400 rounded mr-1"></div>
            <span>Confirmed</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded mr-1"></div>
            <span>Double ✓✓</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-400 rounded mr-1"></div>
            <span>Arrived</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-red-400 rounded mr-1"></div>
            <span>No Show</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-purple-400 rounded mr-1"></div>
            <span>Review</span>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border border-gray-300 rounded-lg overflow-hidden shadow-sm">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-300">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="p-2 text-center font-semibold text-sm text-gray-700 border-r border-gray-200 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            if (!day) {
              // Empty cell for days before month starts
              return (
                <div
                  key={`empty-${index}`}
                  className="min-h-[100px] border-r border-b border-gray-200 bg-gray-50"
                />
              );
            }

            const { total, confirmed, slot1Count, slot2Count, slot3Count, slot4Count, unreadSms, unreadEmail, readSms, readEmail } = getBookingSummary(day);
            const isToday = day.toDateString() === today.toDateString();
            const isPast = day < today;
            const { slot1, slot2, slot3, slot4 } = getBookingsForDay(day);
            const isBlocked = isDayFullyBlocked(day);

            return (
              <div
                key={day.toISOString()}
                className={`min-h-[100px] border-r border-b border-gray-200 p-2 ${
                  isBlocked 
                    ? 'bg-gray-300 opacity-60 cursor-not-allowed' 
                    : 'cursor-pointer hover:bg-gray-50'
                } transition-colors ${
                  isToday && !isBlocked ? 'bg-blue-50 border-2 border-blue-500' : ''
                } ${isPast && !isBlocked ? 'bg-gray-50' : ''}`}
                onClick={() => {
                  if (isBlocked) {
                    alert('This day is blocked and cannot be viewed');
                    return;
                  }
                  onDayClick(day);
                }}
              >
                {/* Day Number */}
                <div className={`text-sm font-semibold mb-2 flex items-center justify-between ${
                  isBlocked ? 'text-gray-600' : isToday ? 'text-blue-600' : isPast ? 'text-gray-400' : 'text-gray-700'
                }`}>
                  <span>{day.getDate()}</span>
                  {isBlocked && <span className="text-xs">🔒</span>}
                </div>

                {/* Booking Summary */}
                {total > 0 && (
                  <div className="space-y-1">
                    {/* Slot 1 Bookings */}
                    {slot1Count > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">S1: {slot1Count}</span>
                      </div>
                    )}
                    
                    {/* Slot 2 Bookings */}
                    {slot2Count > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">S2: {slot2Count}</span>
                      </div>
                    )}

                    {/* Slot 3 Bookings */}
                    {slot3Count > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">S3: {slot3Count}</span>
                      </div>
                    )}

                    {/* Slot 4 Bookings */}
                    {slot4Count > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                        <span className="text-xs text-gray-600">S4: {slot4Count}</span>
                      </div>
                    )}

                    {/* Confirmed Count */}
                    {confirmed > 0 && (
                      <div className="flex items-center gap-1">
                        <FiCheckCircle className="w-3 h-3 text-green-600" />
                        <span className="text-xs text-green-600">{confirmed}</span>
                      </div>
                    )}

                    {/* Show first few booking names with status colors */}
                    <div className="mt-1 space-y-0.5">
                      {[...slot1, ...slot2, ...slot3, ...slot4].slice(0, 3).map((event, idx) => (
                        <div
                          key={event.id}
                          className={`text-xs truncate px-1.5 py-0.5 rounded cursor-pointer transition-all hover:opacity-80 ${getStatusColor(event)} ${getTextColor(event)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(event);
                          }}
                          title={`${event.name} - ${event.booking_status || (event.is_double_confirmed == 1 ? 'Double Confirmed' : event.is_confirmed == 1 ? 'Confirmed' : 'Unconfirmed')}`}
                        >
                          {event.time_booked ? `${event.time_booked.slice(0,5)} ` : ''}{event.name?.split(' ')[0]}
                          {/* Unread received - flashing */}
                          {event.hasUnreadSms ? (
                            <FiMessageSquare className="inline-block w-2.5 h-2.5 text-green-500 ml-0.5 animate-pulse" />
                          ) : event.hasUnreadEmail ? (
                            <FiMail className="inline-block w-2.5 h-2.5 text-blue-500 ml-0.5 animate-pulse" />
                          ) : event.hasReceivedSms ? (
                            <FiMessageSquare className="inline-block w-2.5 h-2.5 text-gray-400 ml-0.5" />
                          ) : event.hasReceivedEmail ? (
                            <FiMail className="inline-block w-2.5 h-2.5 text-gray-400 ml-0.5" />
                          ) : null}
                        </div>
                      ))}
                      {/* Footer row: "+X more" and message badges */}
                      {(total > 3 || unreadSms > 0 || unreadEmail > 0 || readSms > 0 || readEmail > 0) && (
                        <div className="flex flex-wrap md:flex-nowrap items-center gap-1 md:gap-1.5 mt-0.5">
                          {total > 3 && (
                            <span className="text-xs text-gray-500 font-medium mr-auto">+{total - 3} more</span>
                          )}
                          {unreadSms > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-100 px-1 py-0.5 rounded animate-pulse" title={`${unreadSms} unread SMS`}>
                              <FiMessageSquare className="w-2.5 h-2.5" />{unreadSms}
                            </span>
                          )}
                          {unreadEmail > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700 bg-blue-100 px-1 py-0.5 rounded animate-pulse" title={`${unreadEmail} unread emails`}>
                              <FiMail className="w-2.5 h-2.5" />{unreadEmail}
                            </span>
                          )}
                          {readSms > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-100 px-1 py-0.5 rounded" title={`${readSms} read SMS`}>
                              <FiMessageSquare className="w-2.5 h-2.5" />{readSms}
                            </span>
                          )}
                          {readEmail > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 bg-gray-100 px-1 py-0.5 rounded" title={`${readEmail} read emails`}>
                              <FiMail className="w-2.5 h-2.5" />{readEmail}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty day indicator - removed text */}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MonthlySlotCalendar;

