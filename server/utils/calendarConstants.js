const ALL_TIME_SLOTS = [
  { time: '10:00', label: '10:00 AM' },
  { time: '10:30', label: '10:30 AM' },
  { time: '11:00', label: '11:00 AM' },
  { time: '11:30', label: '11:30 AM' },
  { time: '12:00', label: '12:00 PM' },
  { time: '12:30', label: '12:30 PM' },
  { time: '13:00', label: '1:00 PM' },
  { time: '13:30', label: '1:30 PM' },
  { time: '14:00', label: '2:00 PM' },
  { time: '14:30', label: '2:30 PM' },
  { time: '15:00', label: '3:00 PM' },
  { time: '15:30', label: '3:30 PM' },
  { time: '16:00', label: '4:00 PM' },
  { time: '16:30', label: '4:30 PM' },
];

const MAX_PARALLEL_SLOTS = 4;

async function getAvailableSlots(date, supabase) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

  const { data: bookedLeads, error: bookedError } = await supabase
    .from('leads')
    .select('date_booked, time_booked, booking_slot')
    .eq('date_booked', dateStr)
    .in('status', ['Booked', 'Confirmed'])
    .neq('postcode', 'ZZGHOST');

  if (bookedError) {
    console.error('Error fetching booked leads:', bookedError);
  }

  const { data: blockedSlots, error: blockedError } = await supabase
    .from('blocked_slots')
    .select('date, time_slot, slot_number')
    .eq('date', dateStr);

  if (blockedError) {
    console.error('Error fetching blocked slots:', blockedError);
  }

  const isFullDayBlocked = (blockedSlots || []).some(b => !b.time_slot && !b.slot_number);
  if (isFullDayBlocked) {
    return ALL_TIME_SLOTS.map(slot => ({
      time: slot.time,
      label: slot.label,
      available: 0,
      duration: 30
    }));
  }

  return ALL_TIME_SLOTS.map(slot => {
    let availableCount = MAX_PARALLEL_SLOTS;

    for (let slotNum = 1; slotNum <= MAX_PARALLEL_SLOTS; slotNum++) {
      const isBooked = (bookedLeads || []).some(
        l => l.time_booked === slot.time && parseInt(l.booking_slot) === slotNum
      );

      const isBlocked = (blockedSlots || []).some(b => {
        if (!b.time_slot && b.slot_number === slotNum) return true;
        if (b.time_slot === slot.time && !b.slot_number) return true;
        if (b.time_slot === slot.time && b.slot_number === slotNum) return true;
        return false;
      });

      if (isBooked || isBlocked) {
        availableCount--;
      }
    }

    return {
      time: slot.time,
      label: slot.label,
      available: availableCount,
      duration: 30
    };
  });
}

function findFirstAvailableSlotNumber(bookedLeads, blockedSlots, time) {
  for (let slotNum = 1; slotNum <= MAX_PARALLEL_SLOTS; slotNum++) {
    const isBooked = (bookedLeads || []).some(
      l => l.time_booked === time && parseInt(l.booking_slot) === slotNum
    );

    const isBlocked = (blockedSlots || []).some(b => {
      if (!b.time_slot && b.slot_number === slotNum) return true;
      if (b.time_slot === time && !b.slot_number) return true;
      if (b.time_slot === time && b.slot_number === slotNum) return true;
      return false;
    });

    if (!isBooked && !isBlocked) {
      return slotNum;
    }
  }
  return null;
}

module.exports = {
  ALL_TIME_SLOTS,
  MAX_PARALLEL_SLOTS,
  getAvailableSlots,
  findFirstAvailableSlotNumber
};
