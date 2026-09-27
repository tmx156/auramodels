/**
 * Unified Lead Filtering Logic
 * 
 * This module provides consistent filtering logic for both the Leads API and Stats API.
 * The goal is to ensure that the count badges match the displayed leads exactly.
 */

/**
 * Status Filter Configuration
 * Defines how each status filter should work
 */
const STATUS_FILTER_CONFIG = {
  // Simple status filters - just match status field
  'all': {
    type: 'all',
    statusMatch: null, // Matches all
    dateColumn: 'created_at',
    description: 'All leads'
  },
  
  'New': {
    type: 'simple',
    statusMatch: ['New'],
    dateColumn: 'created_at',
    description: 'New leads'
  },
  
  'Assigned': {
    type: 'simple',
    statusMatch: ['Assigned'],
    checkCallStatus: false, // Exclude leads with call_status
    dateColumn: 'assigned_at',
    description: 'Assigned leads without call outcome'
  },
  
  'Booked': {
    type: 'simple',
    statusMatch: ['Booked', 'Cancelled', 'Rejected', 'Attended', 'No Show'],  // Show all leads that were booked
    dateColumn: 'booked_at',
    description: 'Booked leads'
  },
  
  // Special status filters - check status OR booking_status
  'Attended': {
    type: 'special',
    statusMatch: ['Attended'],
    bookingStatusMatch: ['Arrived', 'Left', 'No Sale', 'Complete', 'Review'],
    dateColumn: 'date_booked',
    description: 'Attended leads'
  },
  
  'Cancelled': {
    type: 'special',
    statusMatch: ['Cancelled'],
    bookingStatusMatch: ['Cancel'],
    dateColumn: 'booked_at',
    description: 'Cancelled leads'
  },

  'No Show': {
    type: 'special',
    statusMatch: ['No Show'],
    bookingStatusMatch: ['No Show'],
    dateColumn: 'booked_at',
    description: 'No-show leads'
  },

  'Rejected': {
    type: 'simple',
    statusMatch: ['Rejected'],
    dateColumn: 'assigned_at',
    description: 'Rejected leads'
  },
  
  // Call status filters - check call_status in custom_fields
  'No answer': {
    type: 'call_status',
    callStatusMatch: 'No answer',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'No answer calls'
  },

  'No Answer x2': {
    type: 'call_status',
    callStatusMatch: 'No Answer x2',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'No answer x2 calls'
  },

  'No Answer x3': {
    type: 'call_status',
    callStatusMatch: 'No Answer x3',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'No answer x3 calls'
  },

  'Left Message': {
    type: 'call_status',
    callStatusMatch: 'Left Message',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'Left message calls'
  },

  'Not interested': {
    type: 'call_status',
    callStatusMatch: 'Not interested',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'Not interested calls'
  },

  'Call back': {
    type: 'call_status',
    callStatusMatch: 'Call back',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'Call back scheduled'
  },

  'Wrong number': {
    type: 'call_status',
    callStatusMatch: 'Wrong number',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'Wrong number calls'
  },

  'Not Qualified': {
    type: 'call_status',
    callStatusMatch: 'Not Qualified',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'Not qualified leads'
  },

  'In Progress': {
    type: 'call_status',
    callStatusMatch: 'In Progress',
    excludeProgressed: true,
    dateColumn: 'assigned_at',
    description: 'In progress leads'
  },

  // Sales filter
  'Sales': {
    type: 'has_sale',
    hasSale: true,
    requireBooker: true,
    dateColumn: 'date_booked',
    description: 'Sales leads'
  }
};

/**
 * Progressed statuses - leads with these statuses should not appear in call status filters
 */
const PROGRESSED_STATUSES = ['Booked', 'Attended', 'Cancelled', 'Rejected', 'Sale'];

/**
 * Parse booking_history safely
 * @param {Object|string} bookingHistory 
 * @returns {Array}
 */
function parseBookingHistory(bookingHistory) {
  if (!bookingHistory) return [];
  
  try {
    if (typeof bookingHistory === 'string') {
      return JSON.parse(bookingHistory);
    }
    if (Array.isArray(bookingHistory)) {
      return bookingHistory;
    }
  } catch (e) {
    // Invalid JSON, return empty
  }
  
  return [];
}

/**
 * Get call_status from lead
 * @param {Object} lead 
 * @returns {string|null}
 */
function getCallStatus(lead) {
  // First check call_status column directly
  if (lead.call_status) {
    return lead.call_status;
  }
  
  // Then check custom_fields
  try {
    if (lead.custom_fields) {
      const customFields = typeof lead.custom_fields === 'string'
        ? JSON.parse(lead.custom_fields)
        : lead.custom_fields;
      return customFields?.call_status || null;
    }
  } catch (e) {
    // Parse error
  }
  
  return null;
}

/**
 * Check if a date is within a range
 * @param {string} dateStr 
 * @param {string} startDate 
 * @param {string} endDate 
 * @returns {boolean}
 */
function isDateInRange(dateStr, startDate, endDate) {
  if (!dateStr) return false;
  
  const date = new Date(dateStr);
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return date >= start && date <= end;
}

/**
 * Check if a booking_history entry is within a date range
 * @param {Object} entry 
 * @param {string} startDate 
 * @param {string} endDate 
 * @returns {boolean}
 */
function isHistoryEntryInRange(entry, startDate, endDate) {
  if (!entry?.timestamp) return false;
  return isDateInRange(entry.timestamp, startDate, endDate);
}

/**
 * Check if a lead matches the date filter for a given status
 * @param {Object} lead 
 * @param {Object} config 
 * @param {Object} dateRange 
 * @returns {boolean}
 */
function matchesDateFilter(lead, config, dateRange) {
  if (!dateRange || !dateRange.start || !dateRange.end) {
    return true; // No date filter applied
  }
  
  const { start, end } = dateRange;
  
  switch (config.dateColumn) {
    case 'created_at':
      return isDateInRange(lead.created_at, start, end);
      
    case 'assigned_at':
      return isDateInRange(lead.assigned_at, start, end);
      
    case 'booked_at':
      return isDateInRange(lead.booked_at || lead.assigned_at, start, end);

    case 'date_booked':
      return isDateInRange(lead.date_booked, start, end);
      
    case 'booking_history':
      // For booking_history, we need to check if any relevant history entry 
      // matches the action and is within the date range
      const history = parseBookingHistory(lead.booking_history);
      
      return history.some(entry => {
        // Check if entry is within date range
        if (!isHistoryEntryInRange(entry, start, end)) {
          return false;
        }
        
        // Check if entry action matches what we're looking for
        if (config.type === 'call_status') {
          // For call statuses, look for CALL_STATUS_UPDATE
          return entry.action === 'CALL_STATUS_UPDATE' &&
                 entry.details?.callStatus === config.callStatusMatch;
        }
        
        if (config.type === 'special') {
          // For special statuses, check various actions
          if (entry.action === 'STATUS_CHANGE') {
            return config.statusMatch.includes(entry.details?.newStatus);
          }
          
          if (entry.action === 'BOOKING_STATUS_UPDATE') {
            return config.bookingStatusMatch?.includes(entry.details?.bookingStatus);
          }
          
          if (entry.action === 'CANCELLATION' && config.statusMatch.includes('Cancelled')) {
            return true;
          }
        }
        
        if (config.type === 'simple' && config.statusMatch?.[0] === 'Rejected') {
          return entry.action === 'STATUS_CHANGE' && 
                 entry.details?.newStatus === 'Rejected';
        }
        
        return false;
      });
      
    default:
      return true;
  }
}

/**
 * Check if a lead matches the status filter
 * @param {Object} lead 
 * @param {string} statusFilter 
 * @param {Object} options 
 * @returns {boolean}
 */
function matchesStatusFilter(lead, statusFilter, options = {}) {
  const config = STATUS_FILTER_CONFIG[statusFilter];
  
  if (!config) {
    console.warn(`Unknown status filter: ${statusFilter}`);
    return false;
  }
  
  // 'all' matches everything
  if (config.type === 'all') {
    return true;
  }
  
  // Simple status match
  if (config.type === 'simple') {
    // Check main status
    const matchesStatus = config.statusMatch.includes(lead.status);
    
    if (!matchesStatus) return false;
    
    // For Assigned, optionally exclude leads with call_status
    if (statusFilter === 'Assigned' && config.checkCallStatus !== undefined) {
      const hasCallStatus = getCallStatus(lead);
      if (config.checkCallStatus === false && hasCallStatus) {
        return false; // Exclude leads with call_status
      }
    }
    
    return true;
  }
  
  // Special status - check status OR booking_status
  if (config.type === 'special') {
    const matchesStatus = config.statusMatch.includes(lead.status);
    const matchesBookingStatus = config.bookingStatusMatch?.includes(lead.booking_status);

    if (matchesStatus || matchesBookingStatus) return true;

    // For Attended filter, also check booking_history for past attendance evidence
    // A lead that has ever arrived should always count as attended
    if (statusFilter === 'Attended') {
      const history = parseBookingHistory(lead.booking_history);
      return history.some(entry => {
        if (entry.action === 'STATUS_CHANGE' && config.statusMatch.includes(entry.details?.newStatus)) return true;
        if (entry.action === 'BOOKING_STATUS_UPDATE' && config.bookingStatusMatch?.includes(entry.details?.bookingStatus)) return true;
        return false;
      });
    }

    return false;
  }
  
  // Call status - check custom_fields.call_status
  if (config.type === 'call_status') {
    const callStatus = getCallStatus(lead);
    
    if (callStatus !== config.callStatusMatch) {
      return false;
    }
    
    // Exclude progressed leads if configured
    if (config.excludeProgressed) {
      const hasProgressed = PROGRESSED_STATUSES.includes(lead.status);
      if (hasProgressed) return false;
    }
    
    return true;
  }
  
  // Sales filter
  if (config.type === 'has_sale') {
    if (!lead.has_sale || lead.has_sale <= 0) {
      return false;
    }
    
    if (config.requireBooker && !lead.booker_id) {
      return false;
    }
    
    return true;
  }
  
  return false;
}

/**
 * Filter leads by status and date range
 * @param {Array} leads 
 * @param {string} statusFilter 
 * @param {Object} dateRange 
 * @param {Object} options 
 * @returns {Array}
 */
function filterLeads(leads, statusFilter, dateRange, options = {}) {
  const config = STATUS_FILTER_CONFIG[statusFilter];
  
  if (!config) {
    console.warn(`Unknown status filter: ${statusFilter}`);
    return [];
  }
  
  return leads.filter(lead => {
    // Check status match
    const statusMatch = matchesStatusFilter(lead, statusFilter, options);
    if (!statusMatch) return false;
    
    // Check date match
    const dateMatch = matchesDateFilter(lead, config, dateRange);
    if (!dateMatch) return false;
    
    return true;
  });
}

/**
 * Get the SQL date column for a status filter
 * @param {string} statusFilter 
 * @returns {string|null}
 */
function getSqlDateColumn(statusFilter) {
  const config = STATUS_FILTER_CONFIG[statusFilter];
  
  if (!config) return null;
  
  // For booking_history date columns, we don't apply SQL date filtering
  // because the date in booking_history is different from the SQL column
  if (config.dateColumn === 'booking_history') {
    return null;
  }
  
  return config.dateColumn;
}

/**
 * Get status filter description
 * @param {string} statusFilter 
 * @returns {string}
 */
function getStatusDescription(statusFilter) {
  const config = STATUS_FILTER_CONFIG[statusFilter];
  return config?.description || statusFilter;
}

module.exports = {
  STATUS_FILTER_CONFIG,
  PROGRESSED_STATUSES,
  parseBookingHistory,
  getCallStatus,
  isDateInRange,
  isHistoryEntryInRange,
  matchesDateFilter,
  matchesStatusFilter,
  filterLeads,
  getSqlDateColumn,
  getStatusDescription
};
