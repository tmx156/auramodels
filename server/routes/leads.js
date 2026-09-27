const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const dbManager = require('../database-connection-manager');
const { auth, adminAuth } = require('../middleware/auth');
const { analyseLeads } = require('../utils/leadAnalysis');
const MessagingService = require('../utils/messagingService');
const { sendSMS, sendAppointmentReminder, sendStatusUpdate, sendCustomMessage } = require('../utils/smsService');
const emailAccountService = require('../utils/emailAccountService');
const { v4: uuidv4 } = require('uuid'); // Added for UUID generation
const { generateBookingCode, getBookingUrl } = require('../utils/bookingCodeGenerator');
const {
  filterLeads,
  getSqlDateColumn,
  matchesStatusFilter,
  matchesDateFilter,
  parseBookingHistory,
  STATUS_FILTER_CONFIG
} = require('../utils/leadFilters');

// Supabase configuration - use singleton client to prevent connection leaks
const { getSupabaseClient } = require('../config/supabase-client');
const supabase = getSupabaseClient();

// IMPORTANT: Diary updates should only be triggered by registered users manually
// All upload processes create leads with status 'New' and no dateBooked to prevent
// automatic diary updates. Only manual status changes by users should update the diary.

const router = express.Router();

// Helper: Parse a CSV line respecting quoted fields (handles commas inside quotes)
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
};

// Helper: Normalize phone number for consistent comparison across all duplicate checks
// Strips all non-digits, removes UK country code (44), removes leading 0, returns core digits
const normalizePhone = (phone) => {
  if (!phone) return '';
  let digits = phone.toString().replace(/[^0-9]/g, '');
  if (digits.startsWith('44') && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};

// Helper: Parse UK date to ISO string using UTC (avoids timezone shifting)
// Returns { value, warning } so callers can surface parse failures to the user
const parseEntryDateToISO = (raw) => {
  if (!raw) return { value: null, warning: null };
  const str = raw.toString().trim();
  if (!str) return { value: null, warning: null };

  // Try DD/MM/YYYY or DD-MM-YYYY (with optional HH:MM)
  const ukMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (ukMatch) {
    const [, day, month, year, hours, minutes] = ukMatch;
    const d = parseInt(day), m = parseInt(month), y = parseInt(year);
    // Validate day/month ranges
    if (m < 1 || m > 12) return { value: null, warning: `Invalid month (${m}) in date "${str}"` };
    if (d < 1 || d > 31) return { value: null, warning: `Invalid day (${d}) in date "${str}"` };
    const date = new Date(Date.UTC(y, m - 1, d, parseInt(hours || 0), parseInt(minutes || 0)));
    // Check the date didn't roll over (e.g. 31/02 becomes March)
    if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
      return { value: null, warning: `Invalid date "${str}" (day doesn't exist in that month)` };
    }
    return { value: date.toISOString(), warning: null };
  }

  // Fallback: try native JS date parsing
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return { value: parsed.toISOString(), warning: null };
  }

  return { value: null, warning: `Could not parse date "${str}"` };
};

// Helper: Clean up stale preview files older than 1 hour
const cleanupStalePreviewFiles = (uploadDir) => {
  try {
    if (!fs.existsSync(uploadDir)) return;
    const files = fs.readdirSync(uploadDir).filter(f => f.startsWith('preview-') && f.endsWith('.json'));
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < oneHourAgo) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Cleaned up stale preview file: ${file}`);
      }
    }
  } catch (e) {
    // Non-fatal
  }
};

// Helper function to wrap promises with timeout
const withTimeout = (promise, timeoutMs, operationName = 'Operation') => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).catch((error) => {
    console.error(`❌ ${operationName} error:`, error.message);
    // Return null on error so booking still succeeds
    return null;
  });
};

// TIMEZONE FIX: Helper function to preserve local time when saving to database
const preserveLocalTime = (dateString) => {
  if (!dateString) return null;
  
  // For calendar bookings, the frontend sends a pre-formatted ISO string
  // that already represents the local time we want to store
  // Just return it as-is to avoid any timezone conversions
  
  console.log('🕐 Timezone Fix: Using date as-is from frontend:', {
    input: dateString,
    stored: dateString
  });
  
  return dateString;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `leads-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    console.log('🔍 File validation:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      fieldname: file.fieldname
    });
    
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/csv',
      'text/plain' // Some systems report CSV as text/plain
    ];
    
    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const hasValidExtension = allowedExtensions.some(ext => 
      file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (allowedTypes.includes(file.mimetype) || hasValidExtension) {
      console.log('✅ File accepted:', file.originalname);
      cb(null, true);
    } else {
      console.log('❌ File rejected:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        reason: 'Invalid file type or extension'
      });
      cb(new Error('Invalid file type. Please upload CSV or Excel files only.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Helper function to safely parse booking history JSON
const safeParseBookingHistory = (bookingHistory) => {
  if (!bookingHistory) return [];
  
  try {
    if (typeof bookingHistory === 'string') {
      return JSON.parse(bookingHistory);
    }
    if (Array.isArray(bookingHistory)) {
      return bookingHistory;
    }
    return [];
  } catch (error) {
    console.warn('⚠️ Invalid booking_history JSON, using empty array:', error.message);
    return [];
  }
};

// Helper function to add booking history entry
const addBookingHistoryEntry = async (leadId, action, performedBy, performedByName, details, leadSnapshot) => {
  try {
    const historyEntry = {
      action,
      timestamp: new Date(),
      performedBy,
      performedByName,
      details: details || {},
      leadSnapshot: leadSnapshot || {}
    };

    // Fetch current booking history from Supabase
    const leadResult = await dbManager.query('leads', {
      select: 'booking_history',
      eq: { id: leadId }
    });
    const lead = leadResult.length > 0 ? leadResult[0] : null;
    const currentHistory = safeParseBookingHistory(lead?.booking_history);
    const updatedHistory = [...currentHistory, historyEntry];
    
    // Update booking_history as JSON string
    await dbManager.update('leads', { booking_history: JSON.stringify(updatedHistory) }, { id: leadId });
    console.log(`📅 Booking history added: ${action} for lead ${leadId} by ${performedByName}`);
    return true;
  } catch (error) {
    console.error('Error adding booking history:', error);
    return false;
  }
};

// Helper function to create lead snapshot
const createLeadSnapshot = (lead) => {
  return {
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    status: lead.status,
    date_booked: lead.date_booked
  };
};

// Helper function to update user statistics
const updateUserStatistics = async (userId, statusChange) => {
  if (!userId) return;
  try {
    const user = await dbManager.query('users', {
      select: '*',
      eq: { id: userId }
    });
    
    if (!user || user.length === 0) return;
    
    const userData = user[0];
    const updateFields = {};
    
    if (statusChange.from !== statusChange.to) {
      if (statusChange.to === 'Booked') {
        updateFields.bookings_made = (userData.bookings_made || 0) + 1;
      }
      if (statusChange.to === 'Attended') {
        updateFields.show_ups = (userData.show_ups || 0) + 1;
      }
      // ✅ BOOKING HISTORY FIX: Don't decrement bookings_made on cancellation
      // Cancelled bookings should remain in stats to track booking performance accurately
      // if (statusChange.from === 'Booked' && statusChange.to === 'Cancelled') {
      //   updateFields.bookings_made = Math.max((userData.bookings_made || 0) - 1, 0);
      // }
    }
    
    if (Object.keys(updateFields).length > 0) {
      await dbManager.update('users', updateFields, { id: userId });
      console.log(`📊 Updated stats for user ${userData.name}: bookings=${updateFields.bookings_made || userData.bookings_made}, showUps=${updateFields.show_ups || userData.show_ups}`);
    }
  } catch (error) {
    console.error('Error updating user statistics:', error);
  }
};

// Helper function to mark all received messages as read when user replies
const markAllReceivedMessagesAsRead = async (leadId) => {
  try {
    // Mark in messages table (primary source for calendar badges)
    const { error: msgErr } = await supabase
      .from('messages')
      .update({ read_status: true })
      .eq('lead_id', leadId)
      .in('status', ['received', 'delivered'])
      .eq('read_status', false);

    if (msgErr) {
      console.warn('⚠️ Failed to mark messages as read in messages table:', msgErr.message);
    } else {
      console.log(`📖 Marked all received messages as read for lead ${leadId}`);
    }

    // Also update legacy booking_history field on leads table
    const lead = await dbManager.query('leads', {
      select: 'booking_history',
      eq: { id: leadId }
    });

    if (!lead || lead.length === 0 || !lead[0].booking_history) {
      return;
    }

    const history = JSON.parse(lead[0].booking_history);
    let hasChanges = false;

    const updatedHistory = history.map(entry => {
      if (entry.action === 'SMS_RECEIVED' && !entry.details?.read) {
        hasChanges = true;
        return {
          ...entry,
          details: {
            ...entry.details,
            read: true
          }
        };
      }
      return entry;
    });

    if (hasChanges) {
      await dbManager.update('leads', {
        booking_history: JSON.stringify(updatedHistory),
        updated_at: new Date().toISOString()
      }, { id: leadId });
    }
  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
};

// Helper function to detect HTML links in column values
const detectHtmlLinks = (columnData) => {
  if (!columnData || !Array.isArray(columnData)) return false;
  
  // Check if any value in the column contains HTML/website links
  return columnData.some(value => {
    if (!value || typeof value !== 'string') return false;
    
    const str = value.toLowerCase();
    // Check for various HTML link patterns
    return str.includes('http://') || 
           str.includes('https://') || 
           str.includes('www.') ||
           str.includes('<a ') ||
           str.includes('href=') ||
           str.includes('.com') ||
           str.includes('.org') ||
           str.includes('.net') ||
           str.includes('.co.uk');
  });
};

// Helper function for more permissive column filtering
const filterValidColumns = (leads) => {
  if (!leads || leads.length === 0) return {};
  
  const columnData = {};
  const sampleSize = Math.min(leads.length, 20); // Check first 20 rows for pattern detection
  
  // Extract column data for analysis
  Object.keys(leads[0] || {}).forEach(key => {
    columnData[key] = leads.slice(0, sampleSize).map(lead => lead[key]);
  });
  
  // More permissive filtering - include all columns with data
  const validColumns = {};
  Object.keys(columnData).forEach(key => {
    const hasData = columnData[key].some(value => value && value.toString().trim());
    if (hasData) {
      validColumns[key] = true;
      console.log(`✅ Including column "${key}" - contains data`);
    } else {
      console.log(`❌ Excluding column "${key}" - no data detected`);
    }
  });
  
  return validColumns;
};

// Helper function to detect data type
const detectDataType = (values) => {
  const nonEmptyValues = values.filter(v => v && v.toString().trim());
  if (nonEmptyValues.length === 0) return 'empty';
  
  // Check if all values are numbers
  const allNumbers = nonEmptyValues.every(v => !isNaN(parseFloat(v)));
  if (allNumbers) return 'number';
  
  // Check if values look like phone numbers
  const phonePattern = /^[\d\s\-\+\(\)]+$/;
  const allPhones = nonEmptyValues.every(v => phonePattern.test(v.toString()));
  if (allPhones && nonEmptyValues.some(v => v.toString().length >= 7)) return 'phone';
  
  // Check if values look like emails
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mostEmails = nonEmptyValues.filter(v => emailPattern.test(v.toString())).length > nonEmptyValues.length * 0.7;
  if (mostEmails) return 'email';
  
  // Check if values look like URLs
  const urlPattern = /^(https?:\/\/|www\.)/i;
  const mostUrls = nonEmptyValues.filter(v => urlPattern.test(v.toString())).length > nonEmptyValues.length * 0.7;
  if (mostUrls) return 'url';
  
  return 'text';
};

// Helper function to check if values look like names
const looksLikeNames = (values) => {
  if (!values || values.length === 0) return false;
  
  // Names typically have letters, spaces, maybe hyphens
  const namePattern = /^[a-zA-Z\s\-'\.]+$/;
  const validNames = values.filter(v => {
    const str = v.toString().trim();
    return str.length >= 2 && str.length <= 50 && namePattern.test(str);
  });
  
  // If more than 70% look like names, it's probably a name column
  return validNames.length > values.length * 0.7;
};

// @route   GET /api/leads
// @desc    Get all leads with pagination and filters
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, booker, search, created_at_start, created_at_end, assigned_at_start, assigned_at_end, status_changed_at_start, status_changed_at_end, booked_at_start, booked_at_end, date_booked_start, date_booked_end } = req.query;

    // Validate and cap limit - allow higher limit for navigation requests
    const isNavRequest = req.query.nav === 'true';
    const maxLimit = isNavRequest ? 2000 : 100;
    const validatedLimit = Math.min(parseInt(limit) || 50, maxLimit);
    const pageInt = Math.max(parseInt(page) || 1, 1);
    const from = (pageInt - 1) * validatedLimit;
    const to = from + validatedLimit - 1;
    
    // Check if filtering by status change date (for call_status filters)
    const hasStatusChangeDateFilter = status_changed_at_start && status_changed_at_end;
    
    // DEBUG: Log all date filters received
    console.log('🔍 Leads API received date filters:', {
      assigned_at_start, assigned_at_end,
      booked_at_start, booked_at_end,
      date_booked_start, date_booked_end,
      created_at_start, created_at_end,
      status_changed_at_start, status_changed_at_end,
      hasStatusChangeDateFilter
    });

    // Check if we're filtering by call_status (requires JavaScript filtering)
    // Note: Case-sensitive mapping - must match exactly what's in custom_fields.call_status
    const statusToCallStatusMap = {
      'No answer': 'No answer',
      'No Answer x2': 'No Answer x2',
      'No Answer x3': 'No Answer x3',
      'No photo': 'No photo',
      'Left Message': 'Left Message',
      'Not interested': 'Not interested',
      'Call back': 'Call back',  // Database has "Call back" (two words)
      'Wrong number': 'Wrong number',  // Database has "Wrong number" (lowercase 'n')
      'Sales/converted - purchased': 'Sales/converted - purchased',
      'Not Qualified': 'Not Qualified',
      'In Progress': 'In Progress'
    };
    const isCallStatusFilter = status && status !== 'all' && status.toLowerCase() !== 'sales' && statusToCallStatusMap[status];

    // Status filters that need special handling (check both status AND booking_status)
    // Rejected is included because it needs booking_history date filtering when status_changed_at is active
    const specialStatusFilters = ['Attended', 'Cancelled', 'No Show', 'Sales', 'Rejected'];
    const isSpecialStatusFilter = status && specialStatusFilters.includes(status);
    
    // Check if we need JavaScript filtering for date ranges
    // When date filter is applied to certain statuses, we need to fetch all leads and filter in JS
    const needsJsDateFiltering = (status === 'Assigned' && (assigned_at_start || assigned_at_end)) ||
                                  (status === 'Booked' && (booked_at_start || booked_at_end)) ||
                                  (status && status.toLowerCase() === 'sales' && (date_booked_start || date_booked_end));
    
    // Build Supabase queries (data + count) with consistent filters
    // Include custom_fields for call_status filtering
    // For call_status filtering or Assigned/Booked with date filters, we need to fetch more leads 
    // to filter in JavaScript so we don't use range() initially - we'll paginate after filtering
    // Use lightweight select for navigation requests (only need id, name, image for prev/next)
    const navSelect = 'id, name, image_url, status, call_status, booker_id, created_at, assigned_at, custom_fields, postcode, booking_status, date_booked, has_sale, booked_at, booking_history';
    const fullSelect = 'id, name, phone, email, postcode, age, gender, image_url, booker_id, created_by_user_id, updated_by_user_id, status, date_booked, is_confirmed, is_double_confirmed, booking_status, has_sale, created_at, assigned_at, booked_at, custom_fields, call_status, review_date, review_time, review_slot, lead_source, entry_date, booking_history';
    let dataQuery = supabase
      .from('leads')
      .select(isNavRequest ? navSelect : fullSelect, { count: 'exact' })
      .order('created_at', { ascending: false });
    
    // Only apply range for filters that don't need JS filtering
    // call_status filters now use SQL so they can use range() too
    if (!needsJsDateFiltering && !isSpecialStatusFilter) {
      dataQuery = dataQuery.range(from, to);
    }

    let countQuery = supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    // ROLE-BASED ACCESS CONTROL - Apply FIRST to ensure correct filtering
    if (req.user.role === 'admin' || req.user.role === 'viewer') {
      // Admins and viewers can see all leads
      console.log(`👑 Full access: User ${req.user.name} (${req.user.role}) can see all leads`);
    } else if (req.user.role === 'photographer') {
      // Photographers can see booked/attended leads (for photo assignment)
      dataQuery = dataQuery.in('status', ['Booked', 'Attended', 'Sale']);
      countQuery = countQuery.in('status', ['Booked', 'Attended', 'Sale']);
      console.log(`📸 Photographer access: User ${req.user.name} can see booked/attended/sale leads`);
    } else {
      // Bookers can only see leads assigned to them
      dataQuery = dataQuery
        .eq('booker_id', req.user.id)
        .neq('status', 'Rejected');
      countQuery = countQuery
        .eq('booker_id', req.user.id)
        .neq('status', 'Rejected');
      console.log(`🔒 Role-based filtering: User ${req.user.name} (${req.user.role}) can only see their assigned leads`);
    }

    // Filter out ghost bookings (used for stats correction)
    dataQuery = dataQuery.neq('postcode', 'ZZGHOST');
    countQuery = countQuery.neq('postcode', 'ZZGHOST');

    // Apply status filter
    if (status && status !== 'all') {
      if (status && status.toLowerCase() === 'sales') {
        dataQuery = dataQuery.eq('has_sale', 1);
        countQuery = countQuery.eq('has_sale', 1);
      } else {
        // For all users, check both status and call_status (in custom_fields)
        const callStatusValue = statusToCallStatusMap[status];
        
        if (callStatusValue) {
          // Filter by call_status column directly in SQL for performance
          dataQuery = dataQuery
            .eq('call_status', callStatusValue)
            .not('status', 'in', '(Booked,Attended,Cancelled,Rejected,Sale)');
          countQuery = countQuery
            .eq('call_status', callStatusValue)
            .not('status', 'in', '(Booked,Attended,Cancelled,Rejected,Sale)');
          console.log(`📊 Filtering by call_status in SQL: ${callStatusValue}`);
        } else if (isSpecialStatusFilter) {
          // For special status filters (Attended, Cancelled, No Show), we need to check
          // both the status field AND booking_status field
          // Don't apply status filter here - we'll filter after fetching
          console.log(`📊 Filtering by special status: ${status} (will filter after fetch, then paginate)`);
        } else if (status === 'Assigned') {
          // OPTION B: For "Assigned" status, we show leads based on assigned_at date
          // regardless of current status. This allows seeing leads that were assigned
          // on a specific date even if they've since been booked/attended/etc.
          // No SQL status filter - we'll filter by assigned_at date only
          console.log(`📊 Filtering by assigned_at date (Option B) - showing all leads assigned in date range`);
        } else if (status === 'Booked') {
          // Show ALL leads that were ever booked (have date_booked set)
          // This includes leads now Cancelled, Attended, No Show, etc.
          dataQuery = dataQuery.not('date_booked', 'is', null);
          countQuery = countQuery.not('date_booked', 'is', null);
          console.log(`📊 Filtering Booked - showing all leads with date_booked set`);
        } else {
          // Standard status filter (New, etc.)
          dataQuery = dataQuery.eq('status', status);
          countQuery = countQuery.eq('status', status);
        }
      }
    }

    // Optional: filter by specific booker if provided
    if (booker) {
      dataQuery = dataQuery.eq('booker_id', booker);
      countQuery = countQuery.eq('booker_id', booker);
    }
    
    // Apply search filter across multiple fields
    if (search && String(search).trim().length > 0) {
      const term = String(search).trim();
      // Escape special characters that could break the ILIKE pattern
      const escapedTerm = term.replace(/[%_\\]/g, '\\$&');
      const like = `%${escapedTerm}%`;
      // Use OR across common searchable columns
      const orExpr = [
        `name.ilike.${like}`,
        `phone.ilike.${like}`,
        `parent_phone.ilike.${like}`,
        `email.ilike.${like}`,
        `postcode.ilike.${like}`
      ].join(',');
      dataQuery = dataQuery.or(orExpr);
      countQuery = countQuery.or(orExpr);
      console.log(`🔍 Search filter applied across name/phone/parent_phone/email/postcode: ${term} (page ${pageInt})`);
    }

    // Apply date range filters based on the type of date parameter sent
    if (assigned_at_start && assigned_at_end) {
      // For All/Assigned statuses - filter by when the lead was assigned
      dataQuery = dataQuery
        .gte('assigned_at', assigned_at_start)
        .lte('assigned_at', assigned_at_end);
      countQuery = countQuery
        .gte('assigned_at', assigned_at_start)
        .lte('assigned_at', assigned_at_end);
      console.log(`📅 Assigned date filter applied: ${assigned_at_start} to ${assigned_at_end}`);
    } else if (booked_at_start && booked_at_end) {
      // For Booked/Cancelled/No Show - filter by booked_at, fallback to assigned_at when booked_at is NULL
      // Only include leads that actually have date_booked (were actually booked)
      const bookedOrFilter = `and(booked_at.gte.${booked_at_start},booked_at.lte.${booked_at_end}),and(booked_at.is.null,date_booked.not.is.null,assigned_at.gte.${booked_at_start},assigned_at.lte.${booked_at_end})`;
      dataQuery = dataQuery.or(bookedOrFilter);
      countQuery = countQuery.or(bookedOrFilter);
      console.log(`📅 Booked_at/assigned_at OR filter applied: ${booked_at_start} to ${booked_at_end}`);
    } else if (date_booked_start && date_booked_end) {
      // For Sales - filter by date_booked (appointment date on calendar)
      dataQuery = dataQuery
        .gte('date_booked', date_booked_start)
        .lte('date_booked', date_booked_end);
      countQuery = countQuery
        .gte('date_booked', date_booked_start)
        .lte('date_booked', date_booked_end);
      console.log(`📅 Date_booked filter applied: ${date_booked_start} to ${date_booked_end}`);
    } else if (created_at_start && created_at_end) {
      // For 'all' status - filter by when lead was created
      dataQuery = dataQuery
        .gte('created_at', created_at_start)
        .lte('created_at', created_at_end);
      countQuery = countQuery
        .gte('created_at', created_at_start)
        .lte('created_at', created_at_end);
      console.log(`📅 Created date filter applied: ${created_at_start} to ${created_at_end}`);
    }
    // Note: status_changed_at filtering is done in JavaScript after fetch (via booking_history)

    // Helper function to get call_status from custom_fields
    const getCallStatus = (lead) => {
      // First check call_status column directly
      if (lead.call_status) {
        return lead.call_status;
      }
      try {
        if (lead.custom_fields) {
          const customFields = typeof lead.custom_fields === 'string'
            ? JSON.parse(lead.custom_fields)
            : lead.custom_fields;
          return customFields?.call_status || null;
        }
      } catch (e) {
        return null;
      }
      return null;
    };

    // Execute queries
    let leads, leadsError, totalCount;

    // Navigation requests: fetch all matching leads server-side (bypass Supabase 1000 row limit)
    if (isNavRequest) {
      leads = [];
      let navFrom = 0;
      const navBatch = 1000;
      while (true) {
        const batchQuery = supabase
          .from('leads')
          .select(navSelect)
          .order('created_at', { ascending: false })
          .neq('postcode', 'ZZGHOST')
          .range(navFrom, navFrom + navBatch - 1);

        // Role-based filters
        if (req.user.role === 'photographer') {
          batchQuery.in('status', ['Booked', 'Attended', 'Sale']);
        } else if (req.user.role !== 'admin' && req.user.role !== 'viewer') {
          batchQuery.eq('booker_id', req.user.id).neq('status', 'Rejected');
        }
        if (booker) batchQuery.eq('booker_id', booker);

        // Status filter
        if (status && status !== 'all') {
          const callStatusValue = statusToCallStatusMap[status];
          if (status.toLowerCase() === 'sales') {
            batchQuery.eq('has_sale', 1);
          } else if (callStatusValue) {
            batchQuery.eq('call_status', callStatusValue).not('status', 'in', '(Booked,Attended,Cancelled,Rejected,Sale)');
          } else if (status === 'Booked') {
            batchQuery.not('date_booked', 'is', null);
          } else if (!isSpecialStatusFilter && status !== 'Assigned') {
            batchQuery.eq('status', status);
          }
        }

        // Search filter (must match main path fields)
        if (search && String(search).trim().length > 0) {
          const term = String(search).trim();
          const escapedTerm = term.replace(/[%_\\]/g, '\\$&');
          const like = `%${escapedTerm}%`;
          batchQuery.or([`name.ilike.${like}`, `phone.ilike.${like}`, `parent_phone.ilike.${like}`, `email.ilike.${like}`, `postcode.ilike.${like}`].join(','));
        }

        // Date filters (must match main path)
        if (assigned_at_start && assigned_at_end) {
          batchQuery.gte('assigned_at', assigned_at_start).lte('assigned_at', assigned_at_end);
        } else if (booked_at_start && booked_at_end) {
          const bookedOrFilter = `and(booked_at.gte.${booked_at_start},booked_at.lte.${booked_at_end}),and(booked_at.is.null,date_booked.not.is.null,assigned_at.gte.${booked_at_start},assigned_at.lte.${booked_at_end})`;
          batchQuery.or(bookedOrFilter);
        } else if (date_booked_start && date_booked_end) {
          batchQuery.gte('date_booked', date_booked_start).lte('date_booked', date_booked_end);
        } else if (created_at_start && created_at_end) {
          batchQuery.gte('created_at', created_at_start).lte('created_at', created_at_end);
        }

        const { data: batch, error: batchError } = await batchQuery;
        if (batchError) { leadsError = batchError; break; }
        if (!batch || batch.length === 0) break;
        leads = leads.concat(batch);
        navFrom += navBatch;
        if (batch.length < navBatch) break;
      }

      // Apply JS filtering for special statuses (must match main path exactly)
      if (isSpecialStatusFilter && status) {
        const ATTENDED_BOOKING_STATUSES = ['Arrived', 'Left', 'No Sale', 'Complete', 'Review'];
        const parseHistory = (lead) => {
          if (!lead.booking_history) return [];
          try {
            const h = typeof lead.booking_history === 'string' ? JSON.parse(lead.booking_history) : lead.booking_history;
            return Array.isArray(h) ? h : [];
          } catch (e) { return []; }
        };
        const isDateInRange = (dateStr, start, end) => {
          if (!dateStr) return false;
          const d = new Date(dateStr);
          return d >= new Date(start) && d <= new Date(end);
        };
        leads = leads.filter(lead => {
          if (status === 'Attended') {
            const isAttended = lead.status === 'Attended';
            const isBookedButAttended = lead.status === 'Booked' && ATTENDED_BOOKING_STATUSES.includes(lead.booking_status);
            const wasEverAttended = !isAttended && !isBookedButAttended && parseHistory(lead).some(entry =>
              (entry.action === 'STATUS_CHANGE' && entry.details?.newStatus === 'Attended') ||
              (entry.action === 'BOOKING_STATUS_UPDATE' && ATTENDED_BOOKING_STATUSES.includes(entry.details?.bookingStatus))
            );
            return (isAttended || isBookedButAttended || wasEverAttended) && lead.booker_id != null;
          } else if (status === 'Cancelled') {
            const match = lead.status === 'Cancelled' || (lead.status === 'Booked' && lead.booking_status === 'Cancel');
            return match && lead.booker_id != null;
          } else if (status === 'No Show') {
            const match = lead.status === 'No Show' || (lead.status === 'Booked' && lead.booking_status === 'No Show');
            return match && lead.booker_id != null;
          } else if (status === 'Sales') {
            return lead.has_sale > 0 && lead.booker_id != null;
          } else if (status === 'Rejected') {
            return lead.status === 'Rejected';
          }
          return true;
        });
      }

      // Apply date-specific filtering for Booked status with date range
      if (status === 'Booked' && booked_at_start && booked_at_end) {
        leads = leads.filter(lead => {
          if (!lead.date_booked && !lead.booked_at) return false;
          const bookedDate = new Date(lead.booked_at || lead.assigned_at);
          return bookedDate >= new Date(booked_at_start) && bookedDate <= new Date(booked_at_end);
        });
      }

      totalCount = leads.length;
      console.log(`🧭 Nav request: fetched ${leads.length} leads for navigation`);

      // Return lightweight response for navigation
      return res.json({
        leads: leads.map(l => ({ id: l.id, name: l.name, image_url: l.image_url, status: l.status, call_status: l.call_status })),
        total: totalCount,
        totalPages: 1,
        currentPage: 1
      });
    }

    // For special status filters, we need to fetch ALL leads
    // using pagination to bypass Supabase's default 1000 row limit
    if (isSpecialStatusFilter || needsJsDateFiltering) {
      console.log(`📊 Using pagination to fetch all leads for call_status filtering...`);
      leads = [];
      let paginationFrom = 0;
      const paginationBatchSize = 1000;

      while (true) {
        // Clone the query and apply range for this batch
        const batchQuery = supabase
          .from('leads')
          .select('id, name, phone, email, postcode, age, gender, image_url, booker_id, created_by_user_id, updated_by_user_id, status, date_booked, is_confirmed, is_double_confirmed, booking_status, has_sale, created_at, assigned_at, booked_at, custom_fields, call_status, review_date, review_time, review_slot, lead_source, booking_history')
          .order('created_at', { ascending: false })
          .neq('postcode', 'ZZGHOST')
          .range(paginationFrom, paginationFrom + paginationBatchSize - 1);

        // Apply role-based filters
        if (req.user.role === 'photographer') {
          batchQuery.in('status', ['Booked', 'Attended', 'Sale']);
        } else if (req.user.role !== 'admin' && req.user.role !== 'viewer') {
          batchQuery.eq('booker_id', req.user.id).neq('status', 'Rejected');
        }

        // Apply booker filter if provided
        if (booker) {
          batchQuery.eq('booker_id', booker);
        }

        // Apply search filter
        if (search && String(search).trim().length > 0) {
          const term = String(search).trim();
          const escapedTerm = term.replace(/[%_\\]/g, '\\$&');
          const like = `%${escapedTerm}%`;
          const orExpr = [
            `name.ilike.${like}`,
            `phone.ilike.${like}`,
            `parent_phone.ilike.${like}`,
            `email.ilike.${like}`,
            `postcode.ilike.${like}`
          ].join(',');
          batchQuery.or(orExpr);
        }

        // Apply SQL-level date filters (assigned_at and booked_at can be filtered in SQL)
        // status_changed_at is filtered in JavaScript after fetch via booking_history
        if (assigned_at_start && assigned_at_end) {
          batchQuery.gte('assigned_at', assigned_at_start).lte('assigned_at', assigned_at_end);
        } else if (booked_at_start && booked_at_end) {
          // Filter by booked_at, fallback to assigned_at when booked_at is NULL
          // Only include leads that actually have date_booked (were actually booked)
          const bookedOrFilter = `and(booked_at.gte.${booked_at_start},booked_at.lte.${booked_at_end}),and(booked_at.is.null,date_booked.not.is.null,assigned_at.gte.${booked_at_start},assigned_at.lte.${booked_at_end})`;
          batchQuery.or(bookedOrFilter);
        } else if (date_booked_start && date_booked_end) {
          // Filter by date_booked (appointment date on calendar) for Sales
          batchQuery.gte('date_booked', date_booked_start).lte('date_booked', date_booked_end);
        } else if (created_at_start && created_at_end) {
          batchQuery.gte('created_at', created_at_start).lte('created_at', created_at_end);
        }
        // Note: status_changed_at filtering happens in JS after fetch

        const { data: batch, error: batchError } = await batchQuery;

        if (batchError) {
          leadsError = batchError;
          break;
        }

        if (!batch || batch.length === 0) break;
        leads = leads.concat(batch);
        paginationFrom += paginationBatchSize;

        if (batch.length < paginationBatchSize) break; // Last batch
      }

      console.log(`📊 Fetched ${leads.length} total leads using pagination`);
      totalCount = leads.length;
    } else {
      // Standard query execution for non-call_status filters
      try {
        const result = await dataQuery;
        leads = result.data;
        leadsError = result.error;
        totalCount = result.count;
      } catch (queryError) {
        console.error('Supabase query execution error:', {
          message: queryError.message,
          search: search || 'none',
          page: pageInt,
          from,
          to
        });
        throw queryError;
      }
    }

    if (leadsError) {
      console.error('Supabase leads query error:', {
        message: leadsError.message,
        code: leadsError.code,
        details: leadsError.details,
        hint: leadsError.hint,
        search: search || 'none',
        page: pageInt
      });
      throw leadsError;
    }

    // Helper: check if a booking_history entry timestamp is within a date range
    const isEntryInDateRange = (entry, startDate, endDate) => {
      if (!entry.timestamp) return false;
      const entryDate = new Date(entry.timestamp);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return entryDate >= start && entryDate <= end;
    };

    // Helper: check if a date string is within a date range
    const isDateInRange = (dateStr, startDate, endDate) => {
      if (!dateStr) return false;
      const date = new Date(dateStr);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return date >= start && date <= end;
    };

    // Helper: parse booking_history safely
    const parseHistory = (lead) => {
      if (!lead.booking_history) return [];
      try {
        const history = typeof lead.booking_history === 'string'
          ? JSON.parse(lead.booking_history)
          : lead.booking_history;
        return Array.isArray(history) ? history : [];
      } catch (e) {
        return [];
      }
    };

    // Helper: check if a call_status was set within a date range (via CALL_STATUS_UPDATE in booking_history)
    const wasCallStatusSetInRange = (lead, targetStatus, startDate, endDate) => {
      // If no date range specified, just check if lead has the call_status
      if (!startDate || !endDate) {
        return getCallStatus(lead) === targetStatus;
      }
      const history = parseHistory(lead);
      return history.some(entry =>
        entry.action === 'CALL_STATUS_UPDATE' &&
        entry.details?.callStatus === targetStatus &&
        isEntryInDateRange(entry, startDate, endDate)
      );
    };

    // Helper: check if a special status change happened within a date range (via booking_history)
    const wasSpecialStatusChangedInRange = (lead, targetStatus, startDate, endDate) => {
      // If no date range specified, just check current status
      if (!startDate || !endDate) {
        if (targetStatus === 'Attended') {
          const ATTENDED_BOOKING_STATUSES = ['Arrived', 'Left', 'No Sale', 'Complete', 'Review'];
          if (lead.status === 'Attended') return true;
          if (lead.status === 'Booked' && ATTENDED_BOOKING_STATUSES.includes(lead.booking_status)) return true;
          // Check booking_history for past attendance evidence
          const history = parseHistory(lead);
          return history.some(entry => {
            if (entry.action === 'STATUS_CHANGE' && entry.details?.newStatus === 'Attended') return true;
            if (entry.action === 'BOOKING_STATUS_UPDATE' && ATTENDED_BOOKING_STATUSES.includes(entry.details?.bookingStatus)) return true;
            return false;
          });
        } else if (targetStatus === 'Cancelled') {
          return lead.status === 'Cancelled' || 
            (lead.status === 'Booked' && lead.booking_status === 'Cancel');
        } else if (targetStatus === 'No Show') {
          return lead.status === 'No Show' || 
            (lead.status === 'Booked' && lead.booking_status === 'No Show');
        } else if (targetStatus === 'Rejected') {
          return lead.status === 'Rejected';
        }
        return false;
      }

      const history = parseHistory(lead);
      return history.some(entry => {
        if (!isEntryInDateRange(entry, startDate, endDate)) return false;

        if (targetStatus === 'Attended') {
          // Look for STATUS_CHANGE to Attended, or booking_status changes to Arrived/Left/No Sale/Complete
          if (entry.action === 'STATUS_CHANGE' && entry.details?.newStatus === 'Attended') return true;
          if (entry.action === 'BOOKING_STATUS_UPDATE' && ['Arrived', 'Left', 'No Sale', 'Complete', 'Review'].includes(entry.details?.bookingStatus)) return true;
          return false;
        } else if (targetStatus === 'Cancelled') {
          // Look for CANCELLATION entries or STATUS_CHANGE to Cancelled
          if (entry.action === 'CANCELLATION') return true;
          if (entry.action === 'STATUS_CHANGE' && entry.details?.newStatus === 'Cancelled') return true;
          if (entry.action === 'BOOKING_STATUS_UPDATE' && entry.details?.bookingStatus === 'Cancel') return true;
          return false;
        } else if (targetStatus === 'No Show') {
          // Look for STATUS_CHANGE to No Show
          if (entry.action === 'STATUS_CHANGE' && entry.details?.newStatus === 'No Show') return true;
          if (entry.action === 'BOOKING_STATUS_UPDATE' && entry.details?.bookingStatus === 'No Show') return true;
          return false;
        } else if (targetStatus === 'Rejected') {
          if (entry.action === 'STATUS_CHANGE' && entry.details?.newStatus === 'Rejected') return true;
          return false;
        }
        return false;
      });
    };

    // For call_status filtering (applies to all users), filter the results in JavaScript
    let filteredLeads = leads || [];
    let allFilteredLeadsForCount = null;
    
    // Status-based date filtering logic
    // This ensures each status filter uses the appropriate date column independently
    const filterByStatusDate = (lead, targetStatus) => {
      // Call statuses now use assigned_at SQL filter - no JS date filtering needed
      if (isCallStatusFilter) return true;

      if (isSpecialStatusFilter) {
        // Sales: filter by date_booked (appointment date) in JS
        if (targetStatus === 'Sales') {
          if (date_booked_start && date_booked_end) {
            return isDateInRange(lead.date_booked, date_booked_start, date_booked_end);
          }
          return true;
        }
        // No Show: use booked_at SQL filter - no JS date filtering needed
        if (targetStatus === 'No Show') return true;
        // Cancelled: filter by original diary date from booking_history CANCELLATION entry
        if (targetStatus === 'Cancelled') {
          if (!status_changed_at_start || !status_changed_at_end) return true;
          const history = parseHistory(lead);
          return history.some(entry => {
            if (entry.action === 'CANCELLATION' ||
                (entry.action === 'STATUS_CHANGE' && entry.details?.newStatus === 'Cancelled') ||
                (entry.action === 'BOOKING_STATUS_UPDATE' && entry.details?.bookingStatus === 'Cancel')) {
              const diaryDate = entry.details?.oldDate;
              if (diaryDate) {
                return isDateInRange(diaryDate, status_changed_at_start, status_changed_at_end);
              }
            }
            return false;
          });
        }
        // Rejected: uses assigned_at SQL filter - no JS date filtering needed
        if (targetStatus === 'Rejected') return true;
        // Attended: uses date_booked SQL filter - no JS date filtering needed
        if (targetStatus === 'Attended') return true;
      }
      return true;
    };

    if (isSpecialStatusFilter) {
      // For special status filters (Attended, Cancelled, No Show, Sales, Rejected), filter by status AND booking_status
      allFilteredLeadsForCount = (leads || []).filter(lead => {
        let matchesStatus = false;

        if (status === 'Attended') {
          const ATTENDED_BOOKING_STATUSES = ['Arrived', 'Left', 'No Sale', 'Complete', 'Review'];
          const isAttended = lead.status === 'Attended';
          const isBookedButAttended = lead.status === 'Booked' &&
            ATTENDED_BOOKING_STATUSES.includes(lead.booking_status);
          // Also check booking_history for past attendance evidence
          const wasEverAttended = !isAttended && !isBookedButAttended && (() => {
            const history = parseBookingHistory(lead.booking_history);
            return history.some(entry => {
              if (entry.action === 'STATUS_CHANGE' && entry.details?.newStatus === 'Attended') return true;
              if (entry.action === 'BOOKING_STATUS_UPDATE' && ATTENDED_BOOKING_STATUSES.includes(entry.details?.bookingStatus)) return true;
              return false;
            });
          })();
          matchesStatus = isAttended || isBookedButAttended || wasEverAttended;
          // Attended filter also requires booker_id (to match stats API attendedFilter)
          if (matchesStatus && !lead.booker_id) return false;
        } else if (status === 'Cancelled') {
          const isCancelled = lead.status === 'Cancelled';
          const isBookedButCancelled = lead.status === 'Booked' && lead.booking_status === 'Cancel';
          matchesStatus = isCancelled || isBookedButCancelled;
          // Cancelled filter also requires booker_id (to match stats API cancelledFilter)
          if (matchesStatus && !lead.booker_id) return false;
        } else if (status === 'No Show') {
          const isNoShow = lead.status === 'No Show';
          const isBookedButNoShow = lead.status === 'Booked' && lead.booking_status === 'No Show';
          matchesStatus = isNoShow || isBookedButNoShow;
          // No Show filter also requires booker_id (to match stats API noShow)
          if (matchesStatus && !lead.booker_id) return false;
        } else if (status === 'Sales') {
          matchesStatus = lead.has_sale > 0;
          // Sales filter also requires booker_id (to match stats API salesConverted)
          if (matchesStatus && !lead.booker_id) return false;
        } else if (status === 'Rejected') {
          matchesStatus = lead.status === 'Rejected';
        }

        if (!matchesStatus) return false;

        // Check if the status change happened within the date range (if date filter active)
        return filterByStatusDate(lead, status);
      });
      console.log(`📊 Filtered ${allFilteredLeadsForCount.length} leads by special status: ${status} ${hasStatusChangeDateFilter ? '(with status change date filter)' : ''}`);

      // Apply pagination to filtered results
      filteredLeads = allFilteredLeadsForCount.slice(from, to + 1);
      console.log(`📄 Paginated to ${filteredLeads.length} leads (page ${pageInt}, showing ${from} to ${Math.min(to, allFilteredLeadsForCount.length - 1)} of ${allFilteredLeadsForCount.length})`);
    } else if (status === 'Assigned' && (assigned_at_start || assigned_at_end)) {
      // OPTION B: For "Assigned" status with date filter, filter by assigned_at
      // regardless of current status
      console.log(`📊 Filtering by assigned_at date (Option B)`);
      
      allFilteredLeadsForCount = (leads || []).filter(lead => {
        // Check if assigned_at is in the date range
        if (!lead.assigned_at) return false;
        const assignedDate = new Date(lead.assigned_at);
        const start = new Date(assigned_at_start);
        const end = new Date(assigned_at_end);
        return assignedDate >= start && assignedDate <= end;
      });
      
      console.log(`📊 Filtered ${allFilteredLeadsForCount.length} leads by assigned_at date range`);
      
      // Apply pagination to filtered results
      filteredLeads = allFilteredLeadsForCount.slice(from, to + 1);
      console.log(`📄 Paginated to ${filteredLeads.length} leads (page ${pageInt}, showing ${from} to ${Math.min(to, allFilteredLeadsForCount.length - 1)} of ${allFilteredLeadsForCount.length})`);
    } else if (status === 'Booked' && (booked_at_start || booked_at_end)) {
      // For "Booked" status with date filter, show ALL leads booked in range
      // Uses booked_at, fallback to assigned_at (when the booking action actually happened)
      console.log(`📊 Filtering by booked_at || assigned_at`);

      allFilteredLeadsForCount = (leads || []).filter(lead => {
        // Only include leads that were actually booked
        if (!lead.date_booked && !lead.booked_at) return false;
        // Prefer booked_at, fall back to assigned_at (close to actual booking action date)
        const bookedDate = new Date(lead.booked_at || lead.assigned_at);
        const start = new Date(booked_at_start);
        const end = new Date(booked_at_end);
        return bookedDate >= start && bookedDate <= end;
      });

      console.log(`📊 Filtered ${allFilteredLeadsForCount.length} leads by booked_at/assigned_at range`);
      
      // Apply pagination to filtered results
      filteredLeads = allFilteredLeadsForCount.slice(from, to + 1);
      console.log(`📄 Paginated to ${filteredLeads.length} leads (page ${pageInt}, showing ${from} to ${Math.min(to, allFilteredLeadsForCount.length - 1)} of ${allFilteredLeadsForCount.length})`);
    }

    // Get total count - for filters with JS filtering, use the pre-paginated filtered count
    let total = typeof totalCount === 'number' ? totalCount : 0;
    if ((isSpecialStatusFilter || needsJsDateFiltering) && allFilteredLeadsForCount !== null) {
      // For filters that use JS filtering, use the count from filtered leads (before pagination)
      total = allFilteredLeadsForCount.length;
      console.log(`📊 Total count for filter: ${total}`);
    } else {
      if (!total) {
        const { count, error: countError } = await countQuery;
        if (countError) throw countError;
        total = count || 0;
      }
    }

    console.log(`🖼️ Debug: Found ${filteredLeads?.length || 0} leads from database (total count: ${total})`);
    if (filteredLeads && filteredLeads.length > 0) {
      console.log(`🖼️ Sample image URLs from database:`);
      filteredLeads.slice(0, 3).forEach(lead => {
        console.log(`  ${lead.name}: image_url = "${lead.image_url}"`);
      });
    }

    // Bulk fetch bookers in one query
    // Get all user IDs that need to be fetched (bookers, creators, updaters)
    const bookerIds = [...new Set((filteredLeads || []).map(lead => lead.booker_id).filter(Boolean))];
    const creatorIds = [...new Set((filteredLeads || []).map(lead => lead.created_by_user_id).filter(Boolean))];
    const updaterIds = [...new Set((filteredLeads || []).map(lead => lead.updated_by_user_id).filter(Boolean))];
    const allUserIds = [...new Set([...bookerIds, ...creatorIds, ...updaterIds])];

    let usersMap = {};
    if (allUserIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', allUserIds);
      if (!usersError && users) {
        users.forEach(u => { usersMap[u.id] = u; });
      } else if (usersError) {
        console.warn('⚠️ Could not fetch users info:', usersError.message);
      }
    }

    // Transform leads to include booker object (optimized for list view)
    const transformedLeads = (filteredLeads || []).map(lead => {
      // Extract call_status from custom_fields for easier access
      let callStatus = null;
      if (lead.custom_fields) {
        try {
          const customFields = typeof lead.custom_fields === 'string' 
            ? JSON.parse(lead.custom_fields) 
            : lead.custom_fields;
          callStatus = customFields?.call_status || null;
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      return {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        postcode: lead.postcode,
        image_url: lead.image_url,
        status: lead.status,
        date_booked: lead.date_booked,
        is_confirmed: lead.is_confirmed,
        has_sale: lead.has_sale,
        created_at: lead.created_at,
        assigned_at: lead.assigned_at,
        lead_source: lead.lead_source,
        custom_fields: lead.custom_fields, // Include for filtering
        call_status: callStatus, // Extracted for easy access
        booker: lead.booker_id && usersMap[lead.booker_id] ? {
          id: usersMap[lead.booker_id].id,
          name: usersMap[lead.booker_id].name,
          email: usersMap[lead.booker_id].email
        } : null,
        created_by: lead.created_by_user_id && usersMap[lead.created_by_user_id] ? {
          id: usersMap[lead.created_by_user_id].id,
          name: usersMap[lead.created_by_user_id].name,
          email: usersMap[lead.created_by_user_id].email
        } : null,
        updated_by: lead.updated_by_user_id && usersMap[lead.updated_by_user_id] ? {
          id: usersMap[lead.updated_by_user_id].id,
          name: usersMap[lead.updated_by_user_id].name,
          email: usersMap[lead.updated_by_user_id].email
        } : null
      };
    });

    console.log(`[DEBUG] /api/leads returned ${transformedLeads.length} leads (total: ${total}) for user ${req.user.name} (${req.user.role})`);
    
    // Debug: Log final response image URLs
    if (transformedLeads.length > 0) {
      console.log(`🖼️ Final API response image URLs:`);
      transformedLeads.slice(0, 3).forEach(lead => {
        console.log(`  ${lead.name}: image_url = "${lead.image_url}"`);
      });
    }

    res.json({
      leads: transformedLeads,
      totalPages: Math.max(1, Math.ceil(total / validatedLimit)),
      currentPage: pageInt,
      total: total,
      limit: validatedLimit
    });
  } catch (error) {
    console.error('Get leads error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// @route   GET /api/leads/calendar
// @desc    Get leads for calendar view
// @access  Private (All logged-in users - special endpoint for calendar)
router.get('/calendar', auth, async (req, res) => {
  try {
    // PERFORMANCE: Get pagination and date range from query params
    const { start, end, page = 1, limit = 200, offset = 0 } = req.query;

    // Validate and cap limit - INCREASED to 10000 to ensure ALL bookings are returned
    // Calendar now fetches ALL bookings (5 years back to 5 years forward) so we need higher limit
    const validatedLimit = Math.min(parseInt(limit) || 10000, 10000);
    const pageInt = Math.max(parseInt(page) || 1, 1);
    const offsetInt = parseInt(offset) || ((pageInt - 1) * validatedLimit);

    // PERFORMANCE: Add connection health check
    const startTime = Date.now();

    // Get paginated booked leads using Supabase with date filtering for performance
    let leads = [], error, totalCount;

    // PERFORMANCE: Optimize the query structure - REMOVED heavy fields
    const buildLeadsQuery = () => {
      let q = supabase
        .from('leads')
        .select(`
          id, name, phone, email, age, status, date_booked, booked_at, booker_id,
          is_confirmed, is_double_confirmed, booking_status, has_sale, time_booked, booking_slot,
          created_at, postcode, notes, image_url, review_date, review_time, review_slot, booking_history,
          date_of_birth, height_inches, chest_inches, waist_inches, hips_inches, eye_color, hair_color, hair_length
        `)
        .or('date_booked.not.is.null,status.eq.Booked')
        .is('deleted_at', null) // Ensure we don't fetch deleted leads
        .neq('postcode', 'ZZGHOST') // Exclude ghost bookings (stats correction entries)
        .not('status', 'in', '(Cancelled,Rejected)'); // ✅ Exclude cancelled/rejected bookings from calendar

      // Apply date range filter if provided
      // NOTE: Calendar now uses a wide range (5 years back to 5 years forward) to get ALL bookings
      if (start && end) {
        // Use date strings directly - date_booked is stored as YYYY-MM-DD in the database
        // Do NOT convert to ISO/UTC as this shifts dates during BST
        const startStr = start.split('T')[0];
        const endStr = end.split('T')[0];
        q = q
          .gte('date_booked', startStr)
          .lte('date_booked', endStr + 'T23:59:59');
      }
      // If no date range provided, fetch ALL bookings (no date filter)
      return q;
    };

    // First get total count for pagination
    const countQuery = supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .or('date_booked.not.is.null,status.eq.Booked')
      .is('deleted_at', null)
      .not('status', 'in', '(Cancelled,Rejected)'); // ✅ Exclude cancelled/rejected from count

    if (start && end) {
      // Use date strings directly - match the main query format
      const startStr = start.split('T')[0];
      const endStr = end.split('T')[0];
      countQuery
        .gte('date_booked', startStr)
        .lte('date_booked', endStr + 'T23:59:59');
    }
    // If no date range provided, count ALL bookings (no date filter)

    // BUG FIX: Supabase/PostgREST silently caps any single request at its
    // configured max-rows (commonly 1000), regardless of the `.range()`/limit
    // requested. Since results are ordered by date_booked ascending, a single
    // query used to silently truncate the newest (furthest-future) bookings
    // off the end of the list — e.g. requesting limit=10000 would come back
    // with only the oldest 1000 rows, making any booking past that cutoff
    // invisible on the calendar. Page through in PAGE_SIZE-row chunks so the
    // full requested range is actually retrieved.
    const PAGE_SIZE = 1000;
    const upperBound = offsetInt + validatedLimit;
    let pageOffset = offsetInt;

    while (pageOffset < upperBound) {
      const pageEnd = Math.min(pageOffset + PAGE_SIZE, upperBound) - 1;
      const pageSizeRequested = pageEnd - pageOffset + 1;
      const pageQuery = buildLeadsQuery()
        .order('date_booked', { ascending: true, nullsLast: true })
        .range(pageOffset, pageEnd);

      let pageData, pageError;

      // Retry logic with improved error handling and timeouts
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Database query timeout after 10 seconds')), 10000);
          });

          const result = await Promise.race([pageQuery, timeoutPromise]);

          pageData = result.data;
          pageError = result.error;

          if (!pageError && pageData) {
            break;
          } else if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, Math.min(1000 * attempt, 3000))); // Exponential backoff
          }
        } catch (timeoutError) {
          pageError = timeoutError;
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, Math.min(1000 * attempt, 3000)));
          } else {
            console.error(`❌ Calendar API: Query failed after 3 attempts:`, timeoutError.message);
          }
        }
      }

      if (pageError) {
        error = pageError;
        break;
      }

      leads = leads.concat(pageData || []);

      // Fewer rows than requested means we've reached the end of the data
      if (!pageData || pageData.length < pageSizeRequested) {
        break;
      }
      pageOffset += PAGE_SIZE;
    }

    // PERFORMANCE: Sorting is now done in the database query for better performance


    // PERFORMANCE FIX: Bulk fetch booker names instead of individual queries
    if (leads && leads.length > 0) {
      // Get unique booker IDs
      const bookerIds = [...new Set(leads.filter(lead => lead.booker_id).map(lead => lead.booker_id))];
      
      if (bookerIds.length > 0) {
        // Single query to get all booker names
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, name')
          .in('id', bookerIds);

        if (!usersError && users) {
          const usersMap = new Map(users.map(user => [user.id, user]));
          leads.forEach(lead => {
            if (lead.booker_id && usersMap.has(lead.booker_id)) {
              lead.booker_name = usersMap.get(lead.booker_id).name;
            }
          });
        } else {
          console.warn('⚠️ Calendar API: Failed to fetch booker names:', usersError?.message);
        }
      }
    }

    // Lightweight query: get lead IDs with received SMS/email for calendar badges
    // Two states: unread (flashing) and read (static opened icon)
    // Batch in chunks of 50 to avoid URL length limits with Supabase REST API
    if (leads && leads.length > 0) {
      try {
        const leadIds = leads.map(l => l.id);
        const BATCH_SIZE = 50;
        let receivedRows = [];
        for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
          const batch = leadIds.slice(i, i + BATCH_SIZE);
          const { data: batchRows, error: batchErr } = await supabase
            .from('messages')
            .select('lead_id, type, read_status')
            .in('lead_id', batch)
            .in('type', ['sms', 'email'])
            .in('status', ['received', 'delivered']);
          if (!batchErr && batchRows) {
            receivedRows = receivedRows.concat(batchRows);
          }
        }

        if (receivedRows.length > 0) {
          const unreadSmsLeadIds = new Set();
          const unreadEmailLeadIds = new Set();
          const readSmsLeadIds = new Set();
          const readEmailLeadIds = new Set();
          receivedRows.forEach(r => {
            if (r.type === 'sms') {
              if (!r.read_status) unreadSmsLeadIds.add(r.lead_id);
              readSmsLeadIds.add(r.lead_id); // any received = has messages
            }
            if (r.type === 'email') {
              if (!r.read_status) unreadEmailLeadIds.add(r.lead_id);
              readEmailLeadIds.add(r.lead_id);
            }
          });
          leads.forEach(lead => {
            lead.has_unread_sms = unreadSmsLeadIds.has(lead.id);
            lead.has_unread_email = unreadEmailLeadIds.has(lead.id);
            lead.has_received_sms = readSmsLeadIds.has(lead.id);
            lead.has_received_email = readEmailLeadIds.has(lead.id);
          });
        }
      } catch (e) {
        console.warn('⚠️ Calendar API: Failed to check unread messages:', e.message);
      }
    }

    // PERFORMANCE: Skip message fetching to prevent timeouts - messages can be loaded on-demand
    // Fetch messages from messages table and merge with booking_history
    if (false && leads && leads.length > 0) { // DISABLED to prevent timeouts
      try {
        console.log(`📨 Calendar API: Fetching messages for ${leads.length} leads...`);
        console.log(`📨 Calendar API: Lead IDs: ${leads.map(l => l.id).join(', ')}`);
        
        const leadIds = leads.map(lead => lead.id);
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false });
        
        if (!messagesError && messages) {
          console.log(`📨 Calendar API: Found ${messages.length} messages`);
          
          // Group messages by lead_id
          const messagesByLead = {};
          messages.forEach(message => {
            if (!messagesByLead[message.lead_id]) {
              messagesByLead[message.lead_id] = [];
            }
            messagesByLead[message.lead_id].push(message);
          });
          
          // Merge messages with booking_history for each lead
          leads.forEach(lead => {
            const leadMessages = messagesByLead[lead.id] || [];
            
            // Parse existing booking_history
            let bookingHistory = [];
            try {
              if (lead.booking_history) {
                bookingHistory = typeof lead.booking_history === 'string' 
                  ? JSON.parse(lead.booking_history) 
                  : lead.booking_history;
                if (!Array.isArray(bookingHistory)) {
                  bookingHistory = [];
                }
              }
            } catch (e) {
              console.warn(`⚠️ Invalid booking_history for lead ${lead.id}:`, e.message);
              bookingHistory = [];
            }
            
            // Convert messages to booking_history format
            const messageHistory = leadMessages.map(msg => {
              // Properly determine if message is sent or received based on status
              const isReceived = msg.status === 'received';
              const isSent = msg.status === 'sent';
              
              return {
                action: msg.type === 'sms' ? (isReceived ? 'SMS_RECEIVED' : 'SMS_SENT') : 
                        (isReceived ? 'EMAIL_RECEIVED' : 'EMAIL_SENT'),
                timestamp: msg.created_at || msg.sent_at || new Date().toISOString(),
                performed_by: msg.sent_by || null,
                performed_by_name: msg.sent_by_name || null,
                details: {
                  body: msg.sms_body || msg.content || msg.subject || '',
                  message: msg.sms_body || msg.content || msg.subject || '',
                  subject: msg.subject || '',
                  read: isReceived ? false : true, // Received messages are unread, sent messages are read
                  replied: false,
                  status: msg.status,
                  direction: isReceived ? 'received' : 'sent'
                }
              };
            });
            
            // Merge and deduplicate with improved logic
            const allHistory = [...bookingHistory, ...messageHistory];
            const seenKeys = new Set();
            let duplicateCount = 0;
            const uniqueHistory = allHistory.filter(entry => {
              // Create a more robust deduplication key
              const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : '';
              const action = entry.action || '';
              const body = entry.details?.body || entry.details?.message || '';
              const subject = entry.details?.subject || '';
              const performedBy = entry.performed_by || '';
              
              // Use a combination of action, timestamp (rounded to nearest minute), performer, and body content
              // This handles cases where the same email appears in both booking_history and messages
              const timeKey = timestamp ? new Date(timestamp).setSeconds(0, 0) : 0;
              const bodyContent = body.substring(0, 200).trim().toLowerCase();
              const key = `${action}_${timeKey}_${performedBy}_${subject.substring(0, 50)}_${bodyContent}`;
              
              if (seenKeys.has(key)) {
                duplicateCount++;
                return false;
              }
              seenKeys.add(key);
              return true;
            });
            
            if (duplicateCount > 0) {
              console.log(`🧹 Removed ${duplicateCount} duplicate entries from lead history`);
            }
            
            // Sort by timestamp (most recent first)
            uniqueHistory.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
            
            // Update the lead's booking_history
            lead.booking_history = JSON.stringify(uniqueHistory);
          });
          
          console.log(`✅ Calendar API: Successfully merged messages with booking_history`);
        } else {
          console.warn('⚠️ Calendar API: Failed to fetch messages:', messagesError?.message);
        }
      } catch (messagesError) {
        console.error('❌ Calendar API: Error fetching messages:', messagesError);
      }
    }

    if (error) {
      console.error('❌ Calendar API error after retries:', error);
      
      // PERFORMANCE: Simplified fallback with timeout
      console.log('📅 Calendar API: Trying simplified fallback query...');
      try {
        // Single fallback query with timeout
        const fallbackPromise = supabase
          .from('leads')
          .select(`
            id, name, phone, email, age, status, date_booked, booked_at, booker_id,
            is_confirmed, booking_status, booking_history, has_sale,
            created_at, updated_at, postcode, notes, image_url,
            date_of_birth, height_inches, chest_inches, waist_inches, hips_inches, eye_color, hair_color, hair_length
          `)
          .not('date_booked', 'is', null)
          .is('deleted_at', null)
          .not('status', 'in', '(Cancelled,Rejected)') // ✅ Exclude cancelled/rejected from fallback
          .order('date_booked', { ascending: true })
          .limit(parseInt(limit));
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Fallback query timeout')), 5000);
        });
        
        const { data: fallbackLeads, error: fallbackError } = await Promise.race([fallbackPromise, timeoutPromise]);
        
        if (!fallbackError && fallbackLeads) {
          leads = fallbackLeads;
          console.log(`📅 Calendar API: Fallback successful, found ${leads.length} leads`);
        } else {
          throw fallbackError || new Error('No data from fallback query');
        }
      } catch (fallbackError) {
        console.error('❌ Calendar API fallback also failed:', fallbackError.message);
        
        // Return a more helpful error message
        return res.status(500).json({ 
          message: 'Database connection issue - calendar temporarily unavailable', 
          error: 'The calendar service is experiencing connectivity issues. Please try refreshing the page.', 
          timestamp: new Date().toISOString()
        });
      }
    }

    // Only log if there are errors or if explicitly debugging
    if (error && process.env.NODE_ENV === 'development') {
      console.error('❌ Calendar API Error:', error);
    } else {
      console.log('📅 No calendar events found. Checking database...');
      
      // Additional debug query
      const { data: debugLeads, error: debugError } = await supabase
        .from('leads')
        .select('id, name, status, date_booked')
        .limit(5);
      
      if (debugError) {
        console.error('📅 Debug query error:', debugError);
      } else {
        console.log(`📅 Debug: Found ${debugLeads?.length || 0} total leads in database`);
        if (debugLeads && debugLeads.length > 0) {
          debugLeads.forEach(lead => {
            console.log(`  - ${lead.name} - Status: ${lead.status} - Date: ${lead.date_booked || 'None'}`);
          });
        }
      }
    }
    
    // Get total count for pagination
    const { count } = await countQuery;
    const totalRecords = count || 0;

    res.json({
      leads: leads,
      events: leads, // Alias for compatibility
      totalPages: Math.max(1, Math.ceil(totalRecords / validatedLimit)),
      currentPage: pageInt,
      total: totalRecords,
      pageSize: validatedLimit,
      hasMore: (offsetInt + leads.length) < totalRecords,
      timestamp: new Date().toISOString(), // Cache busting
      count: leads?.length || 0,
      pagination: {
        page: pageInt,
        limit: validatedLimit,
        offset: offsetInt,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / validatedLimit)),
        hasNextPage: pageInt * validatedLimit < totalRecords,
        hasPrevPage: pageInt > 1
      }
    });
  } catch (error) {
    console.error('Calendar route error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leads/calendar/export-csv
// @desc    Export calendar day to CSV
// @access  Private
router.get('/calendar/export-csv', auth, async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date parameter is required' });
    }

    console.log(`📥 Exporting calendar CSV for date: ${date}`);

    // Use plain date string - date_booked is stored as YYYY-MM-DD in the database
    const dateStr = date.split('T')[0]; // Ensure we only have the date portion

    console.log(`📅 Querying bookings for date: ${dateStr}`);

    // Fetch all leads for this date
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, name, phone, date_booked, notes, status, postcode, email, booking_history')
      .gte('date_booked', dateStr)
      .lte('date_booked', dateStr + 'T23:59:59')
      .is('deleted_at', null)
      .neq('postcode', 'ZZGHOST')
      .not('status', 'in', '(Cancelled,Rejected)')
      .order('date_booked', { ascending: true });

    if (error) {
      console.error('Error fetching leads for CSV export:', error);
      return res.status(500).json({ message: 'Failed to fetch calendar data' });
    }

    console.log(`📊 Found ${leads.length} bookings for ${date}`);

    // Group leads by time slot
    const timeSlots = {};

    leads.forEach(lead => {
      const dateBooked = new Date(lead.date_booked);

      // Format time as HH:MM (convert from UTC to UK time - BST = UTC+1)
      const ukDate = new Date(dateBooked.getTime() + (1 * 60 * 60 * 1000));
      const hours = ukDate.getUTCHours().toString().padStart(2, '0');
      const minutes = ukDate.getUTCMinutes().toString().padStart(2, '0');
      const time = `${hours}:${minutes}`;

      if (!timeSlots[time]) {
        timeSlots[time] = [];
      }

      // Get person's name
      const name = (lead.name || '').replace(/,/g, ';');
      const phone = (lead.phone || '').replace(/,/g, ';');

      // Find which email account was used
      let emailAccount = '';
      if (lead.booking_history && Array.isArray(lead.booking_history)) {
        const emailEntries = lead.booking_history
          .filter(entry =>
            (entry.action === 'BOOKING_CONFIRMATION_SENT' || entry.action === 'EMAIL_SENT') &&
            entry.details
          )
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        for (const entry of emailEntries) {
          if (entry.details.emailAccountName) {
            emailAccount = entry.details.emailAccountName;
            break;
          }
          if (entry.details.body || entry.lead_snapshot?.email_body) {
            const emailBody = entry.details.body || entry.lead_snapshot?.email_body || '';
            // Legacy: Check for old company names, but now always use Auralndn
            if (emailBody.includes('Camry Models') || emailBody.includes('Avensis Models') || emailBody.includes('Auralndn')) {
              emailAccount = 'Auralndn';
              break;
            }
          }
        }
      }

      // Combine all notes fields
      const notesArray = [];
      if (lead.notes) notesArray.push(lead.notes);
      if (lead.status && lead.status !== 'Booked') notesArray.push(`(${lead.status})`);
      const notes = notesArray.join(' | ').replace(/,/g, ';').replace(/\n/g, ' ').replace(/"/g, '""');

      timeSlots[time].push({ name, phone, notes, emailAccount });
    });

    // Generate all time slots from 10:00 to 17:45
    const allTimeSlots = [];
    for (let hour = 10; hour < 18; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        allTimeSlots.push(timeStr);
        if (hour === 17 && minute === 45) break;
      }
    }

    // Find the maximum number of bookings in any single time slot
    let maxBookings = 1;
    allTimeSlots.forEach(time => {
      const bookings = timeSlots[time] || [];
      if (bookings.length > maxBookings) {
        maxBookings = bookings.length;
      }
    });

    console.log(`📊 Max bookings in a single time slot: ${maxBookings}`);

    // Build CSV header dynamically based on max bookings
    const csvRows = [];
    const headerParts = ['Time'];
    for (let i = 1; i <= maxBookings; i++) {
      if (i === 1) {
        headerParts.push('Person\'s Name', 'Phone Number', 'Notes', 'Email Account');
      } else {
        headerParts.push(`Person\'s Name ${i}`, `Phone Number ${i}`, `Notes ${i}`, `Email Account ${i}`);
      }
    }
    csvRows.push(headerParts.join(','));

    // Build CSV rows
    allTimeSlots.forEach(time => {
      const bookings = timeSlots[time] || [];

      if (bookings.length === 0) {
        // Empty row with correct number of columns
        const emptyRow = [time];
        for (let i = 0; i < maxBookings * 4; i++) {
          emptyRow.push('');
        }
        csvRows.push(emptyRow.join(','));
      } else {
        const row = [time];
        // Add all bookings for this time slot
        for (let i = 0; i < maxBookings; i++) {
          if (bookings[i]) {
            row.push(bookings[i].name);
            row.push(bookings[i].phone);
            row.push(bookings[i].notes);
            row.push(bookings[i].emailAccount || '');
          } else {
            // Fill empty columns for consistency
            row.push('', '', '', '');
          }
        }
        csvRows.push(row.join(','));
      }
    });

    const csvContent = csvRows.join('\n');

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="calendar_${date}.csv"`);
    res.send(csvContent);

    console.log(`✅ Calendar CSV exported successfully for ${date}`);
  } catch (error) {
    console.error('Error exporting calendar CSV:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leads/:id/history
// @desc    Get booking history for a lead
// @access  Private
router.get('/:id([0-9a-fA-F-]{36})/history', auth, async (req, res) => {
  try {
    console.log(`📋 GET /api/leads/${req.params.id}/history - Requested by user ${req.user.name} (${req.user.role})`);

    // Get the lead from Supabase
    const leads = await dbManager.query('leads', {
      select: 'id, booker_id, booking_history',
      eq: { id: req.params.id }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // ROLE-BASED ACCESS CONTROL
    if (req.user.role !== 'admin' && lead.booker_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only view leads assigned to you.' });
    }

    // Parse booking history
    let bookingHistory = [];
    if (lead.booking_history) {
      try {
        // Check if it's a string (JSON) or already an array
        if (typeof lead.booking_history === 'string') {
          bookingHistory = JSON.parse(lead.booking_history);
        } else if (Array.isArray(lead.booking_history)) {
          bookingHistory = lead.booking_history;
        } else {
          bookingHistory = [];
        }
      } catch (e) {
        console.error('Error parsing booking history:', e);
        bookingHistory = [];
      }
    }

    // Ensure bookingHistory is an array before sorting
    if (!Array.isArray(bookingHistory)) {
      bookingHistory = [];
    }

    // Sort by timestamp (newest first)
    bookingHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      leadId: req.params.id,
      bookingHistory: bookingHistory
    });
  } catch (error) {
    console.error('Get booking history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Legacy endpoint removed - legacy database connection no longer used
// @route   GET /api/leads/legacy
// @desc    Get legacy leads (DISABLED - legacy database removed)
// @access  Private
router.get('/legacy', auth, async (req, res) => {
  return res.status(410).json({ 
    message: 'Legacy database connection has been removed. This endpoint is no longer available.',
    deprecated: true
  });
});

// @route   POST /api/leads/:id/history
// @desc    Add entry to booking history
// @access  Private
router.post('/:id([0-9a-fA-F-]{36})/history', auth, async (req, res) => {
  try {
    const { action, details } = req.body;
    console.log(`📋 POST /api/leads/${req.params.id}/history - Adding ${action} by user ${req.user.name} (${req.user.role})`);
    
    // Get the lead from Supabase
    const leads = await dbManager.query('leads', {
      select: 'id, booker_id',
      eq: { id: req.params.id }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // ROLE-BASED ACCESS CONTROL
    if (req.user.role !== 'admin' && lead.booker_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only modify leads assigned to you.' });
    }

    // Add booking history entry to Supabase
    const historyEntry = {
      // Don't set id - let database auto-generate it
      lead_id: req.params.id,
      action: action,
      performed_by: req.user.id,
      performed_by_name: req.user.name,
      details: details ? JSON.stringify(details) : null,
      lead_snapshot: JSON.stringify({ lead_id: req.params.id }),
      created_at: new Date().toISOString()
    };

    await dbManager.insert('booking_history', historyEntry);
    res.json({ success: true, message: 'History entry added successfully' });
  } catch (error) {
    console.error('Add booking history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leads/:id
// @desc    Get single lead
// @access  Private
router.get('/:id([0-9a-fA-F-]{36})', auth, async (req, res) => {
  try {
    // Check if the ID is a valid ObjectId
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }
    
    console.log(`📋 GET /api/leads/${req.params.id} - Requested by user ${req.user.name} (${req.user.role})`);

    // Get the lead from Supabase
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    console.log(`📋 Database query for ID ${req.params.id}: ${leads && leads.length > 0 ? 'Found' : 'Not Found'}`);

    if (!leads || leads.length === 0) {
      console.error(`❌ Get lead error: Lead not found for ID: ${req.params.id}`);
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // ROLE-BASED ACCESS CONTROL
    // Only admins can access any lead, bookers and viewers can only access their assigned leads
    if (req.user.role !== 'admin' && lead.booker_id !== req.user.id) {
      console.log(`🚫 Access denied: User ${req.user.name} (${req.user.role}) tried to access lead ${req.params.id} assigned to ${lead.booker_id}`);
      return res.status(403).json({ message: 'Access denied. You can only view leads assigned to you.' });
    }

    console.log(`✅ Lead access granted: User ${req.user.name} (${req.user.role}) accessed lead ${req.params.id}`);

    // Get booker information
    let bookerInfo = null;
    if (lead.booker_id) {
      try {
        const booker = await dbManager.query('users', {
          select: 'name, email',
          eq: { id: lead.booker_id }
        });
        if (booker.length > 0) {
          bookerInfo = {
            id: lead.booker_id,
            name: booker[0].name,
            email: booker[0].email
          };
        }
      } catch (error) {
        console.log(`Could not get booker info for lead ${lead.id}`);
      }
    }

    // Extract call_status from custom_fields for easier access
    let callStatus = null;
    if (lead.custom_fields) {
      try {
        const customFields = typeof lead.custom_fields === 'string' 
          ? JSON.parse(lead.custom_fields) 
          : lead.custom_fields;
        callStatus = customFields?.call_status || null;
      } catch (e) {
        console.warn('Error parsing custom_fields for call_status:', e);
      }
    }

    // Transform lead to include booker object and call_status
    const transformedLead = {
      ...lead,
      booker: bookerInfo,
      call_status: callStatus // Add call_status for easy access
    };

    res.json(transformedLead);
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/leads
// @desc    Create new lead
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    // Filter out empty or invalid _id field to prevent validation errors
    const { _id, ...bodyWithoutId } = req.body;
    const filteredBody = _id && _id !== '' ? { _id, ...bodyWithoutId } : bodyWithoutId;
    
    // Simple deduplication: Check if we're processing the same request within 5 seconds
    const requestKey = `${req.user.id}_${filteredBody.name}_${filteredBody.phone}_${filteredBody.date_booked}`;
    const now = Date.now();
    
    if (!global.recentRequests) global.recentRequests = new Map();
    
    if (global.recentRequests.has(requestKey)) {
      const lastRequest = global.recentRequests.get(requestKey);
      if (now - lastRequest < 5000) { // 5 seconds
        console.log(`🚫 Duplicate request detected for ${filteredBody.name} within 5 seconds, ignoring`);
        return res.status(200).json({ 
          message: 'Request already being processed',
          isDuplicate: true
        });
      }
    }
    
    global.recentRequests.set(requestKey, now);
    
    // Clean up old requests (older than 1 minute)
    for (const [key, timestamp] of global.recentRequests.entries()) {
      if (now - timestamp > 60000) {
        global.recentRequests.delete(key);
      }
    }

    // PERSISTENCE FIX: If we have an _id, we're updating an existing lead from the lead details page
    if (_id && _id !== '') {
      console.log('📊 Updating existing lead from lead details:', _id);
      // Force update instead of create
      const existingLeads = await dbManager.query('leads', {
        select: '*',
        eq: { id: _id }
      });
      
      if (existingLeads && existingLeads.length > 0) {
        // Update the existing lead
        // Remove fields that don't exist in Supabase schema
        const { isReschedule, sendEmail, sendSms, rescheduleReason, templateId, secondaryTemplateId, ...cleanBodyData } = bodyWithoutId;

        // Build update data explicitly to avoid including invalid fields
        const updateData = {
          name: bodyWithoutId.name,
          email: bodyWithoutId.email,
          phone: bodyWithoutId.phone,
          postcode: bodyWithoutId.postcode,
          notes: bodyWithoutId.notes,
          age: bodyWithoutId.age,
          parent_phone: bodyWithoutId.parent_phone,
          date_booked: bodyWithoutId.date_booked ? preserveLocalTime(bodyWithoutId.date_booked) : null,
          time_booked: bodyWithoutId.time_booked,
          booking_slot: bodyWithoutId.booking_slot || 1, // Default to slot 1 if not specified
          status: 'Booked',
          booker_id: existingLeads[0].booker_id || req.user.id, // Lock: keep original booker, only set if none exists
          updated_at: new Date().toISOString(),
          // Convert boolean to integer for database compatibility
          is_confirmed: bodyWithoutId.is_confirmed ? 1 : 0,
          booking_status: bodyWithoutId.booking_status || (isReschedule ? 'Reschedule' : null)
        };

        if (existingLeads[0].replydesk_sent_at) {
          updateData.replydesk_status = 'Booked';
          updateData.replydesk_last_updated = new Date().toISOString();
        }

        const updateResult = await dbManager.update('leads', updateData, { id: _id });

        // Get updated lead
        const updated = await dbManager.query('leads', {
          select: '*',
          eq: { id: _id }
        });

        // RESCHEDULE TRACKING: if this lead already had a booking on a DIFFERENT date,
        // record a RESCHEDULE history entry. This is what powers the "rescheduled away"
        // ghost marker on the original calendar slot AND lets reports credit the
        // original date (arrivals/sales). Without it, the old date_booked is lost.
        try {
          const oldDate = existingLeads[0].date_booked;
          const newDate = updateData.date_booked;
          const oldDay = oldDate ? String(oldDate).split('T')[0] : null;
          const newDay = newDate ? String(newDate).split('T')[0] : null;
          if (oldDay && newDay && oldDay !== newDay) {
            await addBookingHistoryEntry(
              _id,
              'RESCHEDULE',
              req.user.id,
              req.user.name,
              {
                oldDate,
                newDate,
                // Preserve the ORIGINAL slot/time so the ghost lands in the exact slot
                // (date_booked stores 00:00, so the real time lives in time_booked).
                oldTimeBooked: existingLeads[0].time_booked || null,
                oldBookingSlot: existingLeads[0].booking_slot || null,
                newTimeBooked: updateData.time_booked || null,
                newBookingSlot: updateData.booking_slot || null,
                reason: rescheduleReason || 'Appointment rescheduled',
                notes: `Appointment rescheduled from ${oldDay} to ${newDay}`
              },
              createLeadSnapshot(updated[0])
            );
            console.log(`📅 RESCHEDULE recorded for lead ${_id}: ${oldDay} → ${newDay}`);
          }
        } catch (e) {
          console.error('⚠️ RESCHEDULE history entry failed (non-critical):', e.message);
        }

        // Send booking confirmation if requested (NON-BLOCKING)
        if (updateData.date_booked && (bodyWithoutId.sendEmail || bodyWithoutId.sendSms)) {
          console.log(`📧 Triggering non-blocking booking confirmation for lead ${_id}`);

          // Fire and forget - don't wait for completion
          withTimeout(
            MessagingService.sendBookingConfirmation(
              _id,
              req.user.id,
              updateData.date_booked,
              {
                sendEmail: bodyWithoutId.sendEmail || false,
                sendSms: bodyWithoutId.sendSms || false,
                templateId: bodyWithoutId.templateId || null
              }
            ),
            30000,
            'Booking confirmation'
          ).then((result) => {
            console.log(`✅ Booking confirmation sent successfully for lead ${_id}`);

            // Send WebSocket notification to user
            if (global.io) {
              global.io.emit('message_sent', {
                leadId: _id,
                type: 'booking_confirmation',
                status: 'success',
                channels: {
                  email: result?.emailSent,
                  sms: result?.smsSent
                },
                emailAccount: result?.emailAccount,
                emailAccountName: 'Auralndn',
                smsProvider: result?.smsProvider || 'The SMS Works',
                message: `Booking confirmation sent successfully via ${result?.emailSent ? 'Email' : ''}${result?.emailSent && result?.smsSent ? ' and ' : ''}${result?.smsSent ? 'SMS' : ''}`,
                timestamp: new Date()
              });
            }

            // Try to add booking history (also non-blocking)
            addBookingHistoryEntry(
              _id,
              'BOOKING_CONFIRMATION_SENT',
              req.user.id,
              req.user.name,
              {
                appointmentDate: updateData.date_booked,
                sentVia: {
                  email: bodyWithoutId.sendEmail || false,
                  sms: bodyWithoutId.sendSms || false
                },
                templateId: bodyWithoutId.templateId || null,
                timestamp: new Date()
              },
              createLeadSnapshot(updated[0])
            ).catch(e => {
              console.error('⚠️ Booking history entry failed (non-critical):', e.message);
            });

            // Send secondary confirmation if template provided (non-blocking)
            if (bodyWithoutId.secondaryTemplateId && bodyWithoutId.sendEmail) {
              console.log(`📧 Sending secondary confirmation for lead ${_id}`);
              withTimeout(
                MessagingService.sendBookingConfirmation(
                  _id,
                  req.user.id,
                  updateData.date_booked,
                  { sendEmail: true, sendSms: false, templateId: bodyWithoutId.secondaryTemplateId }
                ),
                30000,
                'Secondary confirmation'
              ).then(() => {
                console.log(`✅ Secondary confirmation sent for lead ${_id}`);
              }).catch((err) => {
                console.error(`❌ Secondary confirmation failed for lead ${_id}:`, err.message);
              });
            }
          }).catch((error) => {
            console.error(`❌ Booking confirmation failed for lead ${_id}:`, error.message);

            // Send failure notification
            if (global.io) {
              global.io.emit('message_sent', {
                leadId: _id,
                type: 'booking_confirmation',
                status: 'failed',
                error: error.message,
                message: `Failed to send booking confirmation: ${error.message}`,
                timestamp: new Date()
              });
            }
          });
        }
        
        // Emit real-time update
        if (global.io) {
          global.io.emit('lead_updated', {
            lead: updated[0],
            action: 'booking_updated',
            timestamp: new Date()
          });
        }
        
        return res.json({
          success: true,
          lead: updated[0],
          isExistingLead: true,
          message: 'Appointment booked successfully'
        });
      }
    }

    // Map imageUrl to image_url if present
    if (filteredBody.imageUrl) {
      filteredBody.image_url = filteredBody.imageUrl;
      delete filteredBody.imageUrl;
    }
    
    // Remove fields that don't exist in Supabase schema
    const { isReschedule, sendEmail, sendSms, rescheduleReason, templateId, secondaryTemplateId, ...cleanFilteredBody } = filteredBody;
    const finalBody = cleanFilteredBody;

    console.log('📊 Server: Creating lead with data:', {
      originalId: _id,
      hasValidId: _id && _id !== '',
      finalData: filteredBody
    });

    // Check for existing leads with the same name and phone to prevent duplicates using Supabase
    if (finalBody.name && finalBody.phone) {
      const normalizedPhoneVal = normalizePhone(finalBody.phone);
      const normalizedName = finalBody.name.trim().toLowerCase();
      const normalizedEmail = finalBody.email ? finalBody.email.trim().toLowerCase() : '';

      console.log(`📊 Duplicate check: Looking for "${normalizedName}" with phone "${normalizedPhoneVal}"`);

      // Use Supabase to check for duplicates
      const existingLeads = await dbManager.query('leads', {
        select: 'id, name, phone, email, status, date_booked, time_booked, booking_slot, booker_id, created_at',
        is: { deleted_at: null },
      });

      // Filter for duplicates using consistent normalizePhone
      const duplicateLeads = existingLeads.filter(lead => {
        const leadName = lead.name ? lead.name.trim().toLowerCase() : '';
        const leadPhone = normalizePhone(lead.phone);
        if (leadName !== normalizedName || leadPhone !== normalizedPhoneVal) return false;

        // Name+phone alone can collide for two different people sharing a
        // phone number (e.g. household/landline). If both records have an
        // email on file, require it to match too before treating them as
        // the same lead.
        const leadEmail = lead.email ? lead.email.trim().toLowerCase() : '';
        if (normalizedEmail && leadEmail && normalizedEmail !== leadEmail) return false;

        return true;
      });

      // When multiple historical duplicates exist (e.g. repeat leads with old
      // Rejected/Cancelled records), prefer the currently-active one and break
      // ties by most recent, so we always update the lead the user is actually
      // looking at rather than an arbitrary stale duplicate.
      duplicateLeads.sort((a, b) => {
        const aInactive = ['Rejected', 'Cancelled'].includes(a.status) ? 1 : 0;
        const bInactive = ['Rejected', 'Cancelled'].includes(b.status) ? 1 : 0;
        if (aInactive !== bInactive) return aInactive - bInactive;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
      
      if (duplicateLeads.length > 0) {
        console.log(`📊 Duplicate detection: Found ${duplicateLeads.length} existing leads for ${finalBody.name} (${finalBody.phone})`);
        
        // If there's an existing lead and we're trying to book it, update the existing lead instead
        if (finalBody.status === 'Booked' && finalBody.date_booked) {
          const existingLead = duplicateLeads[0];
          console.log(`📊 Updating existing lead ${existingLead.id} instead of creating duplicate`);
          
          // Update the existing lead with booking information
          const updateFields = {
            status: 'Booked',
            date_booked: finalBody.date_booked ? preserveLocalTime(finalBody.date_booked) : null,
            time_booked: finalBody.time_booked,
            booking_slot: finalBody.booking_slot || 1, // Default to slot 1 if not specified
            booker_id: existingLead.booker_id || req.user.id, // Lock: keep original booker, only set if none exists
            booked_at: new Date().toISOString(), // ✅ BOOKING HISTORY FIX: Set booked_at timestamp
            ever_booked: true, // ✅ BOOKING HISTORY FIX: Mark as ever booked
            updated_at: new Date().toISOString()
          };

          // Include reschedule-specific fields if this is a reschedule
          if (isReschedule) {
            updateFields.booking_status = finalBody.booking_status || 'Reschedule';
            // Convert boolean to integer for database compatibility
            updateFields.is_confirmed = 0; // Reschedules start as unconfirmed
          }
          
          // Update the existing lead using Supabase
          await dbManager.update('leads', updateFields, { id: existingLead.id });
          
          // Get the updated lead
          const updatedLeads = await dbManager.query('leads', {
            select: '*',
            eq: { id: existingLead.id }
          });
          const updatedLead = updatedLeads[0];

          // RESCHEDULE TRACKING (duplicate-match path): record the original date so the
          // calendar keeps a "rescheduled away" ghost and reports credit the original date.
          try {
            const oldDate = existingLead.date_booked;
            const newDate = updateFields.date_booked;
            const oldDay = oldDate ? String(oldDate).split('T')[0] : null;
            const newDay = newDate ? String(newDate).split('T')[0] : null;
            if (oldDay && newDay && oldDay !== newDay) {
              await addBookingHistoryEntry(
                existingLead.id,
                'RESCHEDULE',
                req.user.id,
                req.user.name,
                {
                  oldDate,
                  newDate,
                  oldTimeBooked: existingLead.time_booked || null,
                  oldBookingSlot: existingLead.booking_slot || null,
                  newTimeBooked: updateFields.time_booked || null,
                  newBookingSlot: updateFields.booking_slot || null,
                  reason: rescheduleReason || 'Appointment rescheduled',
                  notes: `Appointment rescheduled from ${oldDay} to ${newDay}`
                },
                createLeadSnapshot(updatedLead)
              );
              console.log(`📅 RESCHEDULE recorded (duplicate path) for lead ${existingLead.id}: ${oldDay} → ${newDay}`);
            }
          } catch (e) {
            console.error('⚠️ RESCHEDULE history entry failed (non-critical):', e.message);
          }

          // Immediately trigger booking confirmation on duplicate-update path as well (NON-BLOCKING)
          if (finalBody.date_booked && (sendEmail || sendSms)) {
            console.log(`📧 Triggering non-blocking booking confirmation (duplicate-update path) for lead ${existingLead.id}`);

            // Fire and forget - don't wait for completion
            withTimeout(
              MessagingService.sendBookingConfirmation(
                existingLead.id,
                req.user.id,
                finalBody.date_booked,
                { sendEmail: sendEmail || false, sendSms: sendSms || false, templateId: finalBody.templateId || null }
              ),
              30000,
              'Booking confirmation (duplicate path)'
            ).then((result) => {
              console.log(`✅ Booking confirmation sent (duplicate-update path) for lead ${existingLead.id}`);

              // Send WebSocket notification
              if (global.io) {
                global.io.emit('message_sent', {
                  leadId: existingLead.id,
                  type: 'booking_confirmation',
                  status: 'success',
                  channels: {
                    email: result?.emailSent,
                    sms: result?.smsSent
                  },
                  emailAccount: result?.emailAccount,
                  emailAccountName: 'Auralndn',
                  smsProvider: result?.smsProvider || 'The SMS Works',
                  message: `Booking confirmation sent successfully via ${result?.emailSent ? 'Email' : ''}${result?.emailSent && result?.smsSent ? ' and ' : ''}${result?.smsSent ? 'SMS' : ''}`,
                  timestamp: new Date()
                });
              }

              // Try to add booking history (non-blocking)
              addBookingHistoryEntry(
                existingLead.id,
                'BOOKING_CONFIRMATION_SENT',
                req.user.id,
                req.user.name,
                {
                  appointmentDate: finalBody.date_booked,
                  sentVia: {
                    email: sendEmail || false,
                    sms: sendSms || false
                  },
                  templateId: finalBody.templateId || null,
                  timestamp: new Date()
                },
                createLeadSnapshot(updatedLead)
              ).catch(e => {
                console.error('⚠️ Booking history entry failed (non-critical):', e.message);
              });

              // Send secondary confirmation if template provided (non-blocking)
              if (secondaryTemplateId && sendEmail) {
                console.log(`📧 Sending secondary confirmation for lead ${existingLead.id}`);
                withTimeout(
                  MessagingService.sendBookingConfirmation(
                    existingLead.id,
                    req.user.id,
                    finalBody.date_booked,
                    { sendEmail: true, sendSms: false, templateId: secondaryTemplateId }
                  ),
                  30000,
                  'Secondary confirmation'
                ).then(() => {
                  console.log(`✅ Secondary confirmation sent for lead ${existingLead.id}`);
                }).catch((err) => {
                  console.error(`❌ Secondary confirmation failed for lead ${existingLead.id}:`, err.message);
                });
              }
            }).catch((error) => {
              console.error(`❌ Booking confirmation failed (duplicate-update path) for lead ${existingLead.id}:`, error.message);

              // Send failure notification
              if (global.io) {
                global.io.emit('message_sent', {
                  leadId: existingLead.id,
                  type: 'booking_confirmation',
                  status: 'failed',
                  error: error.message,
                  message: `Failed to send booking confirmation: ${error.message}`,
                  timestamp: new Date()
                });
              }
            });
          }

          // Enhanced real-time update emission
          if (global.io) {
            const updatePayload = {
              lead: updatedLead,
              action: 'update',
              bookerId: updatedLead.booker_id,
              leadId: updatedLead.id,
              timestamp: new Date().toISOString()
            };

            // Emit multiple events for robustness
            global.io.emit('lead_updated', updatePayload);
            global.io.emit('stats_update_needed', {
              type: 'lead_updated',
              bookerId: updatedLead.booker_id,
              leadId: updatedLead.id,
              timestamp: new Date().toISOString()
            });

            // Specific booking activity event for dashboard
            if (updatedLead.status === 'Booked' || updatedLead.date_booked) {
              global.io.emit('booking_activity', {
                action: 'updated',
                booker: updatedLead.booker_id,
                leadName: updatedLead.name,
                dateBooked: updatedLead.date_booked,
                status: updatedLead.status,
                timestamp: new Date().toISOString()
              });
            }

            console.log('📡 EMITTED: Dashboard update events for lead update', {
              leadId: updatedLead.id,
              booker: updatedLead.booker_id,
              status: updatedLead.status
            });
          } else {
            console.warn('⚠️ global.io not available - live updates will not work');
          }
          
          return res.status(200).json({
            message: 'Existing lead updated successfully',
            lead: updatedLead,
            isExistingLead: true  // Add this flag to indicate it was an existing lead
          });
        } else {
          // If not booking, return error about duplicate
          return res.status(400).json({ 
            message: `A lead with the name "${finalBody.name}" and phone "${finalBody.phone}" already exists. Please update the existing lead instead.` 
          });
        }
      }
    }
    
    const uuid = require('uuid');
    const leadId = uuid.v4();
    const leadData = {
      ...finalBody,
      booker: req.user.id,
      id: leadId // Ensure we have a proper ID for SQLite
    };

    // Generate short booking code for public booking links
    let bookingCode = null;
    try {
      bookingCode = await generateBookingCode(leadData.name);
      console.log(`📋 Generated booking code: ${bookingCode} for lead ${leadData.name}`);
    } catch (bookingCodeError) {
      console.error('⚠️ Failed to generate booking code:', bookingCodeError);
      // Continue without booking code - not critical
    }

    // Insert the new lead using Supabase
    const leadToInsert = {
      id: leadData.id,
      name: leadData.name || '',
      phone: leadData.phone || '',
      email: leadData.email || '',
      postcode: leadData.postcode || '',
      image_url: leadData.image_url || '',
      parent_phone: leadData.parent_phone || '',
      age: leadData.age || null,
      booker_id: leadData.booker || null,
      created_by_user_id: req.user.id, // Track who created this booking
      status: leadData.status || 'New',
      date_booked: leadData.date_booked ? preserveLocalTime(leadData.date_booked) : null,
      time_booked: leadData.time_booked || null,
      booking_slot: leadData.booking_slot || 1, // Default to slot 1 if not specified
      booking_history: JSON.stringify([]), // booking_history starts empty
      notes: leadData.notes || '',
      // Convert boolean to integer for database compatibility
      is_confirmed: leadData.is_confirmed ? 1 : 0,
      booking_status: leadData.booking_status || null,
      // ✅ DAILY ACTIVITY FIX: Set booked_at timestamp if creating with Booked status
      booked_at: leadData.status === 'Booked' ? new Date().toISOString() : null,
      // ✅ BOOKING HISTORY FIX: Set ever_booked flag to track booking history for stats
      ever_booked: leadData.status === 'Booked' ? true : false,
      // ✅ SHORT BOOKING CODE: For cleaner public booking URLs
      booking_code: bookingCode,
      // Set assigned_at when lead is created with a booker
      assigned_at: leadData.booker ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Use service role client for lead creation to bypass RLS and allow activity logging
    const serviceRoleClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey || config.supabase.anonKey
    );

    const { data: insertResult, error: insertError } = await serviceRoleClient
      .from('leads')
      .insert([leadToInsert])
      .select();

    if (insertError) {
      console.error('Create lead error:', insertError);
      
      // Handle RLS policy violations gracefully
      if (insertError.code === '42501') {
        console.warn('⚠️ RLS policy violation during lead creation - this may be due to automatic assignment creation');
        // Try to continue without failing the request
        // The lead might still be created despite the assignment error
      } else {
        return res.status(500).json({ message: 'Server error: ' + insertError.message });
      }
    }

    if (!insertResult || insertResult.length === 0) {
      console.error('Create lead error: No data inserted');
      return res.status(500).json({ message: 'Server error: No data inserted' });
    }

    // Get the inserted lead
    const lead = insertResult[0];

    // Get user information for booking history using Supabase
    let bookerName = 'Unknown User';
    if (leadData.booker) {
      const bookerUser = await dbManager.query('users', {
        select: 'name',
        eq: { id: leadData.booker }
      });
      if (bookerUser && bookerUser.length > 0) {
        bookerName = bookerUser[0].name;
      }
    }

    // Add initial booking history entry if this is a booked lead
    if (leadData.status === 'Booked' && leadData.date_booked) {
      console.log(`📅 Adding INITIAL_BOOKING for new lead ${leadData.name}`);
      await addBookingHistoryEntry(
        lead.id,
        'INITIAL_BOOKING',
        leadData.booker,
        bookerName,
        {
          newDate: leadData.date_booked,
          notes: `Initial booking created for ${leadData.name}`
        },
        createLeadSnapshot(lead)
      );
    }

    // Update user's leads assigned count using Supabase
    if (leadData.booker) {
      try {
        const bookerUser = await dbManager.query('users', {
          select: 'leads_assigned',
          eq: { id: leadData.booker }
        });
        
        if (bookerUser && bookerUser.length > 0) {
          const newCount = (bookerUser[0].leads_assigned || 0) + 1;
          await dbManager.update('users', { leads_assigned: newCount }, { id: leadData.booker });
        }

        // ✅ SCOREBOARD FIX: Set assigned_at timestamp for performance tracking
        await dbManager.update('leads', { 
          assigned_at: new Date().toISOString() 
        }, { id: lead.id });
        
        console.log(`📊 Lead ${lead.name} assigned to booker at ${new Date().toISOString()}`);
      } catch (error) {
        console.error('Failed to update booker leads count:', error);
      }
    }

    // Trigger booking confirmation (email/SMS) for newly created booked leads (NON-BLOCKING)
    if (leadData.status === 'Booked' && leadData.date_booked) {
      const { sendEmail, sendSms, templateId, secondaryTemplateId } = filteredBody || {};
      if (sendEmail || sendSms) {
        console.log(`📧 Triggering non-blocking booking confirmation for new lead ${lead.id}`);

        // Fire and forget - don't wait for completion
        withTimeout(
          MessagingService.sendBookingConfirmation(
            lead.id,
            leadData.booker,
            leadData.date_booked,
            { sendEmail, sendSms, templateId: templateId || null }
          ),
          30000,
          'Booking confirmation (new lead)'
        ).then(async (result) => {
          console.log(`✅ Booking confirmation sent for new lead ${lead.id}`);

          // Send WebSocket notification
          if (global.io) {
            global.io.emit('message_sent', {
              leadId: lead.id,
              type: 'booking_confirmation',
              status: 'success',
              channels: {
                email: result?.emailSent,
                sms: result?.smsSent
              },
              emailAccount: result?.emailAccount,
              emailAccountName: 'Auralndn',
              smsProvider: result?.smsProvider || 'The SMS Works',
              message: `Booking confirmation sent successfully via ${result?.emailSent ? 'Email' : ''}${result?.emailSent && result?.smsSent ? ' and ' : ''}${result?.smsSent ? 'SMS' : ''}`,
              timestamp: new Date()
            });
          }

          // Try to add booking history (non-blocking)
          const bookerUser = await dbManager.query('users', {
            select: 'name',
            eq: { id: leadData.booker }
          }).catch(() => []);

          addBookingHistoryEntry(
            lead.id,
            'BOOKING_CONFIRMATION_SENT',
            leadData.booker,
            bookerUser?.[0]?.name || 'System',
            {
              appointmentDate: leadData.date_booked,
              sentVia: {
                email: sendEmail || false,
                sms: sendSms || false
              },
              templateId: templateId || null,
              timestamp: new Date()
            },
            createLeadSnapshot(lead)
          ).catch(e => {
            console.error('⚠️ Booking history entry failed (non-critical):', e.message);
          });

          // Send secondary confirmation if template provided (non-blocking)
          if (secondaryTemplateId && sendEmail) {
            console.log(`📧 Sending secondary confirmation for new lead ${lead.id}`);
            withTimeout(
              MessagingService.sendBookingConfirmation(
                lead.id,
                leadData.booker,
                leadData.date_booked,
                { sendEmail: true, sendSms: false, templateId: secondaryTemplateId }
              ),
              30000,
              'Secondary confirmation'
            ).then(() => {
              console.log(`✅ Secondary confirmation sent for new lead ${lead.id}`);
            }).catch((err) => {
              console.error(`❌ Secondary confirmation failed for new lead ${lead.id}:`, err.message);
            });
          }
        }).catch((error) => {
          console.error(`❌ Booking confirmation failed for new lead ${lead.id}:`, error.message);

          // Send failure notification
          if (global.io) {
            global.io.emit('message_sent', {
              leadId: lead.id,
              type: 'booking_confirmation',
              status: 'failed',
              error: error.message,
              message: `Failed to send booking confirmation: ${error.message}`,
              timestamp: new Date()
            });
          }
        });
      }
    }

    // Enhanced real-time update for lead creation
    if (global.io) {
      const createPayload = {
        lead: lead,
        action: 'create',
        bookerId: lead.booker_id,
        leadId: lead.id,
        timestamp: new Date().toISOString()
      };

      // Emit multiple events for robustness
      global.io.emit('lead_created', createPayload);
      global.io.emit('stats_update_needed', {
        type: 'lead_created',
        bookerId: lead.booker_id,
        leadId: lead.id,
        timestamp: new Date().toISOString()
      });

      // Specific booking activity event for dashboard if it's a booking
      if (lead.status === 'Booked' || lead.date_booked) {
        global.io.emit('booking_activity', {
          action: 'created',
          booker: lead.booker_id,
          leadName: lead.name,
          dateBooked: lead.date_booked,
          status: lead.status,
          timestamp: new Date().toISOString()
        });
      }

      console.log('📡 EMITTED: Dashboard update events for lead creation', {
        leadId: lead.id,
        booker: lead.booker_id,
        status: lead.status,
        isBooking: !!(lead.status === 'Booked' || lead.date_booked)
      });
    } else {
      console.warn('⚠️ global.io not available - live updates will not work');
    }

    res.status(201).json({
      message: 'Lead created successfully',
      lead: lead
    });
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// @route   PUT /api/leads/:id
// @desc    Update lead
// @access  Private
router.put('/:id([0-9a-fA-F-]{36})', auth, async (req, res) => {
  let lead = null; // Declare lead outside try block for error handling
  try {
    console.log('🔄 Lead status update request:', {
      leadId: req.params.id,
      newStatus: req.body.status,
      userId: req.user.id,
      userRole: req.user.role,
      is_double_confirmed: req.body.is_double_confirmed,
      is_confirmed: req.body.is_confirmed,
      booking_status: req.body.booking_status
    });
    
    // Normalize incoming fields from various clients (camelCase vs snake_case)
    if (req.body && req.body.dateBooked && !req.body.date_booked) {
      req.body.date_booked = req.body.dateBooked;
    }
    if (req.body && req.body.timeBooked && !req.body.time_booked) {
      req.body.time_booked = req.body.timeBooked;
    }
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }
    // Get the lead from Supabase
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    if (!leads || leads.length === 0) {
      console.error('Update lead error: Lead not found or deleted');
      return res.status(404).json({ message: 'Lead not found' });
    }

    lead = leads[0];
    // ALL AUTHENTICATED USERS CAN UPDATE LEAD DETAILS
    // Removed role-based restrictions to allow all users (admin, viewer, booker) to update any lead
    console.log(`✅ Access granted: ${req.user.name} (${req.user.role}) can update lead ${lead.name}`);
    // Capture original values for history tracking
    const oldStatus = lead.status;
    const oldDateBooked = lead.date_booked;
    const currentUser = req.user;
    // Debug logging for reschedule attempts
    console.log(`🔍 Booking Debug for ${lead.name}:`, {
      oldStatus,
      newStatus: req.body.status,
      oldDateBooked: oldDateBooked || null,
      newDateBooked: req.body.date_booked || null,
      isNewBooking: (oldStatus === 'New' || !oldDateBooked) && req.body.date_booked && req.body.status === 'Booked',
      isReschedule: oldStatus === 'Booked' && req.body.status === 'Booked' && oldDateBooked && req.body.date_booked && (oldDateBooked || '').split('T')[0] !== (req.body.date_booked || '').split('T')[0],
      hasDateChange: oldDateBooked && req.body.date_booked && (oldDateBooked || '').split('T')[0] !== (req.body.date_booked || '').split('T')[0]
    });
    // Track changes for booking history - only for significant changes
    // Compare just the date portion (YYYY-MM-DD) to handle both old ISO format and new plain date format
    const isStatusChange = oldStatus !== req.body.status && req.body.status;
    const isDateChange = oldDateBooked && req.body.date_booked && (oldDateBooked || '').split('T')[0] !== (req.body.date_booked || '').split('T')[0];
    const isReschedule = oldStatus === 'Booked' && req.body.status === 'Booked' && oldDateBooked && req.body.date_booked && (oldDateBooked || '').split('T')[0] !== (req.body.date_booked || '').split('T')[0];
    const isNewBooking = (oldStatus === 'New' || !oldDateBooked) && req.body.date_booked && req.body.status === 'Booked';
    // Handle cancellation - set to Cancelled and clear booking date
    const isCancellation = req.body.status === 'Cancelled' || (req.body.status === 'New' && oldStatus === 'Booked' && !req.body.date_booked);
    
    // Check if this is just a simple field update (name, phone, email, etc.) - skip history and performance updates
    const isSimpleFieldUpdate = !isStatusChange && !isDateChange && !isNewBooking && !isReschedule && !isCancellation && 
                                 !req.body.date_booked && !req.body.time_booked && !req.body.booking_slot;

    // ✅ BLOCKED SLOTS CHECK: Prevent booking on blocked days/times
    if (req.body.date_booked) {
      const bookingDate = req.body.date_booked.split('T')[0]; // Extract YYYY-MM-DD
      const bookingTime = req.body.time_booked;
      const bookingSlot = req.body.booking_slot;

      // Check if this slot is blocked
      let blockedQuery = supabase
        .from('blocked_slots')
        .select('*')
        .eq('date', bookingDate);

      const { data: blockedSlots, error: blockedError } = await blockedQuery;

      if (!blockedError && blockedSlots && blockedSlots.length > 0) {
        const isBlocked = blockedSlots.some(block => {
          // Full day block
          if (!block.time_slot) {
            if (block.slot_number && bookingSlot) {
              return parseInt(block.slot_number) === parseInt(bookingSlot);
            }
            return true;
          }

          // Specific time slot block
          if (bookingTime && block.time_slot === bookingTime) {
            if (block.slot_number && bookingSlot) {
              return parseInt(block.slot_number) === parseInt(bookingSlot);
            }
            return true;
          }

          return false;
        });

        if (isBlocked) {
          const blockReason = blockedSlots.find(b => !b.time_slot || (bookingTime && b.time_slot === bookingTime))?.reason || 'Unavailable';
          return res.status(409).json({
            message: 'This time slot is blocked',
            error: `Cannot book appointment: ${blockReason}`,
            blockedSlots: blockedSlots.filter(b => !b.time_slot || (bookingTime && b.time_slot === bookingTime))
          });
        }
      }
    }

    // ✅ DAILY ACTIVITY FIX: Set booked_at timestamp when status changes to Booked
    if (oldStatus !== 'Booked' && req.body.status === 'Booked') {
      req.body.booked_at = new Date().toISOString();
      req.body.ever_booked = true; // ✅ BOOKING HISTORY FIX: Mark as ever booked (will be converted to snake_case)
      console.log(`📊 Setting booked_at and ever_booked for ${lead.name}: ${req.body.booked_at}`);
    }
    
    // ✅ CANCELLATION UPDATE: Clear booking information on cancellation
    // This allows cancelled leads to be reassigned as new leads later
    // Booking history will preserve the original appointment details
    if (req.body.status === 'Cancelled') {
      // If booking fields are explicitly set to null in request, allow clearing them
      // Otherwise, clear them automatically for cancellations
      if (req.body.date_booked === null || !req.body.hasOwnProperty('date_booked')) {
        req.body.date_booked = null;
        req.body.time_booked = null;
        req.body.booking_slot = null;
        req.body.is_confirmed = null;
        req.body.booking_status = null;
        console.log(`📅 Lead cancelled - clearing all booking information to allow reassignment`);
      } else {
        console.log(`📅 Lead cancelled but keeping booking information as requested`);
      }
    }
    // Update the lead - filter out problematic fields and ensure valid data types
    const { _id, ...updateData } = req.body;
    
    // Filter out any fields that might cause SQLite binding issues
    const validUpdateData = {};
    for (const [key, value] of Object.entries(updateData)) {
      // Do not persist transient messaging flags and computed fields
      if (key === 'sendEmail' || key === 'sendSms' || key === 'templateId' || key === 'booker_name' || key === 'booker_email') continue;
      if (value === undefined) continue; // Skip undefined values completely

      // Convert camelCase field names to snake_case for database columns
      const dbKey = key === 'bookingHistory' ? 'booking_history' :
                    key === 'dateBooked' ? 'date_booked' :
                    key === 'timeBooked' ? 'time_booked' :
                    key === 'bookingSlot' ? 'booking_slot' :
                    key === 'isConfirmed' ? 'is_confirmed' :
                    key === 'isDoubleConfirmed' ? 'is_double_confirmed' :
                    key === 'reviewDate' ? 'review_date' :
                    key === 'reviewTime' ? 'review_time' :
                    key === 'reviewSlot' ? 'review_slot' :
                    key === 'hasSale' ? 'has_sale' :
                    key === 'bookingStatus' ? 'booking_status' :
                    key === 'everBooked' ? 'ever_booked' :
                    key === 'bookedAt' ? 'booked_at' :
                    key === 'booker' ? 'booker_id' : // Map 'booker' to 'booker_id'
                    key === 'leadSource' ? 'lead_source' :
                    key === 'entryDate' ? 'entry_date' :
                    key;

      // Convert Date objects to ISO strings
      if (value instanceof Date) {
        validUpdateData[dbKey] = value.toISOString();
        continue;
      }

      const valueType = typeof value;
      if (value === null || valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
        validUpdateData[dbKey] = value;
        continue;
      }

      // For plain objects/arrays, flatten booker and rescheduleReason fields, otherwise store as string or skip
      if (valueType === 'object') {
        if (key === 'booker') {
          // If booker is an object, try to extract id or name, otherwise stringify
          if (value && typeof value === 'object') {
            validUpdateData[dbKey] = value.id || value._id || value.name || JSON.stringify(value);
          } else {
            validUpdateData[dbKey] = String(value);
          }
        } else if (key === 'rescheduleReason') {
          validUpdateData[dbKey] = String(value);
        } else {
          try {
            validUpdateData[dbKey] = JSON.stringify(value);
          } catch (jsonErr) {
            console.warn(`⚠️ Skipping field '${key}' – could not stringify value for SQLite`, jsonErr);
          }
        }
      }
    }
    
    // Fix the SQLite binding issue by ensuring all values are properly converted
    const updateFields = {
      ...validUpdateData,
      updated_by_user_id: req.user.id, // Track who last updated this booking
      updated_at: new Date().toISOString()
    };

    // Filter out any invalid values and convert objects to strings
    const filteredUpdateFields = {};
    for (const [key, value] of Object.entries(updateFields)) {
      if (key === 'sendEmail' || key === 'sendSms' || key === 'templateId') continue;
      
      // For certain fields, we want to allow null values to clear them
      const allowNullFields = ['booking_status', 'date_booked', 'reschedule_reason'];
      if (value === null && allowNullFields.includes(key)) {
        filteredUpdateFields[key] = null;
        continue;
      }

      // Special handling for date_booked - always include it if it's defined
      if (key === 'date_booked') {
        if (value === null) {
          filteredUpdateFields[key] = null;
        } else if (value !== undefined) {
          filteredUpdateFields[key] = value;
        }
        continue;
      }

      if (value === null || value === undefined) {
        continue; // Skip null/undefined values for other fields
      }
      
      if (typeof value === 'object') {
        // Convert objects to JSON strings
        try {
          filteredUpdateFields[key] = JSON.stringify(value);
        } catch (jsonErr) {
          console.warn(`⚠️ Skipping field '${key}' – could not stringify value for SQLite`, jsonErr);
          continue;
        }
      } else if (typeof value === 'boolean') {
        // Convert booleans to integers for SQLite
        filteredUpdateFields[key] = value ? 1 : 0;
      } else {
        // Keep strings, numbers as they are
        filteredUpdateFields[key] = value;
      }
    }

    // Debug: Log what's in validUpdateData and filteredUpdateFields
    console.log('🔍 Debug is_double_confirmed flow:', {
      in_reqBody: req.body.is_double_confirmed,
      in_validUpdateData: validUpdateData.is_double_confirmed,
      in_updateFields: updateFields.is_double_confirmed,
      in_filteredUpdateFields: filteredUpdateFields.is_double_confirmed
    });

    // Update the lead using Supabase
    if (Object.keys(filteredUpdateFields).length > 0) {
      // Convert boolean values to integers for Supabase
      const supabaseUpdateFields = { ...filteredUpdateFields };
      if (supabaseUpdateFields.is_confirmed !== undefined) {
        supabaseUpdateFields.is_confirmed = supabaseUpdateFields.is_confirmed ? 1 : 0;
      }
      if (supabaseUpdateFields.is_double_confirmed !== undefined) {
        supabaseUpdateFields.is_double_confirmed = supabaseUpdateFields.is_double_confirmed ? 1 : 0;
      }
      
      // ✅ SCOREBOARD FIX: Set booked_at timestamp when status changes to 'Booked'
      // Check both supabaseUpdateFields.status and req.body.status to catch all booking scenarios
      const isBeingBooked = (supabaseUpdateFields.status === 'Booked' || req.body.status === 'Booked') && lead.status !== 'Booked';
      if (isBeingBooked) {
        supabaseUpdateFields.booked_at = new Date().toISOString();
        supabaseUpdateFields.ever_booked = 1; // Use integer 1 for database consistency
        console.log(`📊 Lead ${lead.name} booked at ${supabaseUpdateFields.booked_at}, ever_booked set to 1`);
      }
      
      // ✅ ENSURE ever_booked is ALWAYS set when booked_at exists
      // This catches any edge cases where ever_booked might not be set
      if (supabaseUpdateFields.booked_at && !supabaseUpdateFields.ever_booked) {
        supabaseUpdateFields.ever_booked = 1;
        console.log(`📊 Ensuring ever_booked is set for ${lead.name}`);
      }
      
      // ✅ BOOKER LOCK: Once booker_id is set, it NEVER changes via this endpoint.
      // Reassignment only happens through the dedicated /assign endpoint.
      if (lead.booker_id && supabaseUpdateFields.booker_id) {
        if (supabaseUpdateFields.booker_id !== lead.booker_id) {
          console.log(`🔒 Blocked booker_id overwrite for ${lead.name}: keeping ${lead.booker_id}, rejected ${supabaseUpdateFields.booker_id}`);
        }
        delete supabaseUpdateFields.booker_id;
      }

      // ✅ DATE ASSIGNED FIX: Set assigned_at when booker_id is set or changed
      // This ensures all assigned leads have an assigned_at timestamp for proper filtering
      const newBookerId = supabaseUpdateFields.booker_id !== undefined ? supabaseUpdateFields.booker_id : lead.booker_id;
      const oldBookerId = lead.booker_id;
      const isBeingAssigned = newBookerId && (!oldBookerId || newBookerId !== oldBookerId);
      const hasNoAssignedAt = !lead.assigned_at;
      
      if (isBeingAssigned || (newBookerId && hasNoAssignedAt)) {
        supabaseUpdateFields.assigned_at = new Date().toISOString();
        console.log(`📅 Lead ${lead.name} assigned_at set to ${supabaseUpdateFields.assigned_at} (booker: ${newBookerId})`);
      }
      
      // Add detailed logging for status updates
      console.log('🔄 Starting status update:', {
        leadId: req.params.id,
        oldStatus: lead.status,
        newStatus: supabaseUpdateFields.status,
        fieldsToUpdate: Object.keys(supabaseUpdateFields),
        is_double_confirmed: supabaseUpdateFields.is_double_confirmed,
        is_confirmed: supabaseUpdateFields.is_confirmed,
        booking_status: supabaseUpdateFields.booking_status
      });
      
      const updateResult = await dbManager.update('leads', supabaseUpdateFields, { id: req.params.id });
      
      if (!updateResult || updateResult.length === 0) {
        console.error('❌ Update lead error: Failed to update lead', {
          leadId: req.params.id,
          fields: supabaseUpdateFields,
          error: 'No rows updated'
        });
        return res.status(500).json({ message: 'Failed to update lead' });
      }
      
      console.log('✅ Status update successful:', {
        leadId: req.params.id,
        newStatus: updateResult[0]?.status,
        is_double_confirmed_returned: updateResult[0]?.is_double_confirmed,
        is_confirmed_returned: updateResult[0]?.is_confirmed
      });
    }
    
    // Get the updated lead
    const updatedLeadResult = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });
    
    if (!updatedLeadResult || updatedLeadResult.length === 0) {
      console.error('Update lead error: Failed to fetch updated lead');
      return res.status(500).json({ message: 'Failed to fetch updated lead' });
    }

    const updatedLead = updatedLeadResult[0];

    // ✅ SCOREBOARD FIX: Update daily performance metrics only for significant changes (status, booking dates)
    // Skip for simple field updates (name, phone, email, etc.) to improve performance
    if (updatedLead.booker_id && !isSimpleFieldUpdate) {
      try {
        const bookerAnalytics = require('./booker-analytics');
        await bookerAnalytics.updateDailyPerformance(updatedLead.booker_id);
        console.log(`📊 Updated daily performance for booker ${updatedLead.booker_id}`);
      } catch (perfError) {
        console.error('Failed to update daily performance:', perfError.message);
      }
    }
    // Add booking history entries based on the type of change
    // Make these non-blocking to prevent crashes if booking history update fails
    if (isNewBooking) {
      console.log(`📅 Adding INITIAL_BOOKING for lead ${lead.name} (oldStatus: ${oldStatus}, oldDateBooked: ${oldDateBooked})`);
      // Non-blocking: Don't await - if it fails, status update still succeeds
      addBookingHistoryEntry(
          req.params.id,
          'INITIAL_BOOKING',
          currentUser.id,
          currentUser.name,
        {
          newDate: req.body.date_booked,
          notes: `Appointment booked for ${lead.name}`
        },
        createLeadSnapshot(updatedLead)
      ).catch(err => {
        console.error('⚠️ Booking history update failed (non-critical):', err.message);
        // Don't throw - status update should still succeed
      });

      // Trigger booking confirmation (email + optional SMS per template) (NON-BLOCKING)
      if (req.body.date_booked) {
        const { sendEmail, sendSms, templateId } = req.body;
        if (sendEmail || sendSms) {
          console.log(`📧 Triggering non-blocking booking confirmation (initial booking) for lead ${req.params.id}`);

          // Fire and forget - don't wait for completion
          withTimeout(
            MessagingService.sendBookingConfirmation(
              req.params.id,
              currentUser.id,
              req.body.date_booked,
              { sendEmail, sendSms, templateId: templateId || null }
            ),
            30000,
            'Booking confirmation (initial booking)'
          ).then((result) => {
            console.log(`✅ Booking confirmation sent (initial booking) for lead ${req.params.id}`);

            // Send WebSocket notification
            if (global.io) {
              global.io.emit('message_sent', {
                leadId: req.params.id,
                type: 'booking_confirmation',
                status: 'success',
                channels: {
                  email: result?.emailSent,
                  sms: result?.smsSent
                },
                emailAccount: result?.emailAccount,
                emailAccountName: 'Auralndn',
                smsProvider: result?.smsProvider || 'The SMS Works',
                message: `Booking confirmation sent successfully via ${result?.emailSent ? 'Email' : ''}${result?.emailSent && result?.smsSent ? ' and ' : ''}${result?.smsSent ? 'SMS' : ''}`,
                timestamp: new Date()
              });
            }

            // Try to add booking history (non-blocking)
            addBookingHistoryEntry(
              req.params.id,
              'BOOKING_CONFIRMATION_SENT',
              currentUser.id,
              currentUser.name,
              {
                appointmentDate: req.body.date_booked,
                sentVia: {
                  email: sendEmail || false,
                  sms: sendSms || false
                },
                templateId: templateId || null,
                timestamp: new Date()
              },
              createLeadSnapshot(updatedLead)
            ).catch(e => {
              console.error('⚠️ Booking history entry failed (non-critical):', e.message);
            });
          }).catch((error) => {
            console.error(`❌ Booking confirmation failed (initial booking) for lead ${req.params.id}:`, error.message);

            // Send failure notification
            if (global.io) {
              global.io.emit('message_sent', {
                leadId: req.params.id,
                type: 'booking_confirmation',
                status: 'failed',
                error: error.message,
                message: `Failed to send booking confirmation: ${error.message}`,
                timestamp: new Date()
              });
            }
          });
        }
      }
    } else if (isReschedule || isDateChange) {
      console.log(`📅 Adding RESCHEDULE for lead ${lead.name} (oldDate: ${oldDateBooked}, newDate: ${req.body.date_booked})`);
      // Non-blocking: Don't await - if it fails, status update still succeeds
      addBookingHistoryEntry(
          req.params.id,
          'RESCHEDULE',
          currentUser.id,
          currentUser.name,
        {
          oldDate: oldDateBooked,
          newDate: req.body.date_booked,
          // Preserve the original slot/time so the calendar can show a "rescheduled away"
          // ghost marker in the exact slot it used to occupy on the original date.
          oldTimeBooked: lead.time_booked || null,
          oldBookingSlot: lead.booking_slot || null,
          oldBookingStatus: lead.booking_status,
          newBookingStatus: req.body.booking_status,
          oldIsConfirmed: lead.is_confirmed,
          newIsConfirmed: req.body.is_confirmed,
          reason: req.body.reschedule_reason || 'Appointment rescheduled',
          notes: `Appointment rescheduled from ${new Date(oldDateBooked).toLocaleString()} to ${new Date(req.body.date_booked).toLocaleString()}. Status reset: ${lead.booking_status || 'none'} → ${req.body.booking_status || 'none'}`
        },
        createLeadSnapshot(updatedLead)
      ).catch(err => {
        console.error('⚠️ Booking history update failed (non-critical):', err.message);
        // Don't throw - status update should still succeed
      });

      // Also send updated booking confirmation on reschedule (NON-BLOCKING)
      if (req.body.date_booked) {
        const { sendEmail, sendSms, templateId } = req.body;
        if (sendEmail || sendSms) {
          console.log(`📧 Triggering non-blocking reschedule confirmation for lead ${req.params.id}`);

          // Fire and forget - don't wait for completion
          withTimeout(
            MessagingService.sendBookingConfirmation(
              req.params.id,
              currentUser.id,
              req.body.date_booked,
              { sendEmail, sendSms, templateId: templateId || null }
            ),
            30000,
            'Booking confirmation (reschedule)'
          ).then((result) => {
            console.log(`✅ Reschedule confirmation sent for lead ${req.params.id}`);

            // Send WebSocket notification
            if (global.io) {
              global.io.emit('message_sent', {
                leadId: req.params.id,
                type: 'booking_confirmation',
                status: 'success',
                channels: {
                  email: result?.emailSent,
                  sms: result?.smsSent
                },
                emailAccount: result?.emailAccount,
                emailAccountName: 'Auralndn',
                smsProvider: result?.smsProvider || 'The SMS Works',
                message: `Reschedule confirmation sent successfully via ${result?.emailSent ? 'Email' : ''}${result?.emailSent && result?.smsSent ? ' and ' : ''}${result?.smsSent ? 'SMS' : ''}`,
                timestamp: new Date()
              });
            }

            // Try to add booking history (non-blocking)
            addBookingHistoryEntry(
              req.params.id,
              'BOOKING_CONFIRMATION_SENT',
              currentUser.id,
              currentUser.name,
              {
                appointmentDate: req.body.date_booked,
                sentVia: {
                  email: sendEmail || false,
                  sms: sendSms || false
                },
                templateId: templateId || null,
                isReschedule: true,
                timestamp: new Date()
              },
              createLeadSnapshot(updatedLead)
            ).catch(e => {
              console.error('⚠️ Booking history entry failed (non-critical):', e.message);
            });
          }).catch((error) => {
            console.error(`❌ Reschedule confirmation failed for lead ${req.params.id}:`, error.message);

            // Send failure notification
            if (global.io) {
              global.io.emit('message_sent', {
                leadId: req.params.id,
                type: 'booking_confirmation',
                status: 'failed',
                error: error.message,
                message: `Failed to send reschedule confirmation: ${error.message}`,
                timestamp: new Date()
              });
            }
          });
        }
      }
    } else if (isCancellation) {
      console.log(`📅 Adding CANCELLATION for lead ${lead.name} - moving to Cancelled`);
      // Non-blocking: Don't await - if it fails, status update still succeeds
      addBookingHistoryEntry(
          req.params.id,
          'CANCELLATION',
          currentUser.id,
          currentUser.name,
        {
          oldStatus: oldStatus,
          newStatus: 'Cancelled',
          oldDate: oldDateBooked,
          reason: req.body.cancellation_reason || 'Appointment cancelled via calendar',
          notes: `Appointment cancelled and lead moved to Cancelled - was scheduled for ${oldDateBooked ? new Date(oldDateBooked).toLocaleString() : 'unknown date'}`
        },
        createLeadSnapshot(updatedLead)
      ).catch(err => {
        console.error('⚠️ Booking history update failed (non-critical):', err.message);
        // Don't throw - status update should still succeed
      });
    } else if (isStatusChange) {
      console.log(`📅 Adding STATUS_CHANGE for lead ${lead.name}: ${oldStatus} → ${req.body.status}`);
      // Non-blocking: Don't await - if it fails, status update still succeeds
      addBookingHistoryEntry(
          req.params.id,
          'STATUS_CHANGE',
          currentUser.id,
          currentUser.name,
        {
          oldStatus: oldStatus,
          newStatus: req.body.status,
          notes: `Status changed from ${oldStatus} to ${req.body.status}`
        },
        createLeadSnapshot(updatedLead)
      ).catch(err => {
        console.error('⚠️ Booking history update failed (non-critical):', err.message);
        // Don't throw - status update should still succeed
      });
    }
    // Sync ReplyDesk status if this lead was sent to Alex A.I
    if (oldStatus !== req.body.status && req.body.status && lead.replydesk_sent_at) {
      const statusMap = { 'Booked': 'Booked', 'Cancelled': 'cancelled', 'Rejected': 'cancelled', 'Attended': 'Booked' };
      const rdStatus = statusMap[req.body.status];
      if (rdStatus) {
        supabase.from('leads').update({ replydesk_status: rdStatus, replydesk_last_updated: new Date().toISOString() }).eq('id', req.params.id)
          .then(() => { if (global.io) global.io.emit('replydesk_queue_update', { action: 'updated', leadId: req.params.id, status: rdStatus }); })
          .catch(err => console.error('ReplyDesk status sync failed:', err.message));
      }
    }
    // Update user statistics if status changed (non-blocking)
    if (oldStatus !== req.body.status && req.body.status && lead.booker_id) {
      updateUserStatistics(lead.booker_id, {
        from: oldStatus,
        to: req.body.status
      }).catch(err => {
        console.error('⚠️ User statistics update failed (non-critical):', err.message);
        // Don't throw - status update should still succeed
      });
    }
    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_updated', {
        lead: updatedLead,
        action: 'update',
        timestamp: new Date(),
        statusChange: oldStatus !== req.body.status ? {
          from: oldStatus,
          to: req.body.status
        } : null
      });

      // Emit stats update for dashboard real-time refresh
      global.io.emit('stats_update_needed', {
        type: 'lead_updated',
        bookerId: updatedLead.booker_id,
        leadId: req.params.id,
        timestamp: new Date()
      });

      // Emit booking activity if this is a booking
      if (updatedLead.status === 'Booked' || updatedLead.date_booked) {
        global.io.emit('booking_activity', {
          action: 'updated',
          booker: updatedLead.booker_id,
          leadName: updatedLead.name,
          dateBooked: updatedLead.date_booked,
          timestamp: new Date()
        });
      }

      global.io.emit('calendar_sync_needed', {
        type: 'lead_updated',
        leadId: req.params.id,
        timestamp: new Date()
      });
      if (oldStatus !== req.body.status && req.body.status) {
        global.io.emit('diary_updated', {
          type: 'DIARY_UPDATE',
          data: {
            leadId: req.params.id,
            leadName: updatedLead.name,
            oldStatus: oldStatus,
            newStatus: req.body.status,
            dateBooked: req.body.date_booked || updatedLead.date_booked,
            timestamp: new Date().toISOString(),
            updatedBy: currentUser.name,
            updatedAt: new Date().toISOString()
          }
        });
        global.io.emit('booking_update', {
          leadId: req.params.id,
          leadName: updatedLead.name,
          oldStatus: oldStatus,
          newStatus: req.body.status,
          dateBooked: req.body.date_booked || updatedLead.date_booked,
          updatedBy: currentUser.name
        });
        console.log(`📅 Diary update emitted: ${updatedLead.name} - ${oldStatus} → ${req.body.status}`);
      }
    }
    console.log('📤 Returning updated lead:', {
      leadId: updatedLead.id,
      is_double_confirmed: updatedLead.is_double_confirmed,
      is_confirmed: updatedLead.is_confirmed,
      booking_status: updatedLead.booking_status
    });
    res.json({
      message: 'Lead updated successfully',
      lead: updatedLead
    });
  } catch (error) {
    console.error('❌ STATUS UPDATE FAILED:', {
      leadId: req.params.id,
      oldStatus: lead?.status,
      newStatus: req.body?.status,
      error: error.message,
      errorCode: error.code,
      errorDetails: error.details || error.hint,
      stack: error.stack?.split('\n')[0] // First line of stack
    });
    res.status(500).json({ 
      message: 'Server error during status update',
      error: error.message,
      leadId: req.params.id
    });
  }
});

// @route   POST /api/leads/:id/no-answer
// @desc    Increment no answer count for retargeting
// @access  Private
router.post('/:id/no-answer', auth, async (req, res) => {
  try {
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    const lead = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id },
      is: { deleted_at: null }
    });

    if (!lead || lead.length === 0) {
      console.error('No answer increment error: Lead not found or deleted');
      return res.status(404).json({ message: 'Lead not found' });
    }

    const leadData = lead[0];

    // Check if user can update this lead
    if (req.user.role !== 'admin' && leadData.booker_id && leadData.booker_id.toString() !== req.user.id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Initialize retargeting object if it doesn't exist
    let retargeting = {};
    if (leadData.retargeting) {
      try {
        retargeting = JSON.parse(leadData.retargeting);
      } catch (e) {
        retargeting = {};
      }
    }

    if (!retargeting.no_answer_count) {
      retargeting = {
        no_answer_count: 0,
        is_eligible: false,
        status: 'ACTIVE',
        exclude_from_retargeting: false,
        campaigns_sent: []
      };
    }

    // Increment no answer count (max 10)
    const currentCount = retargeting.no_answer_count || 0;
    if (currentCount >= 10) {
      return res.status(400).json({ message: 'Maximum no answer count reached' });
    }

    retargeting.no_answer_count = currentCount + 1;
    retargeting.last_contact_attempt = new Date().toISOString();

    // Update the lead
    await dbManager.update('leads', { retargeting: JSON.stringify(retargeting) }, { id: req.params.id });

    // Check if lead becomes eligible for retargeting (3+ no answers, 3+ weeks old, not booked/converted)
    const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
    const isOldEnough = new Date(lead.created_at) <= threeWeeksAgo;
    const hasEnoughNoAnswers = retargeting.no_answer_count >= 3;
    const isEligibleStatus = !['Booked', 'Attended'].includes(lead.status);
    
    if (isOldEnough && hasEnoughNoAnswers && isEligibleStatus && !retargeting.exclude_from_retargeting) {
      retargeting.is_eligible = true;
      retargeting.eligible_since = retargeting.eligible_since || new Date().toISOString();
      
      await dbManager.update('leads', { retargeting: JSON.stringify(retargeting) }, { id: req.params.id });
    }

    // Get the updated lead
    const updatedLeads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });
    const updatedLead = updatedLeads[0];

    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_updated', {
        lead: updatedLead,
        action: 'no_answer_update',
        timestamp: new Date()
      });
    }

    res.json(updatedLead);
  } catch (error) {
    console.error('No answer increment error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/leads/:id/assign
// @desc    Assign lead to a different user
// @access  Admin only
router.put('/:id/assign', auth, adminAuth, async (req, res) => {
  try {
    console.log('🔄 Assignment request - Lead ID:', req.params.id, 'Body:', req.body);
    
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    const { booker } = req.body;
    
    if (!booker) {
      return res.status(400).json({ message: 'Invalid booker ID format' });
    }
    
    console.log('👤 Assigning lead', req.params.id, 'to booker:', booker);

    // Get the lead using Supabase
    const lead = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id },
      is: { deleted_at: null }
    });

    if (!lead || lead.length === 0) {
      console.error('Assign lead error: Lead not found or deleted');
      return res.status(404).json({ message: 'Lead not found' });
    }

    const leadData = lead[0];
    const oldBookerId = leadData.booker_id;

    // Update the lead - assign booker and change status to Assigned if currently New
    // Use service role client to bypass RLS policies
    const serviceRoleClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey || config.supabase.anonKey
    );

    const { data: updateResult, error: updateError } = await serviceRoleClient
      .from('leads')
      .update({
        booker_id: booker,
        status: leadData.status === 'New' ? 'Assigned' : leadData.status,
        assigned_at: new Date().toISOString(), // Track when lead was assigned
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError || !updateResult) {
      console.error('Assign lead error: Failed to update lead', updateError);
      
      // Handle RLS policy violations gracefully
      if (updateError?.code === '42501') {
        console.warn('⚠️ RLS policy violation during lead assignment - this may be due to automatic assignment creation');
        // Try to continue without failing the request
        // The lead might still be updated despite the assignment error
      } else {
        return res.status(500).json({ message: 'Failed to assign lead', error: updateError?.message });
      }
    }

    const updatedLead = updateResult;
    
    console.log('✅ Lead assignment completed:', {
      leadId: req.params.id,
      leadName: updatedLead.name,
      newBooker: booker,
      newStatus: updatedLead.status,
      oldBooker: oldBookerId
    });

    // Update user statistics using service role client
    if (oldBookerId && oldBookerId.toString() !== booker) {
      try {
        // Decrease old user's assigned count
        const { data: oldUser } = await serviceRoleClient
          .from('users')
          .select('leads_assigned')
          .eq('id', oldBookerId)
          .single();

        if (oldUser) {
          const newCount = Math.max((oldUser.leads_assigned || 0) - 1, 0);
          await serviceRoleClient
            .from('users')
            .update({ leads_assigned: newCount })
            .eq('id', oldBookerId);
        }

        // Increase new user's assigned count
        const { data: newUser } = await serviceRoleClient
          .from('users')
          .select('leads_assigned')
          .eq('id', booker)
          .single();

        if (newUser) {
          const newCount = (newUser.leads_assigned || 0) + 1;
          await serviceRoleClient
            .from('users')
            .update({ leads_assigned: newCount })
            .eq('id', booker);
        }
      } catch (error) {
        console.error('Failed to update user statistics:', error);
      }
    }

    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_reassigned', {
        lead: updatedLead,
        action: 'reassign',
        timestamp: new Date(),
        oldBooker: oldBookerId,
        newBooker: booker
      });
    }

    res.json(updatedLead);
  } catch (error) {
    console.error('Assign lead error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/leads/:id
// @desc    Delete lead
// @access  Admin only
router.delete('/:id([0-9a-fA-F-]{36})', auth, adminAuth, async (req, res) => {
  try {
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    // Get lead data using Supabase
    const lead = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id },
      is: { deleted_at: null }
    });

    if (!lead || lead.length === 0) {
      console.error('Delete lead error: Lead not found or deleted');
      return res.status(404).json({ message: 'Lead not found' });
    }

    const leadData = lead[0];
    
    // Delete related sales first (cascade delete) using Supabase
    const salesDeleteResult = await dbManager.delete('sales', {
      eq: { lead_id: req.params.id }
    });
    console.log(`🗑️ Deleted ${salesDeleteResult ? salesDeleteResult.length : 0} related sales for lead ${req.params.id}`);

    // Delete related messages (SMS/email history) using Supabase
    try {
      await dbManager.delete('messages', {
        eq: { lead_id: req.params.id }
      });
      console.log(`🗑️ Deleted messages for lead ${req.params.id}`);
    } catch (msgErr) {
      console.error('Failed to delete related messages:', msgErr.message);
    }

    // Delete related booking_history entries using Supabase
    try {
      await dbManager.delete('booking_history', {
        eq: { lead_id: req.params.id }
      });
      console.log(`🗑️ Deleted booking_history for lead ${req.params.id}`);
    } catch (bhErr) {
      console.error('Failed to delete related booking_history:', bhErr.message);
    }

    // Delete the lead using Supabase
    const deleteResult = await dbManager.delete('leads', {
      eq: { id: req.params.id }
    });

    if (!deleteResult || deleteResult.length === 0) {
      console.error('Delete lead error: Database delete failed');
      return res.status(500).json({ message: 'Server error' });
    }

    // Update user's leads assigned count using Supabase
    if (leadData.booker_id) {
      const user = await dbManager.query('users', {
        select: 'leads_assigned',
        eq: { id: leadData.booker_id }
      });
      
      if (user && user.length > 0) {
        const newCount = Math.max((user[0].leads_assigned || 0) - 1, 0);
        await dbManager.update('users', { leads_assigned: newCount }, { id: leadData.booker_id });
      }
    }

    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_deleted', {
        leadId: req.params.id,
        action: 'delete',
        timestamp: new Date()
      });

      // Emit sales deletion notification
      if (salesDeleteResult && salesDeleteResult.length > 0) {
        global.io.emit('sales_deleted', {
          action: 'delete',
          deletedCount: salesDeleteResult.length,
          leadId: req.params.id,
          timestamp: new Date()
        });
        console.log(`📡 Emitted sales_deleted event for ${salesDeleteResult.length} sales`);
      }

      // Emit diary update for shared diary synchronization if this was a booked lead
      if (lead.status === 'Booked' || lead.status === 'Attended') {
        global.io.emit('diary_updated', {
          type: 'DIARY_UPDATE',
          data: {
            leadId: req.params.id,
            leadName: lead.name,
            oldStatus: lead.status,
            newStatus: 'Deleted',
            dateBooked: lead.date_booked,
            timestamp: new Date().toISOString(),
            updatedBy: req.user.name,
            updatedAt: new Date().toISOString()
          }
        });
        
        console.log(`📅 Diary update emitted for deleted booking: ${lead.name} - ${lead.status} → Deleted`);
      }
    }

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/leads/bulk
// @desc    Delete multiple leads
// @access  Admin only
router.delete('/bulk', auth, adminAuth, async (req, res) => {
  try {
    console.log('🗑️ Bulk delete request received');
    
    const { leadIds } = req.body;
    
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      console.log('❌ Invalid leadIds array:', leadIds);
      return res.status(400).json({ message: 'Please provide an array of lead IDs' });
    }

    console.log(`🔍 Received ${leadIds.length} lead IDs for deletion`);

    // Clean and validate IDs - convert any potential objects to strings and validate format
    const validatedIds = [];
    const invalidIds = [];

    leadIds.forEach((id, index) => {
      // Handle various ID types and convert to string
      let idString = String(id || '').trim();
      if (typeof id === 'object' && id !== null) {
        // If it's an ObjectId or has toString()
        idString = String(id.toString()).trim();
      }
      
      // Debug the ID format
      console.log(`🔍 ID #${index}: '${idString}' (type: ${typeof id}, length: ${idString?.length || 0})`);
      
      // More lenient UUID validation - accept UUIDs (36 chars with dashes) or any non-empty string
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (idString && idString.length > 0) {
        // Accept if it's a valid UUID format OR if it's 36 characters (might be UUID without dashes or different format)
        if (uuidRegex.test(idString) || idString.length === 36) {
          validatedIds.push(idString);
        } else {
          // Still accept it if it's a reasonable length (might be a different ID format)
          // But log a warning
          console.log(`   ⚠️ ID format unusual but accepting: '${idString}' (length: ${idString.length})`);
          validatedIds.push(idString);
        }
      } else {
        invalidIds.push(id);
        console.log(`   ❌ Invalid ID: '${idString}' - empty or null`);
      }
    });

    if (invalidIds.length > 0) {
      console.log(`⚠️ Found ${invalidIds.length} invalid IDs out of ${leadIds.length}`);
      console.log('⚠️ Sample invalid IDs:', invalidIds.slice(0, 5));
    }

    if (validatedIds.length === 0) {
      return res.status(400).json({ 
        message: 'No valid lead IDs provided',
        invalidCount: invalidIds.length,
        totalCount: leadIds.length,
        details: 'All provided IDs failed validation. IDs must be valid 36-character UUID strings.',
        invalidIds: invalidIds.slice(0, 10) // Return first 10 invalid IDs for debugging
      });
    }

    // Find all leads to get their details before deletion using Supabase
    const leads = await dbManager.query('leads', {
      select: 'id, name, status, date_booked, booker_id',
      in: { id: validatedIds },
      is: { deleted_at: null }
    });

    if (!leads) {
      console.error('❌ Bulk delete leads error: Database query failed');
      return res.status(500).json({ message: 'Server error' });
    }
    
    console.log(`🔍 Found ${leads.length} leads to delete out of ${validatedIds.length} requested`);
    
    if (leads.length === 0) {
      return res.status(404).json({ 
        message: 'No leads found with provided IDs',
        requestedIds: validatedIds,
        details: 'Leads may have already been deleted or do not exist'
      });
    }

    // Extract the IDs of leads that were actually found
    const foundLeadIds = leads.map(lead => lead.id);

    // Delete related sales first (cascade delete) using Supabase
    try {
      await dbManager.delete('sales', {
        in: { lead_id: foundLeadIds }
      });
      console.log(`🗑️ Deleted related sales for ${foundLeadIds.length} leads`);
    } catch (error) {
      console.error('Failed to delete related sales:', error);
      // Continue with lead deletion even if sales deletion fails
    }

    // Delete related messages (SMS/email history) using Supabase
    try {
      await dbManager.delete('messages', {
        in: { lead_id: foundLeadIds }
      });
      console.log(`🗑️ Deleted messages for ${foundLeadIds.length} leads`);
    } catch (error) {
      console.error('Failed to delete related messages:', error);
    }

    // Delete related booking_history entries using Supabase
    try {
      await dbManager.delete('booking_history', {
        in: { lead_id: foundLeadIds }
      });
      console.log(`🗑️ Deleted booking_history for ${foundLeadIds.length} leads`);
    } catch (error) {
      console.error('Failed to delete related booking_history:', error);
    }

    // Delete all found leads using Supabase
    try {
      await dbManager.delete('leads', {
        in: { id: foundLeadIds }
      });
      console.log(`🗑️ Successfully deleted ${foundLeadIds.length} leads`);
    } catch (deleteError) {
      console.error('❌ Bulk delete leads error: Database delete failed:', deleteError);
      return res.status(500).json({ message: 'Failed to delete leads', error: deleteError.message });
    }

    // Update user's leads assigned count for each deleted lead
    const bookerUpdates = {};
    leads.forEach(lead => {
      if (lead.booker_id) {
        const bookerId = lead.booker_id.toString();
        bookerUpdates[bookerId] = (bookerUpdates[bookerId] || 0) + 1;
      }
    });

    // Update booker counts using Supabase
    for (const bookerId of Object.keys(bookerUpdates)) {
      try {
        const user = await dbManager.query('users', {
          select: 'leads_assigned',
          eq: { id: bookerId }
        });
        
        if (user && user.length > 0) {
          const newCount = Math.max((user[0].leads_assigned || 0) - bookerUpdates[bookerId], 0);
          await dbManager.update('users', { leads_assigned: newCount }, { id: bookerId });
        }
      } catch (error) {
        console.error(`Failed to update booker count for ${bookerId}:`, error);
      }
    }

    // Emit real-time updates
    if (global.io) {
      foundLeadIds.forEach(leadId => {
        global.io.emit('lead_deleted', {
          leadId: leadId,
          action: 'bulk_delete',
          timestamp: new Date()
        });
      });

      // Emit sales deletion notifications
      global.io.emit('sales_deleted', {
        action: 'bulk_delete',
        deletedCount: foundLeadIds.length, // Assume sales were deleted for these leads
        leadIds: foundLeadIds,
        timestamp: new Date()
      });
      console.log(`📡 Emitted sales_deleted event for ${foundLeadIds.length} leads`);

      // Emit diary updates for any booked leads
      leads.forEach(lead => {
        if (lead.status === 'Booked' || lead.status === 'Attended') {
          global.io.emit('diary_updated', {
            type: 'DIARY_UPDATE',
            data: {
              leadId: lead.id,
              leadName: lead.name,
              oldStatus: lead.status,
              newStatus: 'Deleted',
              dateBooked: lead.date_booked,
              timestamp: new Date().toISOString(),
              updatedBy: req.user.name,
              updatedAt: new Date().toISOString()
            }
          });
        }
      });
    }

    const count = leads.length;

    const successMessage = `Successfully deleted ${count} leads`;
    console.log('✅ Bulk delete completed:', successMessage);
    
    res.json({ 
      message: successMessage,
      deletedCount: count,
      requestedCount: leadIds.length
    });
  } catch (error) {
    console.error('❌ Bulk delete leads error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PUT /api/leads/bulk-assign
// @desc    Assign multiple leads to a user
// @access  Admin only
router.put('/bulk-assign', auth, adminAuth, async (req, res) => {
  try {
    console.log('👥 Bulk assign request received');

    const { leadIds, bookerId } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ message: 'No lead IDs provided' });
    }

    if (!bookerId) {
      return res.status(400).json({ message: 'No booker ID provided' });
    }

    // Create service role client to bypass RLS policies for admin operations
    const serviceRoleClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey || config.supabase.anonKey
    );

    const { data: bookers, error: bookerError } = await serviceRoleClient
      .from('users')
      .select('id, name, role, is_active, leads_assigned')
      .eq('id', bookerId)
      .single();

    if (bookerError || !bookers) {
      console.error('Error fetching booker:', bookerError);
      return res.status(404).json({ message: 'Booker not found' });
    }

    const booker = bookers;
    if (!booker.is_active) {
      return res.status(400).json({ message: 'Booker is not active' });
    }

    // Get the leads to be assigned - use service role client
    const { data: leads, error: leadsError } = await serviceRoleClient
      .from('leads')
      .select('id, name, booker_id, status')
      .in('id', leadIds);

    if (leadsError || !leads || leads.length === 0) {
      console.error('Error fetching leads:', leadsError);
      return res.status(404).json({ message: 'No leads found' });
    }

    console.log(`📋 Found ${leads.length} leads to assign to ${booker.name}`);

    // Update leads with new booker_id and status - use service role client to bypass RLS
    const { error: updateError } = await serviceRoleClient
      .from('leads')
      .update({
        booker_id: bookerId,
        status: 'Assigned',
        assigned_at: new Date().toISOString(), // Track when leads were assigned
        updated_at: new Date().toISOString()
      })
      .in('id', leadIds);

    if (updateError) {
      console.error('Error updating leads:', updateError);
      return res.status(500).json({ message: 'Failed to assign leads', error: updateError.message });
    }

    // Update booker's leads_assigned count
    const currentCount = booker.leads_assigned || 0;
    const newCount = currentCount + leads.length;

    const { error: bookerUpdateError } = await serviceRoleClient
      .from('users')
      .update({ leads_assigned: newCount })
      .eq('id', bookerId);

    if (bookerUpdateError) {
      console.warn('Error updating booker count:', bookerUpdateError);
    }

    // Update previous bookers' counts (if any leads were reassigned)
    const previousBookerIds = [...new Set(leads.map(lead => lead.booker_id).filter(Boolean))];
    for (const prevBookerId of previousBookerIds) {
      if (prevBookerId !== bookerId) {
        try {
          const { data: prevBooker } = await serviceRoleClient
            .from('users')
            .select('leads_assigned')
            .eq('id', prevBookerId)
            .single();

          if (prevBooker) {
            const prevCount = prevBooker.leads_assigned || 0;
            const reassignedCount = leads.filter(lead => lead.booker_id === prevBookerId).length;
            const newPrevCount = Math.max(prevCount - reassignedCount, 0);

            await serviceRoleClient
              .from('users')
              .update({ leads_assigned: newPrevCount })
              .eq('id', prevBookerId);
          }
        } catch (error) {
          console.error(`Failed to update previous booker count for ${prevBookerId}:`, error);
        }
      }
    }

    // Add booking history entries for each lead
    for (const lead of leads) {
      await addBookingHistoryEntry(
        lead.id,
        'bulk_assign',
        req.user.id,
        req.user.name,
        {
          previousBooker: lead.booker_id,
          newBooker: bookerId,
          bookerName: booker.name
        },
        {
          name: lead.name,
          status: 'Assigned',
          booker_id: bookerId
        }
      );
    }

    // Emit real-time updates
    if (global.io) {
      leadIds.forEach(leadId => {
        global.io.emit('lead_updated', {
          leadId: leadId,
          action: 'bulk_assign',
          bookerId: bookerId,
          bookerName: booker.name,
          timestamp: new Date()
        });
      });
    }

    const successMessage = `Successfully assigned ${leads.length} leads to ${booker.name}`;
    console.log('✅ Bulk assign completed:', successMessage);

    res.json({
      message: successMessage,
      assignedCount: leads.length,
      bookerId: bookerId,
      bookerName: booker.name
    });
  } catch (error) {
    console.error('❌ Bulk assign leads error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// DUPLICATE CALENDAR ENDPOINT REMOVED - Using the first one above

// Helper function to get event color based on status
const getEventColor = (status, hasSale, isConfirmed) => {
  if (hasSale) return '#10b981'; // Green for sales
  if (isConfirmed) return '#8b5cf6'; // Purple for confirmed
  switch (status) {
    case 'Booked': return '#3b82f6'; // Blue
    case 'Attended': return '#10b981'; // Green
    case 'Cancelled': return '#ef4444'; // Red
    default: return '#6b7280'; // Gray
  }
};

// @route   GET /api/leads/:id/events
// @desc    Get calendar events for a specific lead
// @access  Private
router.get('/:id/events', auth, async (req, res) => {
  try {
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    // Get the lead using Supabase
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', req.params.id)
      .single();

    // If lead exists and has a booker, get the booker name
    if (lead && lead.booker_id) {
      const { data: user } = await supabase
        .from('users')
        .select('name')
        .eq('id', lead.booker_id)
        .single();

      if (user) {
        lead.booker_name = user.name;
      }
    }

    if (leadError || !lead) {
      console.error('Get lead events error:', leadError?.message || 'Lead not found');
      return res.status(404).json({ message: 'Lead not found' });
    }

    // ROLE-BASED ACCESS CONTROL for individual lead events
    if (req.user.role !== 'admin' && lead.booker_id !== req.user.id) {
      console.log(`🚫 Access denied: User ${req.user.name} (${req.user.role}) tried to access lead ${req.params.id} assigned to ${lead.booker_id}`);
      return res.status(403).json({ message: 'Access denied. You can only view leads assigned to you.' });
    }

    // Convert lead to calendar event format
    const events = [];
    
    if (lead.date_booked) {
      const eventDate = new Date(lead.date_booked);
      
      events.push({
        id: lead.id,
        title: `${lead.name} - ${lead.status}`,
        start: eventDate,
        end: new Date(eventDate.getTime() + 15 * 60 * 1000), // 15 minutes duration
        backgroundColor: lead.status === 'Attended' ? '#10b981' : '#3b82f6',
        borderColor: lead.status === 'Attended' ? '#059669' : '#2563eb',
        extendedProps: {
          leadId: lead.id,
          leadName: lead.name,
          phone: lead.phone,
          email: lead.email,
          postcode: lead.postcode,
          status: lead.status,
          notes: lead.notes,
          booker: lead.booker_name || 'Unassigned'
        }
      });
    }

    res.json({ events });
  } catch (error) {
    console.error('Get lead events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leads/calendar-public
// @desc    Get leads for calendar view (public endpoint for dashboard)
// @access  Public (for dashboard stats)
router.get('/calendar-public', async (req, res) => {
  try {
    console.log(`📅 Public Calendar API: Fetching events`);

    const { start, end, limit = 600 } = req.query;
    const validatedLimit = Math.min(parseInt(limit) || 600, 600); // INCREASED to 600 for better calendar coverage

    console.log(`📅 Date range filter - Start: ${start || 'none'}, End: ${end || 'none'}, Limit: ${validatedLimit}`);

    // REQUIRE date range to prevent full table scan
    if (!start || !end) {
      return res.status(400).json({
        message: 'Date range required',
        error: 'start and end parameters are required for public calendar queries'
      });
    }

    let query = supabase
      .from('leads')
      .select(`
        id, name, phone, email, status, date_booked, booker_id,
        is_confirmed, booking_status, has_sale, time_booked, booking_slot,
        created_at, postcode, notes, image_url
      `)
      .or('date_booked.not.is.null,status.eq.Booked')
      .is('deleted_at', null)
      .not('status', 'in', '(Cancelled,Rejected)') // ✅ Exclude cancelled/rejected from calendar
      .gte('date_booked', start)
      .lte('date_booked', end);

    const { data: leads, error } = await query
      .order('date_booked', { ascending: true })
      .limit(validatedLimit);

    if (error) {
      console.error('Public calendar query error:', error);
      return res.status(400).json({ message: 'Database query failed', error: error.message });
    }

    console.log(`📅 Public Calendar API: Found ${leads?.length || 0} events`);

    // Get unique booker IDs and fetch their names
    const bookerIds = [...new Set((leads || []).filter(lead => lead.booker_id).map(lead => lead.booker_id))];
    let usersMap = new Map();
    
    if (bookerIds.length > 0) {
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', bookerIds);
      
      if (!usersError && users) {
        users.forEach(user => usersMap.set(user.id, user));
      }
    }

    const events = leads?.map(lead => {
      const date = new Date(lead.date_booked);
      const booker = lead.booker_id && usersMap.has(lead.booker_id) ? usersMap.get(lead.booker_id) : null;
      
      return {
        id: lead.id,
        title: lead.name,
        start: lead.date_booked,
        extendedProps: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          status: lead.status,
          date_booked: lead.date_booked,
          booker_id: lead.booker_id,
          booker_name: booker ? booker.name : null,
          time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        }
      };
    }) || [];

    res.json({ events });
  } catch (error) {
    console.error('Get public lead events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/leads/upload-preview
// @desc    Parse uploaded file, return columns + sample rows + suggested mapping for manual column mapping
// @access  Admin only
router.post('/upload-preview', auth, adminAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error (preview):', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      }
      if (err.message.includes('Invalid file type')) {
        return res.status(400).json({ message: 'Invalid file type. Please upload CSV or Excel files only.' });
      }
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('📤 Upload preview request received');
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let rawRows = [];

    // --- Parse file ---
    if (fileExtension === '.csv') {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'CSV file must have at least a header row and one data row' });
      }
      const headers = parseCSVLine(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.every(v => !v)) continue;
        const row = {};
        headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
        rawRows.push(row);
      }
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
        rawRows = rawRows.filter(row => Object.values(row).some(val => val && val.toString().trim()));
      } catch (excelError) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'Failed to parse Excel file: ' + excelError.message });
      }
    }

    // Clean up original uploaded file
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    console.log(`📊 Preview: Parsed ${rawRows.length} rows from file`);

    if (rawRows.length === 0) {
      return res.status(400).json({ message: 'No data rows found in file' });
    }

    const columns = Object.keys(rawRows[0]);
    const sampleRows = rawRows.slice(0, 3);

    // --- Auto-detect suggested mapping ---
    const suggestedMapping = {
      name: null,
      phone: null,
      email: null,
      postcode: null,
      age: null,
      lead_source: null,
      entry_date: null,
      parent_phone: null,
      gender: null,
      image_url: null
    };

    for (const col of columns) {
      const lk = col.toLowerCase().trim();
      if (lk.includes('name') && !suggestedMapping.name) {
        suggestedMapping.name = col;
      } else if ((lk.includes('phone') || lk.includes('mobile') || lk.includes('tel')) && !lk.includes('parent') && !suggestedMapping.phone) {
        suggestedMapping.phone = col;
      } else if (lk.includes('email') && !suggestedMapping.email) {
        suggestedMapping.email = col;
      } else if ((lk.includes('postcode') || lk.includes('postal') || lk.includes('zip')) && !suggestedMapping.postcode) {
        suggestedMapping.postcode = col;
      } else if (lk === 'age' && !suggestedMapping.age) {
        suggestedMapping.age = col;
      } else if (lk.includes('source') && !suggestedMapping.lead_source) {
        suggestedMapping.lead_source = col;
      } else if (lk.includes('entry') && lk.includes('date') && !suggestedMapping.entry_date) {
        suggestedMapping.entry_date = col;
      } else if (lk.includes('parent') && lk.includes('phone') && !suggestedMapping.parent_phone) {
        suggestedMapping.parent_phone = col;
      } else if ((lk.includes('gender') || lk === 'sex') && !suggestedMapping.gender) {
        suggestedMapping.gender = col;
      } else if ((lk.includes('image') || lk.includes('photo') || lk.includes('picture') || lk.includes('thumbnail')) && (lk.includes('url') || lk.includes('link')) && !suggestedMapping.image_url) {
        suggestedMapping.image_url = col;
      }
    }

    // Save parsed rows to temp JSON file
    const fileId = uuidv4();
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    // Clean up stale preview files older than 1 hour
    cleanupStalePreviewFiles(uploadDir);
    const previewPath = path.join(uploadDir, `preview-${fileId}.json`);
    fs.writeFileSync(previewPath, JSON.stringify(rawRows));

    console.log(`📋 Preview saved: ${fileId} (${rawRows.length} rows, ${columns.length} columns)`);

    res.json({
      fileId,
      columns,
      sampleRows,
      suggestedMapping,
      totalRows: rawRows.length
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Upload preview error:', error);
    res.status(500).json({ message: 'Server error during preview', error: error.message });
  }
});

// @route   POST /api/leads/upload-analyze
// @desc    Analyze mapped file data before import — validate rows, check duplicates
// @access  Admin only
router.post('/upload-analyze', auth, adminAuth, async (req, res) => {
  try {
    const { fileId, columnMapping } = req.body || {};
    if (!fileId || !columnMapping) {
      return res.status(400).json({ message: 'Missing fileId or columnMapping' });
    }

    const mapping = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping;

    // Read saved preview file (don't delete — import will need it later)
    const uploadDir = path.join(__dirname, '../uploads');
    const previewPath = path.join(uploadDir, `preview-${fileId}.json`);
    if (!fs.existsSync(previewPath)) {
      return res.status(400).json({ message: 'Preview data expired or not found. Please upload the file again.' });
    }

    const rawRows = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
    const totalRows = rawRows.length;

    const errors = [];
    const warnings = [];
    const phoneMap = {}; // phone -> [{ rowNum, name }]
    const allPhones = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // +2 for 1-based + header row

      // Apply mapping
      const name = (mapping.name && row[mapping.name]) ? row[mapping.name].toString().trim() : '';
      const phone = (mapping.phone && row[mapping.phone]) ? row[mapping.phone].toString().trim() : '';
      const email = (mapping.email && row[mapping.email]) ? row[mapping.email].toString().trim() : '';

      // Validation: missing both name and phone
      if (!name && !phone) {
        errors.push({ row: rowNum, issue: 'Missing name and phone — will be skipped' });
        continue;
      }

      // Validate phone format
      if (phone) {
        const digitsOnly = phone.replace(/[^0-9]/g, '');
        if (digitsOnly.length < 7) {
          errors.push({ row: rowNum, issue: `Invalid phone: "${phone}" (too short)` });
        } else if (digitsOnly.length > 15) {
          errors.push({ row: rowNum, issue: `Invalid phone: "${phone}" (too long)` });
        } else {
          // Track for in-file duplicate detection using shared normalizePhone
          const normPhone = normalizePhone(phone);
          if (!phoneMap[normPhone]) {
            phoneMap[normPhone] = [];
          }
          phoneMap[normPhone].push({ rowNum, name, phone });
          allPhones.push(phone);
        }
      }

      // Validate email format
      if (email && !email.includes('@')) {
        warnings.push({ row: rowNum, issue: `Invalid email format: "${email}"` });
      }

      // Validate entry date if mapped
      if (mapping.entry_date && row[mapping.entry_date]) {
        const dateRaw = row[mapping.entry_date].toString().trim();
        if (dateRaw) {
          const { warning } = parseEntryDateToISO(dateRaw);
          if (warning) {
            warnings.push({ row: rowNum, issue: `${warning} — date will be blank` });
          }
        }
      }
    }

    // In-file duplicates (phones appearing 2+ times)
    const inFileDuplicates = [];
    for (const [normalized, entries] of Object.entries(phoneMap)) {
      if (entries.length >= 2) {
        inFileDuplicates.push({
          phone: entries[0].phone,
          count: entries.length,
          rows: entries.map(e => e.rowNum),
          names: entries.map(e => e.name || '(no name)')
        });
      }
    }

    // DB duplicate check — query existing leads and compare with normalized phones
    let dbDuplicates = [];
    if (allPhones.length > 0) {
      try {
        // Build a set of normalized upload phones for fast lookup
        const uploadNormSet = new Set(allPhones.map(p => normalizePhone(p)));

        // Query all leads with phones from DB and filter by normalized match
        const { data: existingLeads, error } = await supabase
          .from('leads')
          .select('name, phone, status')
          .not('phone', 'is', null)
          .is('deleted_at', null);

        if (!error && existingLeads) {
          const existingPhoneSet = new Set();
          for (const lead of existingLeads) {
            const key = normalizePhone(lead.phone);
            if (uploadNormSet.has(key) && !existingPhoneSet.has(key)) {
              existingPhoneSet.add(key);
              dbDuplicates.push({
                phone: lead.phone,
                existingName: lead.name,
                existingStatus: lead.status
              });
            }
          }
        }
      } catch (dbErr) {
        console.warn('⚠️ DB duplicate check failed:', dbErr.message);
        // Non-fatal — continue without DB check
      }
    }

    // Build row-level duplicate detail for the review UI
    const duplicateRows = [];

    // In-file duplicates: for each phone group with 2+ entries, mark all but the first
    for (const [normalized, entries] of Object.entries(phoneMap)) {
      if (entries.length >= 2) {
        for (let j = 1; j < entries.length; j++) {
          const entry = entries[j];
          const rowData = rawRows[entry.rowNum - 2]; // rowNum is 1-based + header
          duplicateRows.push({
            rowIndex: entry.rowNum - 2,
            rowNum: entry.rowNum,
            name: entry.name,
            phone: entry.phone,
            email: (mapping.email && rowData[mapping.email]) ? rowData[mapping.email].toString().trim() : '',
            type: 'in_file',
            matchInfo: `Same phone as row${entries.filter((_, k) => k !== j).map(e => e.rowNum).length > 1 ? 's' : ''} ${entries.filter((_, k) => k !== j).map(e => e.rowNum).join(', ')}`
          });
        }
      }
    }

    // DB duplicates: match upload rows against existing leads using shared normalizePhone
    const dbNormalizedMap = new Map();
    for (const dup of dbDuplicates) {
      const norm = normalizePhone(dup.phone);
      dbNormalizedMap.set(norm, dup);
    }

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const phone = (mapping.phone && row[mapping.phone]) ? row[mapping.phone].toString().trim() : '';
      if (!phone) continue;
      const norm = normalizePhone(phone);
      const match = dbNormalizedMap.get(norm);
      if (match) {
        // Avoid duplicating if already marked as in-file dup
        if (!duplicateRows.find(d => d.rowIndex === i)) {
          duplicateRows.push({
            rowIndex: i,
            rowNum: i + 2,
            name: (mapping.name && row[mapping.name]) ? row[mapping.name].toString().trim() : '',
            phone,
            email: (mapping.email && row[mapping.email]) ? row[mapping.email].toString().trim() : '',
            type: 'db_match',
            matchInfo: `Exists in CRM: ${match.existingName} (${match.existingStatus})`
          });
        }
      }
    }

    // Build summary
    const errorRowCount = errors.length;
    const validRows = totalRows - errorRowCount;

    const summary = {
      willImport: validRows,
      willSkip: errorRowCount,
      duplicatesInFile: inFileDuplicates.reduce((sum, d) => sum + d.count - 1, 0), // extra copies
      duplicatesInDB: dbDuplicates.length
    };

    console.log(`📊 Upload analysis: ${totalRows} total, ${validRows} valid, ${errors.length} errors, ${inFileDuplicates.length} in-file dups, ${dbDuplicates.length} DB dups`);

    res.json({
      totalRows,
      validRows,
      errors: errors.slice(0, 50),
      warnings: warnings.slice(0, 50),
      inFileDuplicates: inFileDuplicates.slice(0, 50),
      dbDuplicates: dbDuplicates.slice(0, 50),
      duplicateRows: duplicateRows.slice(0, 200),
      summary,
      truncated: {
        errors: errors.length > 50,
        warnings: warnings.length > 50,
        inFileDuplicates: inFileDuplicates.length > 50,
        dbDuplicates: dbDuplicates.length > 50
      }
    });
  } catch (error) {
    console.error('Upload analysis error:', error);
    res.status(500).json({ message: 'Server error during analysis', error: error.message });
  }
});

// @route   POST /api/leads/upload-simple
// @desc    Simple upload — supports two modes:
//          1) File upload with auto-map (legacy) — send multipart file
//          2) Mapped import from preview — send JSON { fileId, columnMapping }
// @access  Admin only
router.post('/upload-simple', auth, adminAuth, (req, res, next) => {
  // Try multer, but don't fail if no file (might be JSON body for mapped import)
  upload.single('file')(req, res, (err) => {
    if (err) {
      // If this is a mapped import (JSON body), the content-type won't be multipart
      // so multer may error — check if it's a real file-upload error
      if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
        // Not a file upload, skip multer error
        return next();
      }
      console.error('❌ Multer error:', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      }
      if (err.message.includes('Invalid file type')) {
        return res.status(400).json({ message: 'Invalid file type. Please upload CSV or Excel files only.' });
      }
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('📤 Simple upload request received');

    // ===== MODE 2: Mapped import from preview (fileId + columnMapping) =====
    const { fileId, columnMapping, excludeRowIndices } = req.body || {};
    if (fileId && columnMapping) {
      console.log('📋 Mapped import mode — fileId:', fileId);
      const mapping = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping;

      // Read saved preview file
      const uploadDir = path.join(__dirname, '../uploads');
      const previewPath = path.join(uploadDir, `preview-${fileId}.json`);
      if (!fs.existsSync(previewPath)) {
        return res.status(400).json({ message: 'Preview data expired or not found. Please upload the file again.' });
      }

      const rawRows = JSON.parse(fs.readFileSync(previewPath, 'utf8'));

      console.log(`📊 Mapped import: ${rawRows.length} rows, mapping:`, mapping);

      const leadsToInsert = [];
      const errors = [];

      // Phase 1: Validate and prepare all leads before touching the DB
      for (let i = 0; i < rawRows.length; i++) {
        if (excludeRowIndices && Array.isArray(excludeRowIndices) && excludeRowIndices.includes(i)) continue;
        const row = rawRows[i];
        const rowNum = i + 2; // +2 for header row + 1-based indexing (matches analyze)

        const mapped = {};

        // Apply user-provided column mapping
        if (mapping.name && row[mapping.name]) mapped.name = row[mapping.name].toString().trim();
        if (mapping.phone && row[mapping.phone]) mapped.phone = row[mapping.phone].toString().trim();
        if (mapping.email && row[mapping.email]) mapped.email = row[mapping.email].toString().trim();
        if (mapping.postcode && row[mapping.postcode]) mapped.postcode = row[mapping.postcode].toString().trim();
        if (mapping.age && row[mapping.age]) mapped.age = row[mapping.age].toString().trim();
        if (mapping.lead_source && row[mapping.lead_source]) mapped.lead_source = row[mapping.lead_source].toString().trim();
        if (mapping.parent_phone && row[mapping.parent_phone]) mapped.parent_phone = row[mapping.parent_phone].toString().trim();
        if (mapping.image_url && row[mapping.image_url]) mapped.image_url = row[mapping.image_url].toString().trim();
        if (mapping.gender && row[mapping.gender]) mapped.gender = row[mapping.gender].toString().trim();

        // Parse entry date (UTC to avoid timezone shifting)
        if (mapping.entry_date && row[mapping.entry_date]) {
          mapped.entry_date = parseEntryDateToISO(row[mapping.entry_date]).value;
        }

        // Must have name or phone
        if (!mapped.name && !mapped.phone) {
          errors.push(`Row ${rowNum}: Missing both name and phone — skipped`);
          continue;
        }

        let bookingCode = null;
        try {
          bookingCode = await generateBookingCode(mapped.name || 'Lead');
        } catch (bcErr) {
          console.warn(`⚠️ Booking code generation failed for row ${rowNum}:`, bcErr.message);
        }

        const lead = {
          id: uuidv4(),
          name: mapped.name || `Lead ${rowNum}`,
          phone: mapped.phone || null,
          email: mapped.email || null,
          postcode: mapped.postcode || '',
          image_url: mapped.image_url || '',
          parent_phone: mapped.parent_phone || '',
          lead_source: mapped.lead_source || null,
          entry_date: mapped.entry_date || null,
          gender: mapped.gender || null,
          status: 'New',
          booker_id: null,
          date_booked: null,
          is_confirmed: false,
          booking_status: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        if (mapped.age) {
          const ageVal = parseInt(mapped.age);
          if (!isNaN(ageVal) && ageVal > 0) {
            lead.age = ageVal;
          }
        }

        leadsToInsert.push(lead);
      }

      // Phase 2: Batch insert — all or nothing per batch
      const processedLeads = [];
      const batchSize = 500;
      for (let b = 0; b < leadsToInsert.length; b += batchSize) {
        const batch = leadsToInsert.slice(b, b + batchSize);
        try {
          const { error } = await supabase.from('leads').insert(batch);
          if (error) throw error;
          processedLeads.push(...batch);
        } catch (batchErr) {
          console.error(`❌ Batch insert failed (rows ${b + 1}-${b + batch.length}):`, batchErr.message);
          errors.push(`Batch insert failed for ${batch.length} leads: ${batchErr.message}`);
        }
      }

      console.log(`✅ Mapped import complete: ${processedLeads.length} imported, ${errors.length} errors`);

      if (global.io && processedLeads.length > 0) {
        global.io.emit('leads_bulk_imported', { count: processedLeads.length, action: 'mapped_upload', timestamp: new Date() });
        global.io.emit('stats_update_needed', { type: 'mapped_upload', timestamp: new Date() });
      }

      // Clean up temp file after import is fully done
      try {
        if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
      } catch (cleanupErr) {
        console.warn('⚠️ Failed to clean up preview file:', cleanupErr.message);
      }

      return res.json({
        message: `Successfully imported ${processedLeads.length} leads`,
        imported: processedLeads.length,
        total: rawRows.length,
        errors: errors.slice(0, 20)
      });
    }

    // ===== MODE 1: Legacy file upload with auto-map =====
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let rawRows = [];

    // --- Parse file ---
    if (fileExtension === '.csv') {
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'CSV file must have at least a header row and one data row' });
      }
      const headers = parseCSVLine(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.every(v => !v)) continue;
        const row = {};
        headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
        rawRows.push(row);
      }
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      try {
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
        rawRows = rawRows.filter(row => Object.values(row).some(val => val && val.toString().trim()));
      } catch (excelError) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'Failed to parse Excel file: ' + excelError.message });
      }
    }

    fs.unlinkSync(filePath); // clean up
    console.log(`📊 Parsed ${rawRows.length} rows from file`);

    if (rawRows.length === 0) {
      return res.status(400).json({ message: 'No data rows found in file' });
    }

    // --- Auto-map columns ---
    const columnKeys = Object.keys(rawRows[0]);
    console.log('🔍 Columns found:', columnKeys);

    const leadsToInsert = [];
    const errors = [];

    // Phase 1: Validate and prepare all leads before touching the DB
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 1;

      const mapped = {};

      for (const key of columnKeys) {
        const val = row[key];
        if (!val || val.toString().trim() === '') continue;
        const lk = key.toLowerCase().trim();

        if (lk.includes('name') && !mapped.name) {
          mapped.name = val.toString().trim();
        } else if (lk === 'age' && !mapped.age) {
          mapped.age = val.toString().trim();
        } else if (lk.includes('email') && !mapped.email) {
          mapped.email = val.toString().trim();
        } else if ((lk.includes('phone') || lk.includes('mobile') || lk.includes('tel')) && !lk.includes('parent') && !mapped.phone) {
          mapped.phone = val.toString().trim();
        } else if ((lk.includes('postcode') || lk.includes('postal') || lk.includes('zip')) && !mapped.postcode) {
          mapped.postcode = val.toString().trim();
        } else if (lk.includes('image') && lk.includes('url') && !mapped.image_url) {
          mapped.image_url = val.toString().trim();
        } else if (lk.includes('parent') && lk.includes('phone') && !mapped.parent_phone) {
          mapped.parent_phone = val.toString().trim();
        } else if (lk.includes('source') && !mapped.lead_source) {
          mapped.lead_source = val.toString().trim();
        } else if (lk.includes('entry') && lk.includes('date') && !mapped.entry_date) {
          mapped.entry_date = parseEntryDateToISO(val).value;
        } else if ((lk.includes('gender') || lk === 'sex') && !mapped.gender) {
          mapped.gender = val.toString().trim();
        }
      }

      // Must have name or phone
      if (!mapped.name && !mapped.phone) {
        errors.push(`Row ${rowNum}: Missing both name and phone — skipped`);
        continue;
      }

      let bookingCode = null;
      try {
        bookingCode = await generateBookingCode(mapped.name || 'Lead');
      } catch (bcErr) {
        console.warn(`⚠️ Booking code generation failed for row ${rowNum}:`, bcErr.message);
      }

      const lead = {
        id: uuidv4(),
        name: mapped.name || `Lead ${rowNum}`,
        phone: mapped.phone || null,
        email: mapped.email || null,
        postcode: mapped.postcode || '',
        image_url: mapped.image_url || '',
        parent_phone: mapped.parent_phone || '',
        lead_source: mapped.lead_source || null,
        entry_date: mapped.entry_date || null,
        gender: mapped.gender || null,
        status: 'New',
        booker_id: null,
        date_booked: null,
        is_confirmed: false,
        booking_status: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (mapped.age) {
        const ageVal = parseInt(mapped.age);
        if (!isNaN(ageVal) && ageVal > 0) {
          lead.age = ageVal;
        }
      }

      leadsToInsert.push(lead);
    }

    // Phase 2: Batch insert — all or nothing per batch
    const processedLeads = [];
    const batchSize = 500;
    for (let b = 0; b < leadsToInsert.length; b += batchSize) {
      const batch = leadsToInsert.slice(b, b + batchSize);
      try {
        const { error } = await supabase.from('leads').insert(batch);
        if (error) throw error;
        processedLeads.push(...batch);
      } catch (batchErr) {
        console.error(`❌ Batch insert failed (rows ${b + 1}-${b + batch.length}):`, batchErr.message);
        errors.push(`Batch insert failed for ${batch.length} leads: ${batchErr.message}`);
      }
    }

    console.log(`✅ Simple upload complete: ${processedLeads.length} imported, ${errors.length} errors`);

    // Emit real-time update
    if (global.io && processedLeads.length > 0) {
      global.io.emit('leads_bulk_imported', {
        count: processedLeads.length,
        action: 'simple_upload',
        timestamp: new Date()
      });
      global.io.emit('stats_update_needed', {
        type: 'simple_upload',
        timestamp: new Date()
      });
    }

    res.json({
      message: `Successfully imported ${processedLeads.length} leads`,
      imported: processedLeads.length,
      total: rawRows.length,
      errors: errors.slice(0, 20)
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Simple upload error:', error);
    res.status(500).json({ message: 'Server error during upload', error: error.message });
  }
});

// @route   POST /api/leads/upload-analyze
// @desc    Upload and analyze CSV/Excel file for column mapping
// @access  Admin only
router.post('/upload-analyze', auth, adminAuth, upload.single('file'), async (req, res) => {
  try {
    console.log('📤 File analysis request received');
    console.log('📁 File:', req.file ? req.file.originalname : 'No file');
    
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let leads = [];

    try {
      // Parse file to get column structure
      if (fileExtension === '.csv') {
        leads = await new Promise((resolve, reject) => {
          const results = [];
          fs.createReadStream(filePath)
            .pipe(csv({
              skipEmptyLines: true,
              skipLinesWithError: true
            }))
            .on('data', (data) => {
              if (Object.keys(data).length > 0) {
                results.push(data);
              }
            })
            .on('end', () => resolve(results))
            .on('error', (error) => {
              console.warn('CSV parsing warning:', error.message);
              resolve(results);
            });
        });
      } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
        try {
          const workbook = xlsx.readFile(filePath);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          leads = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
        } catch (excelError) {
          console.warn('Excel parsing warning:', excelError.message);
          leads = [];
        }
      }

      console.log(`📊 Parsed ${leads.length} rows from file`);

      if (leads.length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ 
          message: 'No data found in file',
          suggestions: [
            'Ensure your file is not empty',
            'Check that your file is saved in CSV or Excel format',
            'If using Excel, make sure data is in the first sheet',
            'Remove any password protection from the file'
          ]
        });
      }

      // Analyze columns and provide sample data
      const columns = Object.keys(leads[0] || {});
      const sampleData = leads.slice(0, 5); // First 5 rows as sample
      
      // Smart column detection
      const suggestedMapping = {};
      const columnStats = {};
      
      // Filter out empty columns and collect stats
      const columnsWithData = [];
      
      columns.forEach(column => {
        const normalizedCol = column.toLowerCase().trim();
        const values = leads.slice(0, Math.min(20, leads.length)).map(row => row[column]);
        
        // Collect stats about the column
        const hasData = values.some(v => v && v.toString().trim());
        columnStats[column] = {
          hasData: hasData,
          sampleValues: values.filter(v => v).slice(0, 3),
          dataType: detectDataType(values)
        };
        
        // Only include columns with data
        if (hasData) {
          columnsWithData.push(column);
          
          // Enhanced auto-detect mappings based on column names
          if (normalizedCol === 'name' || normalizedCol === 'full name' || normalizedCol === 'customer name' || normalizedCol === 'client name') {
            suggestedMapping.name = column;
          } else if (normalizedCol === 'phone' || normalizedCol === 'telephone' || normalizedCol === 'mobile' || normalizedCol === 'phone number') {
            suggestedMapping.phone = column;
          } else if (normalizedCol === 'email' || normalizedCol === 'e-mail' || normalizedCol === 'email address') {
            suggestedMapping.email = column;
          } else if (normalizedCol === 'age' || normalizedCol === 'dob' || normalizedCol.includes('birth')) {
            suggestedMapping.age = column;
          } else if (normalizedCol === 'postcode' || normalizedCol === 'postal code' || normalizedCol === 'zip' || normalizedCol === 'zipcode') {
            suggestedMapping.postcode = column;
          } else if (normalizedCol.includes('image') || normalizedCol.includes('photo') || normalizedCol.includes('pic')) {
            suggestedMapping.imageUrl = column;
          } else if (normalizedCol.includes('parent') && normalizedCol.includes('phone')) {
            suggestedMapping.parentPhone = column;
          }
          // Fallback patterns
          else if (normalizedCol.includes('name') && !normalizedCol.includes('parent') && !normalizedCol.includes('user') && !suggestedMapping.name) {
            suggestedMapping.name = column;
          } else if (normalizedCol.includes('phone') && !normalizedCol.includes('parent') && !suggestedMapping.phone) {
            suggestedMapping.phone = column;
          }
        }
      });
      
      // If no name column detected, try to find one with person names
      if (!suggestedMapping.name) {
        columnsWithData.forEach(column => {
          const values = leads.slice(0, 10).map(row => row[column]).filter(v => v);
          if (values.length > 0 && looksLikeNames(values)) {
            suggestedMapping.name = column;
          }
        });
      }
      
      // Check if this looks like a well-formatted file
      const requiredFieldsDetected = suggestedMapping.name && suggestedMapping.phone;
      const wellFormatted = requiredFieldsDetected && Object.keys(suggestedMapping).length >= 2;
      
      console.log(`📊 Analysis: ${columnsWithData.length} columns with data, ${Object.keys(suggestedMapping).length} auto-detected, well-formatted: ${wellFormatted}`);
      
      // Store file temporarily with unique identifier
      const tempId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      const tempFilePath = path.join(path.dirname(filePath), `temp_${tempId}.json`);
      
      // Store parsed data temporarily
      fs.writeFileSync(tempFilePath, JSON.stringify(leads));
      
      // Clean up original uploaded file
      fs.unlinkSync(filePath);

      res.json({
        message: 'File analyzed successfully',
        tempId: tempId,
        columns: columnsWithData, // Only return columns with data
        allColumns: columns, // Keep original for reference
        sampleData: sampleData,
        totalRows: leads.length,
        fileName: req.file.originalname,
        suggestedMapping: suggestedMapping,
        columnStats: columnStats,
        wellFormatted: wellFormatted,
        skippedEmptyColumns: columns.length - columnsWithData.length
      });

    } catch (parseError) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      console.error('File parsing error:', parseError);
      res.status(400).json({ 
        message: 'Error parsing file',
        error: parseError.message
      });
    }

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Upload analysis error:', error);
    res.status(500).json({ 
      message: 'Server error during file analysis',
      error: error.message 
    });
  }
});

// @route   POST /api/leads/upload-process
// @desc    Process leads with column mapping
// @access  Admin only
router.post('/upload-process', auth, adminAuth, async (req, res) => {
  try {
    const { tempId, columnMapping } = req.body;
    
    if (!tempId || !columnMapping) {
      return res.status(400).json({ message: 'Missing tempId or columnMapping' });
    }

    // Find and load temporary file
    const tempFilePath = path.join(__dirname, '../uploads', `temp_${tempId}.json`);
    
    if (!fs.existsSync(tempFilePath)) {
      return res.status(400).json({ message: 'Temporary file not found or expired' });
    }

    const leads = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
    
    // Process leads with column mapping
    const processedLeads = [];
    const errors = [];

    for (let i = 0; i < leads.length; i++) {
      const leadData = leads[i];
      const rowNumber = i + 1;

      try {
        // Map columns according to user selection
        const mappedData = {};
        
        Object.keys(columnMapping).forEach(fieldName => {
          const sourceColumn = columnMapping[fieldName];
          // Skip columns marked as 'skip' or empty
          if (sourceColumn && sourceColumn !== 'skip' && leadData[sourceColumn]) {
            mappedData[fieldName] = leadData[sourceColumn];
          }
        });

        // Validate required fields
        if (!mappedData.name && !mappedData.phone) {
          errors.push(`Row ${rowNumber}: Missing both name and phone`);
          continue;
        }

        // Create clean lead object - always as 'New' status to prevent diary updates
        // Map both imageUrl and image_url to image_url
        let finalImageUrl = null;  // Default to null instead of empty string
        if (mappedData.image_url && mappedData.image_url.toString().trim() !== '') {
          finalImageUrl = mappedData.image_url.toString().trim();
        } else if (mappedData.imageUrl && mappedData.imageUrl.toString().trim() !== '') {
          finalImageUrl = mappedData.imageUrl.toString().trim();
        }

        const cleanLead = {
          name: mappedData.name ? mappedData.name.toString().trim() : `Lead ${rowNumber}`,
          phone: mappedData.phone ? mappedData.phone.toString().trim() : '',
          email: mappedData.email ? mappedData.email.toString().trim() : '',
          postcode: mappedData.postcode ? mappedData.postcode.toString().trim() : '',
          image_url: finalImageUrl,
          parent_phone: mappedData.parent_phone ? mappedData.parent_phone.toString().trim() : '',
          status: 'New', // Always 'New' for uploads - diary should only be updated by registered users
          booker: null, // Never assign booker for uploaded leads
          date_booked: null, // Never set dateBooked for uploaded leads
        };
        
        // Only add age if it has a valid value
        if (mappedData.age) {
          const ageValue = parseInt(mappedData.age);
          if (!isNaN(ageValue)) {
            cleanLead.age = ageValue;
          }
        }

        processedLeads.push(cleanLead);

      } catch (rowError) {
        errors.push(`Row ${rowNumber}: ${rowError.message}`);
      }
    }

    console.log(`✅ Successfully processed ${processedLeads.length} leads`);
    console.log(`❌ Generated ${errors.length} errors`);

    if (processedLeads.length === 0) {
      try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) { console.warn('⚠️ Cleanup failed:', e.message); }
      return res.status(400).json({
        message: 'No valid leads found after processing',
        errors: errors.slice(0, 10)
      });
    }

    // Get existing leads for duplicate detection
    const existingLeads = await dbManager.query('leads', {
      select: 'id, name, phone, email, postcode',
      is: { deleted_at: null }
    });

    if (!existingLeads) {
      console.error('Error fetching existing leads for duplicate detection');
      return res.status(500).json({ message: 'Server error' });
    }

    // Legacy database connection removed - using only current database
    const legacyLeads = []; // Empty array - legacy database no longer used

    // Analyze leads for duplicates and distance
    console.log('🔍 Analyzing leads for duplicates and distance...');
    console.log(`📊 Found ${existingLeads.length} existing leads for duplicate detection`);
    console.log(`📤 Processing ${processedLeads.length} uploaded leads`);

    // Debug: show sample of existing leads structure
    if (existingLeads.length > 0) {
      console.log('📋 Sample existing lead structure:', {
        id: existingLeads[0].id,
        hasPhone: !!existingLeads[0].phone,
        hasEmail: !!existingLeads[0].email,
        fields: Object.keys(existingLeads[0])
      });
    }

    const analysisResult = await analyseLeads(processedLeads, existingLeads, legacyLeads);

    // Clean up temporary file
    try { if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); } catch (e) { console.warn('⚠️ Cleanup failed:', e.message); }

    res.json({
      message: 'Lead processing complete',
      analysis: analysisResult,
      processedLeads: processedLeads,
      summary: {
        totalRows: leads.length,
        validLeads: processedLeads.length,
        errors: errors.length
      },
      errors: errors.slice(0, 5)
    });

  } catch (error) {
    console.error('Upload processing error:', error);
    res.status(500).json({ 
      message: 'Server error during processing',
      error: error.message 
    });
  }
});

// @route   POST /api/leads/upload (Legacy - keep for backward compatibility)
// @desc    Upload leads from CSV/Excel file (Enhanced - more permissive)
// @access  Admin only
router.post('/upload', auth, adminAuth, (req, res, next) => {
  console.log('🔍 Upload request received:', {
    headers: req.headers,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length']
  });
  
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('❌ Multer error:', err.message);
      console.error('❌ Multer error details:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
      }
      if (err.message.includes('Invalid file type')) {
        return res.status(400).json({ message: 'Invalid file type. Please upload CSV or Excel files only.' });
      }
      return res.status(400).json({ message: err.message });
    }
    console.log('✅ Multer validation passed');
    next();
  });
}, async (req, res) => {
  try {
    console.log('📤 Enhanced upload request received');
    console.log('📁 File:', req.file ? req.file.originalname : 'No file');
    
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let leads = [];

    try {
      // Improved file parsing with better header handling
      if (fileExtension === '.csv') {
        // Simple CSV parsing without external library
        const csvContent = fs.readFileSync(filePath, 'utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          throw new Error('CSV file must have at least a header row and one data row');
        }
        
        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim());
        console.log('🔍 Headers found:', headers);
        
        // Parse data rows
        const results = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          if (values.length === 0 || values.every(v => !v)) continue; // Skip empty rows
          
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = values[index] || '';
          });
          
          console.log('🔍 Row data:', rowData);
          
          // Map headers to standard format
          const mappedData = {};
          Object.keys(rowData).forEach(key => {
            const value = rowData[key];
            const lowerKey = key.toLowerCase();
            
            console.log(`🔍 Mapping key "${key}" (${lowerKey}) to value:`, value);
            
            if (lowerKey.includes('name')) {
              mappedData.name = value;
            } else if (lowerKey === 'age') {
              mappedData.age = value;
            } else if (lowerKey.includes('email')) {
              mappedData.email = value;
            } else if (lowerKey.includes('phone') && !lowerKey.includes('parent')) {
              mappedData.phone = value;
            } else if (lowerKey.includes('postcode') || lowerKey.includes('postal') || lowerKey.includes('zip')) {
              mappedData.postcode = value;
            } else if (lowerKey.includes('image') && lowerKey.includes('url')) {
              mappedData.image_url = value;
            } else if (lowerKey.includes('parent') && lowerKey.includes('phone')) {
              mappedData.parent_phone = value;
            } else {
              // Keep original key if no mapping found
              mappedData[key] = value;
            }
          });
          
          console.log('🔍 Mapped data:', mappedData);
          results.push(mappedData);
        }
        
        leads = results;
      } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
        try {
          const workbook = xlsx.readFile(filePath);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          leads = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
          
          // Filter out completely empty rows
          leads = leads.filter(lead => 
            Object.values(lead).some(val => val && val.toString().trim())
          );
        } catch (excelError) {
          console.warn('Excel parsing warning:', excelError.message);
          leads = []; // Continue with empty array if Excel fails
        }
      }

      console.log(`📊 Parsed ${leads.length} rows from file`);
      
      // Debug: Log first few rows to see what we're getting
      if (leads.length > 0) {
        console.log('🔍 First row data:', leads[0]);
        console.log('🔍 Column names:', Object.keys(leads[0]));
      }

      // Process and validate leads data with enhanced permissiveness
      const processedLeads = [];
      const errors = [];
      const warnings = [];

      for (let i = 0; i < leads.length; i++) {
        const leadData = leads[i];
        const rowNumber = i + 1;

        try {
          // Improved column mapping with better field detection
          const normalizedData = {};
          
          // Map data with more flexible matching
          Object.keys(leadData).forEach(key => {
            const value = leadData[key];
            if (!value || value.toString().trim() === '') return;
            
            const normalizedKey = key.toLowerCase().trim();
            
            // More permissive mapping with better field detection
            if (normalizedKey.includes('name') && !normalizedData.name) {
              normalizedData.name = value.toString().trim();
            } else if (normalizedKey.includes('age') && !normalizedData.age) {
              normalizedData.age = value.toString().trim();
            } else if (normalizedKey.includes('email') && !normalizedData.email) {
              normalizedData.email = value.toString().trim();
            } else if (normalizedKey.includes('phone') && !normalizedData.phone) {
              normalizedData.phone = value.toString().trim();
            } else if (normalizedKey.includes('postcode') || normalizedKey.includes('postal') || normalizedKey.includes('zip')) {
              normalizedData.postcode = value.toString().trim();
            } else if (normalizedKey.includes('image') && normalizedKey.includes('url')) {
              normalizedData.image_url = value.toString().trim();
            } else if (normalizedKey.includes('parent') && normalizedKey.includes('phone')) {
              normalizedData.parent_phone = value.toString().trim();
            }
          });

          // More lenient validation - only require name OR phone
          if (!normalizedData.name && !normalizedData.phone) {
            warnings.push(`Row ${rowNumber}: Missing both name and phone - skipping`);
            continue;
          }

          // Create clean lead object with proper field mapping
          const cleanLead = {
            name: normalizedData.name || `Lead ${rowNumber}`,
            phone: normalizedData.phone || '',
            email: normalizedData.email || '',
            postcode: normalizedData.postcode || '',
            image_url: normalizedData.image_url || '',
            parent_phone: normalizedData.parent_phone || '',
            status: 'New', // Always 'New' for uploads
            booker: null, // Never assign booker for uploaded leads
            date_booked: null, // Never set dateBooked for uploaded leads
          };
          
          // Only add age if it has a valid value
          if (normalizedData.age) {
            const ageValue = parseInt(normalizedData.age);
            if (!isNaN(ageValue) && ageValue > 0) {
              cleanLead.age = ageValue;
            }
          }

          // Only add leads with at least a name or phone
          if (cleanLead.name !== `Lead ${rowNumber}` || cleanLead.phone) {
            processedLeads.push(cleanLead);
          }

        } catch (rowError) {
          warnings.push(`Row ${rowNumber}: Processing error - ${rowError.message}`);
          continue; // Skip problematic rows instead of failing
        }
      }

      console.log(`✅ Successfully processed ${processedLeads.length} leads`);
      console.log(`⚠️ Generated ${warnings.length} warnings`);

      // Continue even if there are warnings, as long as we have some valid leads
      if (processedLeads.length === 0) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ 
          message: 'No valid leads found after processing', 
          warnings: warnings.slice(0, 10),
          info: 'Make sure your file contains columns with name or phone data'
        });
      }

      // Get existing leads for duplicate detection
      const existingLeads = await dbManager.query('leads', {
        select: 'id, name, phone, email, postcode',
        is: { deleted_at: null }
      });

      if (!existingLeads) {
        console.error('Error fetching existing leads for duplicate detection');
        return res.status(500).json({ message: 'Server error' });
      }

      // Legacy database connection removed - using only current database
      const legacyLeads = []; // Empty array - legacy database no longer used

      // Analyze leads for duplicates and distance
      console.log('🔍 Analyzing leads for duplicates and distance...');
      console.log(`📊 Found ${existingLeads.length} existing leads for duplicate detection`);
      console.log('ℹ️ Legacy leads checking disabled - using only current database');
      console.log(`📤 Processing ${processedLeads.length} uploaded leads`);

      // Debug: show sample of existing leads structure
      if (existingLeads.length > 0) {
        console.log('📋 Sample existing lead structure:', {
          id: existingLeads[0].id,
          hasPhone: !!existingLeads[0].phone,
          hasEmail: !!existingLeads[0].email,
          fields: Object.keys(existingLeads[0])
        });
      }

      const analysisResult = await analyseLeads(processedLeads, existingLeads, legacyLeads);

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      // Return analysis results with additional info about filtering
      res.json({
        message: 'Lead analysis complete (enhanced mode)',
        analysis: analysisResult,
        processedLeads: processedLeads,
        summary: {
          totalRows: leads.length,
          validLeads: processedLeads.length,
          warnings: warnings.length
        },
        warnings: warnings.slice(0, 5) // Include first 5 warnings for reference
      });

    } catch (parseError) {
      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      console.error('File parsing error:', parseError);
      
      // More informative error message
      res.status(400).json({ 
        message: 'File processing completed with issues. Some data may have been recovered.',
        error: parseError.message,
        suggestion: 'The upload is more permissive now - try uploading anyway, as partial data might be usable.'
      });
    }

  } catch (error) {
    // Clean up uploaded file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Upload error:', error);
    res.status(500).json({ 
      message: 'Server error during upload',
      error: error.message 
    });
  }
});

// @route   POST /api/leads/bulk-create
// @desc    Bulk create leads after analysis approval
// @access  Admin only
router.post('/bulk-create', auth, adminAuth, async (req, res) => {
  try {
    const { leads } = req.body;
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: 'No leads provided' });
    }

    console.log(`🔄 Starting bulk import of ${leads.length} leads by user ${req.user.id}`);

    let duplicateCount = 0;
    const importErrors = [];
    const leadsToInsert = [];

    // Phase 1: Fetch existing leads once for duplicate checking (instead of per-lead)
    let existingLeads = [];
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, phone, email')
        .is('deleted_at', null);
      if (!error && data) existingLeads = data;
    } catch (fetchErr) {
      console.warn('⚠️ Could not fetch existing leads for duplicate check:', fetchErr.message);
    }

    const existingPhoneSet = new Set(existingLeads.filter(l => l.phone).map(l => normalizePhone(l.phone)));
    const existingEmailSet = new Set(existingLeads.filter(l => l.email).map(l => l.email.toLowerCase()));
    const existingNamePhoneSet = new Set(existingLeads.filter(l => l.name && l.phone).map(l => `${l.name}::${normalizePhone(l.phone)}`));

    // Phase 2: Validate and prepare all leads
    for (let leadData of leads) {
      // Map both imageUrl and image_url to image_url
      if (leadData.imageUrl && !leadData.image_url) {
        leadData.image_url = leadData.imageUrl;
      }
      if (leadData.image_url && leadData.imageUrl) {
        delete leadData.imageUrl;
      }

      // Duplicate check against pre-fetched existing leads
      const duplicateChecks = [];

      if (leadData.phone) {
        const norm = normalizePhone(leadData.phone);
        if (existingPhoneSet.has(norm)) {
          duplicateChecks.push(`Phone: ${leadData.phone} matches existing lead`);
        }
      }

      if (leadData.email) {
        if (existingEmailSet.has(leadData.email.toLowerCase())) {
          duplicateChecks.push(`Email: ${leadData.email} matches existing lead`);
        }
      }

      if (leadData.name && leadData.phone) {
        const key = `${leadData.name}::${normalizePhone(leadData.phone)}`;
        if (existingNamePhoneSet.has(key)) {
          duplicateChecks.push(`Name+Phone: ${leadData.name} + ${leadData.phone} already exists`);
        }
      }

      if (duplicateChecks.length > 0) {
        duplicateCount++;
        importErrors.push(`Duplicate found for ${leadData.name}: ${duplicateChecks.join(', ')}`);
        console.log(`❌ Duplicate skipped: ${leadData.name} - ${duplicateChecks.join(', ')}`);
        continue;
      }

      // Generate booking code
      let bookingCode = null;
      try {
        bookingCode = await generateBookingCode(leadData.name);
      } catch (bcError) {
        console.warn(`⚠️ Failed to generate booking code for ${leadData.name}:`, bcError.message);
      }

      const lead = {
        id: uuidv4(),
        name: leadData.name,
        phone: leadData.phone || null,
        email: leadData.email || null,
        postcode: leadData.postcode,
        image_url: leadData.image_url,
        parent_phone: leadData.parent_phone,
        age: leadData.age,
        gender: leadData.gender || null,
        notes: leadData.notes || null,
        lead_source: leadData.lead_source || null,
        booker_id: null,
        status: 'New',
        date_booked: null,
        is_confirmed: false,
        booking_status: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (lead.retargeting && typeof lead.retargeting === 'object') {
        lead.retargeting = JSON.stringify(lead.retargeting);
      }

      leadsToInsert.push(lead);

      // Track newly added leads so in-batch duplicates are caught too
      if (leadData.phone) existingPhoneSet.add(normalizePhone(leadData.phone));
      if (leadData.email) existingEmailSet.add(leadData.email.toLowerCase());
      if (leadData.name && leadData.phone) existingNamePhoneSet.add(`${leadData.name}::${normalizePhone(leadData.phone)}`);
    }

    // Phase 3: Batch insert — all or nothing per batch
    const importedLeads = [];
    const batchSize = 500;
    for (let b = 0; b < leadsToInsert.length; b += batchSize) {
      const batch = leadsToInsert.slice(b, b + batchSize);
      try {
        const { error } = await supabase.from('leads').insert(batch);
        if (error) throw error;
        importedLeads.push(...batch);
      } catch (batchErr) {
        console.error(`❌ Batch insert failed (leads ${b + 1}-${b + batch.length}):`, batchErr.message);
        importErrors.push(`Batch insert failed for ${batch.length} leads: ${batchErr.message}`);
      }
    }

    const importedCount = importedLeads.length;

    // Update user's leads_assigned count once using atomic SQL increment
    if (importedCount > 0 && req.user && req.user.id) {
      try {
        await supabase.rpc('exec_sql', {
          sql: `UPDATE users SET leads_assigned = COALESCE(leads_assigned, 0) + ${parseInt(importedCount)} WHERE id = '${req.user.id}'`
        });
      } catch (statsErr) {
        console.warn('⚠️ Failed to update user leads_assigned count:', statsErr.message);
      }
    }

    // Emit real-time update
    if (global.io && importedCount > 0) {
      global.io.emit('leads_bulk_imported', {
        count: importedCount,
        action: 'bulk_import',
        timestamp: new Date()
      });

      global.io.emit('stats_update_needed', {
        type: 'bulk_import',
        timestamp: new Date()
      });
    }

    console.log(`📊 Bulk import completed: ${importedCount} imported, ${duplicateCount} duplicates skipped, ${importErrors.length} errors`);

    res.json({
      message: `Successfully imported ${importedCount} leads${duplicateCount > 0 ? `, ${duplicateCount} duplicates skipped` : ''}`,
      imported: importedCount,
      duplicates: duplicateCount,
      total: leads.length,
      errors: importErrors.length > 0 ? importErrors.slice(0, 10) : undefined,
      leads: importedLeads
    });

  } catch (error) {
    console.error('Bulk create error:', error);
    res.status(500).json({ message: 'Server error during bulk create: ' + error.message });
  }
});

// @route   PATCH /api/leads/:id/notes
// @desc    Update lead notes - ALL USERS CAN EDIT NOTES
// @access  Private (all authenticated users can update notes)
router.patch('/:id/notes', auth, async (req, res) => {
  try {
    const { notes, oldNotes } = req.body;
    
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    console.log(`📝 Notes update requested by ${req.user.name} (${req.user.role}) for lead ${req.params.id}`);

    // Get the lead
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id },
      is: { deleted_at: null }
    });

    if (!leads || leads.length === 0) {
      console.error('Update notes error: Lead not found or deleted');
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // ALL USERS CAN EDIT NOTES - NO ACCESS RESTRICTIONS
    console.log(`✅ Access granted: ${req.user.name} can edit notes for lead ${lead.name}`);

    // Store old notes for history comparison
    const previousNotes = lead.notes || '';
    const newNotes = notes || '';

    // Update notes
    await dbManager.update('leads', {
      notes: newNotes,
      updated_at: new Date().toISOString()
    }, { id: req.params.id });

    // Get updated lead
    const updatedLeads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });
    const updatedLead = updatedLeads[0];

    // Add to booking history with detailed information
    await addBookingHistoryEntry(
      req.params.id,
      'NOTES_UPDATED',
      req.user.id,
      req.user.name,
      {
        oldNotes: previousNotes,
        newNotes: newNotes,
        updatedBy: req.user.name,
        timestamp: new Date().toISOString(),
        changeType: previousNotes ? 'modified' : 'added',
        characterCount: newNotes.length
      },
      createLeadSnapshot(updatedLead)
    );


    // Emit real-time update
    if (global.io) {
      // Emit both events for compatibility
      global.io.emit('lead_updated', {
        leadId: req.params.id,
        action: 'notes_updated',
        updatedBy: req.user.name,
        timestamp: new Date(),
        notes: newNotes
      });
      
      // Also emit specific notes_updated event
      global.io.emit('notes_updated', {
        leadId: req.params.id,
        updatedBy: req.user.name,
        timestamp: new Date(),
        notes: newNotes,
        leadName: lead.name
      });
    }

    console.log(`✅ Notes updated successfully by ${req.user.name} for lead ${lead.name}`);

    res.json({ 
      message: 'Notes updated successfully',
      lead: updatedLead,
      updatedBy: req.user.name,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Update notes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leads/:id/tags
// @desc    Get tags for a lead
// @access  Private
router.get('/:id/tags', auth, async (req, res) => {
  try {
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    // Get the lead with booker info using Supabase
    const lead = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    if (!lead || lead.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const leadData = lead[0];
    
    // Get booker info if booker_id exists
    let bookerInfo = null;
    if (leadData.booker_id) {
      const booker = await dbManager.query('users', {
        select: 'name, email',
        eq: { id: leadData.booker_id }
      });
      if (booker && booker.length > 0) {
        bookerInfo = booker[0];
      }
    }

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // ROLE-BASED ACCESS CONTROL
    if (req.user.role !== 'admin' && leadData.booker_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only view leads assigned to you.' });
    }

    // Parse tags from JSON string
    let tags = [];
    try {
      tags = leadData.tags ? JSON.parse(leadData.tags) : [];
    } catch (e) {
      console.error('Error parsing tags:', e);
      tags = [];
    }

    res.json({ tags });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/leads/:id/tags
// @desc    Update tags for a lead
// @access  Private
router.put('/:id/tags', auth, async (req, res) => {
  try {
    const { tags } = req.body;
    
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    if (!Array.isArray(tags)) {
      return res.status(400).json({ message: 'Tags must be an array' });
    }

    // Get the lead for access control using Supabase
    const lead = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    if (!lead || lead.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const leadData = lead[0];

    // ROLE-BASED ACCESS CONTROL
    if (req.user.role !== 'admin' && leadData.booker_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only modify leads assigned to you.' });
    }

    // Remove duplicates and validate tags
    const uniqueTags = [...new Set(tags)].filter(tag => 
      typeof tag === 'string' && tag.trim().length > 0
    );

    // Update tags using Supabase
    const tagsJson = JSON.stringify(uniqueTags);
    const updateResult = await dbManager.update('leads', { tags: tagsJson }, { id: req.params.id });

    if (!updateResult || updateResult.length === 0) {
      return res.status(500).json({ message: 'Failed to update tags' });
    }

    // Get updated lead
    const updatedLead = updateResult[0];

    // Add to booking history
    await addBookingHistoryEntry(
      req.params.id,
      'TAGS_UPDATE',
      req.user.id,
      req.user.name,
      {
        tags: uniqueTags,
        updatedBy: req.user.name,
        timestamp: new Date()
      },
      createLeadSnapshot(updatedLead)
    );


    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_updated', {
        leadId: req.params.id,
        action: 'tags_updated',
        updatedBy: req.user.name,
        tags: uniqueTags,
        timestamp: new Date()
      });
    }

    res.json({ 
      message: 'Tags updated successfully',
      tags: uniqueTags,
      lead: updatedLead
    });

  } catch (error) {
    console.error('Update tags error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/leads/:id/tags
// @desc    Add a single tag to a lead
// @access  Private
router.post('/:id/tags', auth, async (req, res) => {
  try {
    const { tag } = req.body;
    
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    if (!tag || typeof tag !== 'string' || tag.trim().length === 0) {
      return res.status(400).json({ message: 'Valid tag is required' });
    }

    // Get the lead with current tags
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // ROLE-BASED ACCESS CONTROL
    if (req.user.role !== 'admin' && lead.booker_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only modify leads assigned to you.' });
    }

    // Parse current tags
    let currentTags = [];
    try {
      currentTags = lead.tags ? JSON.parse(lead.tags) : [];
    } catch (e) {
      console.error('Error parsing current tags:', e);
      currentTags = [];
    }

    // Add new tag if not already present
    const newTag = tag.trim();
    if (!currentTags.includes(newTag)) {
      currentTags.push(newTag);
    }

    // Update tags
    const tagsJson = JSON.stringify(currentTags);
    await dbManager.update('leads', { tags: tagsJson }, { id: req.params.id });

    // Get updated lead
    const updatedLeads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });
    const updatedLead = updatedLeads[0];

    // Add to booking history
    await addBookingHistoryEntry(
      req.params.id,
      'TAG_ADDED',
      req.user.id,
      req.user.name,
      {
        tag: newTag,
        updatedBy: req.user.name,
        timestamp: new Date()
      },
      createLeadSnapshot(updatedLead)
    );


    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_updated', {
        leadId: req.params.id,
        action: 'tag_added',
        updatedBy: req.user.name,
        tag: newTag,
        timestamp: new Date()
      });
    }

    res.json({ 
      message: 'Tag added successfully',
      tags: currentTags,
      addedTag: newTag,
      lead: updatedLead
    });

  } catch (error) {
    console.error('Add tag error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/leads/:id/tags/:tag
// @desc    Remove a specific tag from a lead
// @access  Private
router.delete('/:id/tags/:tag', auth, async (req, res) => {
  try {
    const { tag } = req.params;
    
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID format' });
    }

    if (!tag) {
      return res.status(400).json({ message: 'Tag is required' });
    }

    // Get the lead with current tags
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // ROLE-BASED ACCESS CONTROL
    if (req.user.role !== 'admin' && lead.booker_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only modify leads assigned to you.' });
    }

    // Parse current tags
    let currentTags = [];
    try {
      currentTags = lead.tags ? JSON.parse(lead.tags) : [];
    } catch (e) {
      console.error('Error parsing current tags:', e);
      currentTags = [];
    }

    // Remove the tag
    const updatedTags = currentTags.filter(t => t !== tag);

    // Update tags
    const tagsJson = JSON.stringify(updatedTags);
    await dbManager.update('leads', { tags: tagsJson }, { id: req.params.id });

    // Get updated lead
    const updatedLeads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });
    const updatedLead = updatedLeads[0];

    // Add to booking history
    await addBookingHistoryEntry(
      req.params.id,
      'TAG_REMOVED',
      req.user.id,
      req.user.name,
      {
        tag: tag,
        updatedBy: req.user.name,
        timestamp: new Date()
      },
      createLeadSnapshot(updatedLead)
    );


    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_updated', {
        leadId: req.params.id,
        action: 'tag_removed',
        updatedBy: req.user.name,
        tag: tag,
        timestamp: new Date()
      });
    }

    res.json({ 
      message: 'Tag removed successfully',
      tags: updatedTags,
      removedTag: tag,
      lead: updatedLead
    });

  } catch (error) {
    console.error('Remove tag error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/leads/:id/reject
// @desc    Reject a lead with a reason
// @access  Private (Admin and Booker only)
router.patch('/:id/reject', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!req.params.id || !reason) {
      return res.status(400).json({ message: 'Invalid lead ID or reason' });
    }

    // ROLE-BASED ACCESS CONTROL
    if (req.user.role !== 'admin' && req.user.role !== 'booker') {
      return res.status(403).json({ message: 'Access denied. Only admins and bookers can reject leads.' });
    }

    // Get the lead first to check if it exists and for history tracking
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id },
      is: { deleted_at: null }
    });
    
    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // Check if user has permission to reject this lead (admin can reject any, booker can only reject their own)
    if (req.user.role !== 'admin' && lead.booker_id !== req.user.id) {
      return res.status(403).json({ message: 'Access denied. You can only reject leads assigned to you.' });
    }

    const now = new Date().toISOString();

    // Update the lead status
    // ✅ REJECTION UPDATE: Clear booking information to allow reassignment
    // Booking history will preserve the original appointment details
    await dbManager.update('leads', {
      status: 'Rejected',
      reject_reason: reason,
      rejected_at: now,
      // Clear booking information to allow lead reassignment
      date_booked: null,
      time_booked: null,
      booking_slot: null,
      is_confirmed: null,
      booking_status: null
    }, { id: req.params.id });
    
    const updatedLeads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });
    const updatedLead = updatedLeads[0];
    
    // Add booking history entry for rejection
    try {
      await addBookingHistoryEntry(
        req.params.id,
        'LEAD_REJECTED',
        req.user.id,
        req.user.name,
        {
          reason: reason,
          previousStatus: lead.status,
          previousDateBooked: lead.date_booked
        },
        createLeadSnapshot(updatedLead)
      );
    } catch (historyError) {
      console.error('Failed to add rejection history entry:', historyError);
      // Don't fail the request if history tracking fails
    }


    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_updated', {
        leadId: req.params.id,
        action: 'rejected',
        timestamp: new Date()
      });
      global.io.emit('calendar_update_needed', {
        type: 'lead_rejected',
        leadId: req.params.id
      });
    }

    res.json({ success: true, lead: updatedLead });
  } catch (error) {
    console.error('Reject lead error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leads/:id/messages
// @desc    Get SMS/email messages for a specific lead (also marks received as read)
// @access  Private
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, lead_id, type, status, sms_body, content, subject, email_body, sent_by, sent_by_name, read_status, sent_at, created_at')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: true })
      .limit(50);

    // Side-effect: mark all received messages as read when user opens the conversation
    supabase
      .from('messages')
      .update({ read_status: true })
      .eq('lead_id', req.params.id)
      .in('status', ['received', 'delivered'])
      .eq('read_status', false)
      .then(() => {})
      .catch(() => {});

    if (error) {
      console.error('Error fetching lead messages:', error);
      return res.status(500).json({ message: 'Failed to fetch messages' });
    }

    // Convert to bookingHistory format for frontend compatibility
    // Note: inbound emails may have status 'received' or 'delivered' (gmailPoller uses 'delivered')
    const history = (messages || []).map(msg => {
      const isEmail = msg.type === 'email';
      const isInbound = msg.status === 'received' || msg.status === 'delivered';
      const bodyText = isEmail
        ? (msg.email_body || msg.content || msg.subject || '')
        : (msg.sms_body || msg.content || '');
      return {
        action: msg.type === 'sms'
          ? (isInbound ? 'SMS_RECEIVED' : 'SMS_SENT')
          : (isInbound ? 'EMAIL_RECEIVED' : 'EMAIL_SENT'),
        timestamp: msg.sent_at || msg.created_at,
        performed_by: msg.sent_by,
        performed_by_name: msg.sent_by_name,
        details: {
          body: bodyText,
          message: bodyText,
          subject: msg.subject || '',
          read: msg.read_status || false,
          status: msg.status,
          direction: isInbound ? 'received' : 'sent'
        }
      };
    });

    res.json({ messages: history });
  } catch (err) {
    console.error('Error fetching lead messages:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/leads/:id/send-sms
// @desc    Send SMS to a lead
// @access  Private
router.post('/:id/send-sms', auth, async (req, res) => {
  try {
    const { message, type } = req.body;
    if (!req.params.id || !message) {
      return res.status(400).json({ message: 'Invalid lead ID or message' });
    }

    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // Check if lead has a phone number
    if (!lead.phone) {
      return res.status(400).json({ message: 'Lead does not have a phone number' });
    }

    let smsResult;
    switch (type) {
      case 'booking_confirmation': {
        // Note: `message` is not used here - sendBookingConfirmation sends the lead's
        // active booking_confirmation template, not custom text. Pass bookingDate as
        // null (not `message`) so it falls back to lead.date_booked instead of trying
        // to parse the SMS text as a date.
        const bookingConfirmationResult = await MessagingService.sendBookingConfirmation(
          lead.id, req.user.id, null, { sendEmail: false, sendSms: true }
        );
        // sendBookingConfirmation returns { smsSent, emailSent, ... }, not { success },
        // so normalize the shape to match the other cases below.
        smsResult = {
          success: !!bookingConfirmationResult?.smsSent,
          error: bookingConfirmationResult?.smsSent ? null : 'Failed to send booking confirmation SMS'
        };
        break;
      }
      case 'appointment_reminder':
        smsResult = await sendAppointmentReminder(lead, message);
        break;
      case 'status_update':
        smsResult = await sendStatusUpdate(lead, message);
        break;
      case 'custom':
      default:
        smsResult = await sendCustomMessage(lead.phone, message);
        break;
    }

    if (smsResult.success) {
      // Insert into messages table so it appears in conversation
      try {
        const crypto = require('crypto');
        await supabase.from('messages').insert({
          id: crypto.randomUUID(),
          lead_id: req.params.id,
          type: 'sms',
          status: 'sent',
          content: message,
          sms_body: message,
          recipient_phone: lead.phone,
          sent_by: req.user.id,
          sent_by_name: req.user.name,
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } catch (msgErr) {
        console.error('Warning: Failed to insert SMS into messages table:', msgErr.message);
      }

      // Add to booking history with provider status and ID
      await addBookingHistoryEntry(
        req.params.id,
        'SMS_SENT',
        req.user.id,
        req.user.name,
        {
          message: message,
          type: type,
          phone: lead.phone,
          status: (smsResult.status || 'submitted'),
          provider: 'thesmsworks',
          messageId: smsResult.messageId || null,
          timestamp: new Date()
        },
        createLeadSnapshot(lead)
      );

        // Mark all received messages as read when user replies
        await markAllReceivedMessagesAsRead(req.params.id);

        // Emit socket event to update calendar notifications
        if (req.io) {
          req.io.emit('lead_updated', {
            leadId: req.params.id,
            type: 'messages_read'
          });
        }

      res.json({
        success: true,
        message: 'SMS sent successfully',
        sid: smsResult.sid
      });
    } else {
      // Record a failed attempt for visibility in conversation
      try {
        await addBookingHistoryEntry(
          req.params.id,
          'SMS_FAILED',
          req.user.id,
          req.user.name,
          {
            message: message,
            type: type,
            phone: lead.phone,
            status: 'failed',
            error_message: smsResult.error || 'Unknown error',
            timestamp: new Date()
          },
          createLeadSnapshot(lead)
        );
      } catch {}
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send SMS',
        error: smsResult.error
      });
    }

  } catch (error) {
    console.error('Send SMS error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/leads/bulk-communication
// @desc    Send bulk email/SMS to multiple leads using templates
// @access  Private
router.post('/bulk-communication', auth, async (req, res) => {
  try {
    const { templateId, leadIds, communicationType, customSubject, customEmailBody, customSmsBody } = req.body;
    
    if (!templateId || !leadIds || leadIds.length === 0) {
      return res.status(400).json({ message: 'Template ID and lead IDs are required' });
    }

    console.log(`📤 Starting bulk communication for ${leadIds.length} leads with template ${templateId}`);
    
    // Get the template
    const { data: templates, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_active', true)
      .limit(1);
    
    if (templateError) {
      console.error('❌ Template fetch error:', templateError);
      return res.status(500).json({ message: 'Error fetching template', error: templateError.message });
    }
    
    if (!templates || templates.length === 0) {
      console.log('❌ Template not found or inactive:', templateId);
      return res.status(404).json({ message: 'Template not found or inactive' });
    }
    
    const template = templates[0];
    console.log(`✅ Using template: ${template.name} (${template.type})`);

    let sentCount = 0;
    const results = [];

    for (const leadId of leadIds) {
      try {
        console.log(`📊 Processing lead: ${leadId}`);
        
        // Get the lead data
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();
        
        if (leadError || !lead) {
          console.log(`⚠️ Lead ${leadId} not found:`, leadError);
          results.push({
            leadId,
            error: 'Lead not found'
          });
          continue;
        }
        
        console.log(`✅ Found lead: ${lead.name} (${lead.email || 'no email'}, ${lead.phone || 'no phone'})`);

        // Prepare variables for template replacement
        const variables = {
          '{leadName}': lead.name || 'Customer',
          '{leadEmail}': lead.email || '',
          '{leadPhone}': lead.phone || '',
          '{leadPostcode}': lead.postcode || '',
          '{leadStatus}': lead.status || 'New',
          '{dateBooked}': lead.date_booked ? new Date(lead.date_booked).toLocaleDateString('en-GB') : '',
          '{timeBooked}': lead.time_booked || '',
          '{companyName}': 'Modelling Studio CRM',
          '{bookerName}': req.user.name || 'Team Member'
        };

        // Replace variables in content
        let emailSubject = customSubject || template.subject || '';
        let emailBody = customEmailBody || template.email_body || '';
        let smsBody = customSmsBody || template.sms_body || '';

        Object.entries(variables).forEach(([key, value]) => {
          emailSubject = emailSubject.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
          emailBody = emailBody.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
          smsBody = smsBody.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
        });

        // Create a custom template object
        // IMPORTANT: Respect template's send_email/send_sms settings
        const wantsEmail = (communicationType === 'email' || communicationType === 'both');
        const wantsSms = (communicationType === 'sms' || communicationType === 'both');
        const templateAllowsEmail = template.send_email !== false;
        const templateAllowsSms = template.send_sms !== false;

        const customTemplate = {
          ...template,
          subject: emailSubject,
          email_body: emailBody,
          sms_body: smsBody,
          send_email: wantsEmail && templateAllowsEmail,
          send_sms: wantsSms && templateAllowsSms,
          email_account: template.email_account || 'primary'
        };

        console.log(`📧 Template settings: send_email=${customTemplate.send_email}, send_sms=${customTemplate.send_sms}, email_account=${customTemplate.email_account}`);

        // Use MessagingService.processTemplate
        const processedTemplate = MessagingService.processTemplate(customTemplate, lead, req.user, lead.date_booked, lead.time_booked);
        
        console.log(`📧 Processed template for ${lead.name}:`, {
          hasEmail: !!processedTemplate.email_body,
          hasSms: !!processedTemplate.sms_body,
          emailLength: processedTemplate.email_body?.length || 0,
          smsLength: processedTemplate.sms_body?.length || 0
        });

        // Create message record
        const messageId = require('uuid').v4();
        const { data: messageResult, error: messageError } = await supabase
          .from('messages')
          .insert({
            id: messageId,
            lead_id: leadId,
            template_id: templateId,
            type: (customTemplate.send_email && customTemplate.send_sms) ? 'both' : (customTemplate.send_email ? 'email' : 'sms'),
            content: customTemplate.send_email ? processedTemplate.email_body : processedTemplate.sms_body,
            subject: customTemplate.send_email ? processedTemplate.subject : null,
            email_body: customTemplate.send_email ? processedTemplate.email_body : null,
            sms_body: customTemplate.send_sms ? processedTemplate.sms_body : null,
            recipient_email: customTemplate.send_email ? lead.email : null,
            recipient_phone: customTemplate.send_sms ? lead.phone : null,
            sent_by: req.user.id,
            sent_by_name: req.user.name,
            status: 'pending',
            sent_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (messageError) {
          console.error('❌ Message creation error:', messageError);
          results.push({
            leadId,
            customerName: lead.name,
            error: 'Failed to create message record'
          });
          continue;
        }

        console.log(`✅ Message record created: ${messageResult.id}`);

        // Send communications
        let emailSent = false;
        let smsSent = false;
        let emailError = null;
        let smsError = null;

        // Send email if requested and lead has email
        if (customTemplate.send_email && lead.email) {
          try {
            const message = {
              id: messageId,
              recipient_email: lead.email,
              recipient_name: lead.name,
              subject: processedTemplate.subject,
              email_body: processedTemplate.email_body,
              lead_id: leadId,
              template_id: templateId,
              type: 'email',
              sent_by: req.user.id,
              sent_by_name: req.user.name,
              status: 'pending',
              created_at: new Date().toISOString(),
              channel: 'email',
            };
            
            // Resolve email account: template > user assignment > default
            let resolvedEmailAccount = 'primary';
            try {
              const resolution = await emailAccountService.resolveEmailAccount({
                templateId: template?.id,
                userId: req.user?.id
              });
              if (resolution.type === 'database' && resolution.account) {
                resolvedEmailAccount = resolution.account;
                console.log(`📧 Bulk email using: ${resolution.account.email} (database)`);
              } else {
                resolvedEmailAccount = resolution.accountKey || template?.email_account || 'primary';
                console.log(`📧 Bulk email using: ${resolvedEmailAccount} (legacy)`);
              }
            } catch (resolveErr) {
              console.error('📧 Email account resolution error, using default:', resolveErr.message);
              resolvedEmailAccount = template?.email_account || 'primary';
            }

            console.log(`📧 Sending email to ${lead.email}...`);
            const emailResult = await MessagingService.sendEmail(message, resolvedEmailAccount);
            emailSent = emailResult;
            
            if (emailResult) {
              console.log(`✅ Email sent successfully to ${lead.email}`);
            } else {
              console.log(`❌ Email failed to ${lead.email}`);
            }
          } catch (error) {
            console.error('❌ Email sending error:', error);
            emailError = error.message;
          }
        } else if (customTemplate.send_email && !lead.email) {
          emailError = 'Lead does not have an email address';
        }

        // Send SMS if requested and lead has phone
        if (customTemplate.send_sms && lead.phone) {
          try {
            const message = {
              id: messageId,
              recipient_phone: lead.phone,
              recipient_name: lead.name,
              sms_body: processedTemplate.sms_body,
              lead_id: leadId,
              template_id: templateId,
              type: 'sms',
              sent_by: req.user.id,
              sent_by_name: req.user.name,
              status: 'pending',
              created_at: new Date().toISOString(),
              channel: 'sms',
            };
            
            console.log(`📱 Sending SMS to ${lead.phone}...`);
            const smsResult = await MessagingService.sendSMS(message);
            smsSent = smsResult;
            
            if (smsResult) {
              console.log(`✅ SMS sent successfully to ${lead.phone}`);
            } else {
              console.log(`❌ SMS failed to ${lead.phone}`);
            }
          } catch (error) {
            console.error('❌ SMS sending error:', error);
            smsError = error.message;
          }
        } else if (customTemplate.send_sms && !lead.phone) {
          smsError = 'Lead does not have a phone number';
        }

        // Update message status
        const finalStatus = (emailSent || smsSent) ? 'sent' : 'failed';
        const { error: updateError } = await supabase
          .from('messages')
          .update({
            status: finalStatus,
            email_status: customTemplate.send_email ? (emailSent ? 'sent' : 'failed') : null,
            sms_status: customTemplate.send_sms ? (smsSent ? 'sent' : 'failed') : null,
            sent_at: new Date().toISOString()
          })
          .eq('id', messageId);

        if (updateError) {
          console.error('❌ Message status update error:', updateError);
        } else {
          console.log(`✅ Message ${messageId} status updated to ${finalStatus}`);
        }

        results.push({
          leadId,
          customerName: lead.name,
          email: lead.email,
          phone: lead.phone,
          emailSent,
          smsSent,
          emailError,
          smsError
        });

        if (emailSent || smsSent) {
          sentCount++;
        }
      } catch (leadError) {
        console.error('Error processing lead:', leadError);
        results.push({
          leadId,
          error: leadError.message
        });
      }
    }

    // Calculate success/error counts
    const errorCount = results.filter(r => r.error || (!r.emailSent && !r.smsSent)).length;
    const successCount = results.filter(r => !r.error && (r.emailSent || r.smsSent)).length;

    // Log the communication attempt
    console.log(`📤 Bulk communication completed: ${successCount} successful, ${errorCount} errors`);

    let message = `Bulk communication completed: ${successCount} messages sent successfully`;
    if (errorCount > 0) {
      message += `, ${errorCount} failed`;
    }

    res.json({
      message,
      sentCount: successCount,
      errorCount,
      totalLeads: leadIds.length,
      results,
      note: successCount > 0 ? 'Messages will appear in the message history shortly' : 'No messages were sent due to errors'
    });

  } catch (error) {
    console.error('Bulk communication error:', error);
    res.status(500).json({ message: 'Error sending bulk communications', error: error.message });
  }
});

// @route   POST /api/leads/:id/send-booking-link
// @desc    Send booking link via SMS and/or Email (uses template-booking-link template)
// @access  Private
router.post('/:id/send-booking-link', auth, async (req, res) => {
  try {
    const { channels } = req.body; // 'sms', 'email', or 'both'

    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const lead = leads[0];

    // Generate booking code if missing
    let bookingCode = lead.booking_code;
    if (!bookingCode) {
      bookingCode = await generateBookingCode(lead.name);
      await supabase.from('leads').update({ booking_code: bookingCode }).eq('id', lead.id);
      console.log(`📋 Generated missing booking code: ${bookingCode} for ${lead.name}`);
    }

    const bookingDomain = process.env.BOOKING_DOMAIN || 'www.example.com';
    const bookingLink = `https://${bookingDomain}/book/${bookingCode}`;
    const firstName = lead.name?.split(' ')[0] || '';

    // Fetch booking_link template (editable by user in Templates page)
    let template = null;
    try {
      const templates = await dbManager.query('templates', {
        select: '*',
        eq: { type: 'booking_link', is_active: true }
      });
      template = templates?.[0] || null;
    } catch (tplErr) {
      console.error('Failed to fetch booking link template:', tplErr.message);
    }

    // Default fallback if template not found
    const defaultSms = `Hi ${firstName}, here is your booking link to schedule your session with Auralndn:\n\n${bookingLink}\n\nSimply choose a date and time that suits you. See you soon!`;
    const defaultSubject = 'Book Your Session - Auralndn';
    const defaultEmailBody = `Hi ${firstName},\n\nThank you for your interest in Auralndn!\n\nPlease click the link below to book your session at a time that suits you:\n\n${bookingLink}\n\nYour details are already saved, so you just need to pick a date and time.\n\nIf you have any questions, feel free to reply to this email.\n\nBest regards,\nAuralndn Team`;

    // Replace placeholders in template
    const replacePlaceholders = (text) => {
      if (!text) return '';
      return text
        .replace(/\{leadName\}/g, firstName)
        .replace(/\{fullName\}/g, lead.name || '')
        .replace(/\{bookingLink\}/g, bookingLink)
        .replace(/\{email\}/g, lead.email || '')
        .replace(/\{phone\}/g, lead.phone || '')
        .replace(/\[NAME\]/gi, firstName)
        .replace(/\[BOOKING_LINK\]/gi, bookingLink)
        .replace(/\[lead name\]/gi, firstName);
    };

    const smsMessage = template?.sms_body ? replacePlaceholders(template.sms_body) : defaultSms;
    const emailSubject = template?.subject ? replacePlaceholders(template.subject) : defaultSubject;
    const emailBodyText = template?.email_body ? replacePlaceholders(template.email_body) : defaultEmailBody;

    // Wrap email body in HTML with a clickable button
    const emailBodyHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${emailBodyText.split('\n').map(line => {
          if (line.trim() === bookingLink) {
            return `<div style="text-align: center; margin: 24px 0;">
              <a href="${bookingLink}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">Book Your Session</a>
            </div>
            <p style="font-size: 13px; color: #999; text-align: center;">Or copy this link: <a href="${bookingLink}" style="color: #1e3a5f;">${bookingLink}</a></p>`;
          }
          if (line.trim() === '') return '<br>';
          return `<p style="font-size: 16px; color: #333; margin: 4px 0;">${line}</p>`;
        }).join('\n')}
      </div>
    `.trim();

    const results = [];
    const errors = [];
    const crypto = require('crypto');
    const now = new Date().toISOString();

    // Send SMS
    if ((channels === 'sms' || channels === 'both') && lead.phone) {
      try {
        const smsResult = await sendCustomMessage(lead.phone, smsMessage);
        if (smsResult.success) {
          await supabase.from('messages').insert({
            id: crypto.randomUUID(),
            lead_id: lead.id,
            type: 'sms',
            status: 'sent',
            sms_body: smsMessage,
            recipient_phone: lead.phone,
            sent_by: req.user.id,
            sent_by_name: req.user.name,
            sent_at: now,
            created_at: now,
            updated_at: now,
            delivery_provider: 'thesmsworks',
            provider_message_id: smsResult.messageId || null
          });
          results.push('SMS');
          console.log(`✅ Booking link SMS sent to ${lead.phone}`);
        } else {
          errors.push(`SMS failed: ${smsResult.error || 'Unknown error'}`);
          console.error(`❌ Booking link SMS failed for ${lead.phone}:`, smsResult.error);
        }
      } catch (smsErr) {
        errors.push(`SMS error: ${smsErr.message}`);
        console.error('❌ Booking link SMS error:', smsErr.message);
      }
    }

    // Send Email
    if ((channels === 'email' || channels === 'both') && lead.email) {
      try {
        const msgId = crypto.randomUUID();
        const messageData = {
          id: msgId,
          lead_id: lead.id,
          template_id: template?.id || null,
          type: 'email',
          subject: emailSubject,
          content: emailBodyHtml,
          email_body: emailBodyHtml,
          recipient_email: lead.email,
          recipient_phone: lead.phone || null,
          sent_by: req.user.id,
          sent_by_name: req.user.name,
          status: 'pending',
          created_at: now,
          updated_at: now
        };
        await dbManager.insert('messages', messageData);

        // Resolve email account (same as send-email route)
        let resolvedEmailAccount = 'primary';
        try {
          const resolution = await emailAccountService.resolveEmailAccount({
            templateId: template?.id,
            userId: req.user?.id
          });
          if (resolution.type === 'database' && resolution.account) {
            resolvedEmailAccount = resolution.account;
          } else {
            resolvedEmailAccount = resolution.accountKey || template?.email_account || 'primary';
          }
        } catch (resolveErr) {
          resolvedEmailAccount = template?.email_account || 'primary';
        }

        const emailResult = await MessagingService.sendEmail({
          id: msgId,
          recipient_email: lead.email,
          recipient_name: lead.name,
          subject: emailSubject,
          email_body: emailBodyHtml,
          lead_id: lead.id,
          template_id: template?.id || null,
          type: 'email',
          sent_by: req.user.id,
          sent_by_name: req.user.name
        }, resolvedEmailAccount);

        if (emailResult) {
          results.push('Email');
          console.log(`✅ Booking link email sent to ${lead.email}`);
        } else {
          errors.push('Email send returned false');
          console.error(`❌ Booking link email failed for ${lead.email}`);
        }
      } catch (emailErr) {
        errors.push(`Email error: ${emailErr.message}`);
        console.error('❌ Booking link email error:', emailErr.message);
      }
    }

    // Add to booking history
    await addBookingHistoryEntry(lead.id, 'BOOKING_LINK_SENT', req.user.id, req.user.name, {
      channels: results,
      bookingLink,
      bookingCode,
      templateUsed: template?.name || 'default'
    }, createLeadSnapshot(lead));

    if (results.length > 0) {
      res.json({ success: true, message: `Booking link sent via ${results.join(' & ')}`, channels: results, bookingLink, errors: errors.length > 0 ? errors : undefined });
    } else {
      res.status(400).json({ success: false, message: errors.length > 0 ? errors.join('; ') : 'Failed to send booking link. Check lead has a valid phone/email.' });
    }
  } catch (error) {
    console.error('Error sending booking link:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/leads/:id/send-to-replydesk
// @desc    Send lead to Alex A.I for WhatsApp qualification
// @access  Private
router.post('/:id/send-to-replydesk', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const lead = leads[0];
    const { sendLeadToReplyDesk } = require('./replydesk-webhook');
    const result = await sendLeadToReplyDesk(lead);

    res.json({
      success: true,
      message: `Lead "${lead.name}" sent to ReplyDesk successfully`,
      replydesk_lead_id: result.lead_id,
      replydesk_lead_code: result.lead_code
    });
  } catch (error) {
    console.error('Error sending lead to ReplyDesk:', error);
    res.status(error.code === 'MISSING_PHONE' || error.code === 'INVALID_PHONE' ? 400 : 500).json({
      success: false,
      message: error.message
    });
  }
});

// @route   POST /api/leads/:id/send-booking-confirmation
// @desc    Send booking confirmation SMS
// @access  Private
router.post('/:id/send-booking-confirmation', auth, async (req, res) => {
  try {
    const { appointmentDate } = req.body;
    if (!req.params.id || !appointmentDate) {
      return res.status(400).json({ message: 'Invalid lead ID or appointment date' });
    }

    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: req.params.id }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    if (!lead.phone) {
      return res.status(400).json({ message: 'Lead does not have a phone number' });
    }

    const smsResult = await MessagingService.sendBookingConfirmation(lead.id, req.user.id, appointmentDate, { sendEmail: false, sendSms: true });

    if (smsResult.success) {
      // Add to booking history
      await addBookingHistoryEntry(
        req.params.id,
        'BOOKING_CONFIRMATION_SENT',
        req.user.id,
        req.user.name,
        {
          appointmentDate: appointmentDate,
          phone: lead.phone,
          timestamp: new Date()
        },
        createLeadSnapshot(lead)
      );

      res.json({ 
        success: true, 
        message: 'Booking confirmation SMS sent successfully',
        provider: smsResult.provider || 'thesmsworks',
        messageId: smsResult.messageId || null,
        status: smsResult.status || 'submitted'
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send booking confirmation SMS',
        error: smsResult.error
      });
    }

  } catch (error) {
    console.error('Send booking confirmation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/leads/:id/resend-welcome-pack
// @desc    Resend welcome pack (booking confirmation with email and SMS)
// @access  Private (All authenticated users)
router.post('/:id/resend-welcome-pack', auth, async (req, res) => {
  try {
    const { templateId } = req.body;
    
    if (!req.params.id) {
      return res.status(400).json({ message: 'Invalid lead ID' });
    }

    // Get lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Check if lead has a booking date
    if (!lead.date_booked) {
      return res.status(400).json({ message: 'Lead does not have a booking date' });
    }

    // Get template if provided, otherwise use first active booking confirmation template
    let template = null;
    if (templateId) {
      // When templateId is provided, accept any template type (booking_confirmation or secondary_confirmation)
      const { data: templateData, error: templateError } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .eq('is_active', true)
        .single();

      if (!templateError && templateData) {
        template = templateData;
      }
    }

    // If no template provided or found, get first active booking confirmation template as fallback
    if (!template) {
      const { data: templates, error: templatesError } = await supabase
        .from('templates')
        .select('*')
        .eq('type', 'booking_confirmation')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!templatesError && templates && templates.length > 0) {
        template = templates[0];
      }
    }

    if (!template) {
      return res.status(404).json({ message: 'No active template found' });
    }

    // Send booking confirmation (welcome pack) with both email and SMS
    const bookingDate = lead.date_booked ? new Date(lead.date_booked) : new Date();
    
    const result = await MessagingService.sendBookingConfirmation(
      lead.id,
      req.user.id,
      bookingDate,
      {
        templateId: template.id,
        sendEmail: true,
        sendSms: true
        // Don't pass emailAccount - let resolveEmailAccount handle priority:
        // template.email_account > user assignment > default > primary
      }
    );

    if (result && (result.emailSent || result.smsSent)) {
      res.json({
        success: true,
        message: `Welcome pack resent successfully via ${result.emailSent ? 'Email' : ''}${result.emailSent && result.smsSent ? ' and ' : ''}${result.smsSent ? 'SMS' : ''}`,
        emailSent: result.emailSent || false,
        smsSent: result.smsSent || false
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to resend welcome pack',
        error: result?.error || 'Unknown error'
      });
    }

  } catch (error) {
    console.error('Resend welcome pack error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error',
      error: error.message 
    });
  }
});

// @route   POST /api/leads/:id/send-email
// @desc    Send an email to a lead
// @access  Private
router.post('/:id/send-email', auth, async (req, res) => {
  try {
    const leadId = req.params.id;
    const { subject, body, templateId } = req.body;
    if (!leadId || !subject || !body) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: leadId }
    });
    
    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    const lead = leads[0];
    
    // Optionally fetch template if templateId provided (for logging/template tracking)
    let template = null;
    if (templateId) {
      const templates = await dbManager.query('templates', {
        select: '*',
        eq: { id: templateId }
      });
      template = templates[0] || null;
    }
    // Insert message into database first to get an ID
    const messageData = {
      id: uuidv4(),
      lead_id: lead.id,
      template_id: templateId || null,
      type: 'email',
      subject: subject,
      content: body,
      email_body: body,
      recipient_email: lead.email,
      recipient_phone: lead.phone,
      sent_by: req.user.id,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    
    await dbManager.insert('messages', messageData);

    // Construct message object for MessagingService with database ID
    const message = {
      id: messageData.id,
      recipient_email: lead.email,
      recipient_name: lead.name,
      subject: subject,
      email_body: body,
      lead_id: lead.id,
      template_id: templateId || null,
      type: 'email',
      sent_by: req.user.id,
      sent_by_name: req.user.name,
      status: 'pending',
      created_at: new Date().toISOString(),
      channel: 'email',
    };

    // Resolve email account: template > user > default
    let resolvedEmailAccount = 'primary';
    try {
      const resolution = await emailAccountService.resolveEmailAccount({
        templateId: template?.id,
        userId: req.user?.id
      });
      if (resolution.type === 'database' && resolution.account) {
        resolvedEmailAccount = resolution.account;
        console.log(`📧 Send email using: ${resolution.account.email} (database)`);
      } else {
        resolvedEmailAccount = resolution.accountKey || template?.email_account || 'primary';
        console.log(`📧 Send email using: ${resolvedEmailAccount} (legacy)`);
      }
    } catch (resolveErr) {
      console.error('📧 Error resolving email account:', resolveErr.message);
      resolvedEmailAccount = template?.email_account || 'primary';
    }

    // Send email using MessagingService
    // Note: sendEmail already logs EMAIL_SENT/EMAIL_FAILED to booking history internally
    // (with the correct action name on failure) - do not log a duplicate entry here.
    const result = await MessagingService.sendEmail(message, resolvedEmailAccount);
    
    if (result) {
      return res.json({ success: true, message: 'Email sent successfully' });
    } else {
      return res.status(500).json({ success: false, message: 'Failed to send email' });
    }
  } catch (error) {
    console.error('Error sending email to lead:', error);
    return res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Quick Status Update endpoint for the UI buttons
router.patch('/:id/quick-status', auth, async (req, res) => {
  try {
    const { statusButton } = req.body;
    const leadId = req.params.id;
    
    if (!statusButton) {
      return res.status(400).json({ message: 'Status button is required' });
    }

    // Status mappings for Quick Status Update buttons
    const statusMappings = {
      'Confirm': {
        status: 'Booked',
        is_confirmed: true,
        description: 'Confirm appointment'
      },
      'Unconfirmed': {
        status: 'Booked', 
        is_confirmed: false,
        description: 'Book but keep unconfirmed'
      },
      'Arrived': {
        status: 'Attended',
        is_confirmed: true,
        description: 'Customer has arrived'
      },
      'Left': {
        status: 'Attended',
        is_confirmed: true,
        description: 'Customer has left after appointment'
      },
      'No Sale': {
        status: 'Attended',
        is_confirmed: true,
        has_sale: 0,
        description: 'Attended but no sale made'
      },
      'No Show': {
        status: 'No Show',
        is_confirmed: false,
        description: 'Customer did not show up'
      },
      'Cancel': {
        status: 'Cancelled',
        is_confirmed: false,
        // date_booked NOT cleared - preserve original appointment time for tracking
        description: 'Cancel appointment'
      },
      'Complete': {
        status: 'Attended',
        is_confirmed: true,
        has_sale: 1,
        description: 'Appointment completed with sale'
      },
      'Reject Lead': {
        status: 'Rejected',
        is_confirmed: false,
        // date_booked NOT cleared - preserve history
        description: 'Reject this lead'
      }
    };

    // Get the lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.role !== 'viewer') {
      if (req.user.role === 'booker' && lead.booker_id !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Get status mapping
    const statusMapping = statusMappings[statusButton];
    if (!statusMapping) {
      return res.status(400).json({ message: 'Invalid status button' });
    }

    const oldStatus = lead.status;
    const updateData = {
      status: statusMapping.status,
      is_confirmed: statusMapping.is_confirmed,
      updated_at: new Date().toISOString()
    };

    // ✅ BOOKING HISTORY FIX: Set ever_booked and booked_at when booking via quick status
    if (statusMapping.status === 'Booked' && oldStatus !== 'Booked') {
      updateData.booked_at = new Date().toISOString();
      updateData.ever_booked = true;
    }

    // Handle special cases
    if (statusMapping.has_sale !== undefined) {
      updateData.has_sale = statusMapping.has_sale;
    }
    if (statusMapping.date_booked !== undefined) {
      updateData.date_booked = statusMapping.date_booked;
    }

    // Update the lead
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) {
      console.error('Quick status update error:', updateError);
      return res.status(500).json({ message: 'Failed to update lead' });
    }

    // Add to booking history
    await addBookingHistoryEntry(
      leadId,
      'QUICK_STATUS_UPDATE',
      req.user.id,
      req.user.name,
      {
        oldStatus: oldStatus,
        newStatus: statusMapping.status,
        buttonPressed: statusButton,
        description: statusMapping.description
      },
      createLeadSnapshot(updatedLead)
    );

    // Update user statistics if status changed
    if (oldStatus !== statusMapping.status && updatedLead.booker_id) {
      await updateUserStatistics(updatedLead.booker_id, {
        from: oldStatus,
        to: statusMapping.status
      });
    }

    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_updated', {
        lead: updatedLead,
        action: 'quick_status_update',
        statusChange: {
          from: oldStatus,
          to: statusMapping.status,
          button: statusButton
        },
        timestamp: new Date()
      });
      
      // Emit calendar update
      global.io.emit('calendar_sync_needed', {
        type: 'status_updated',
        leadId: leadId,
        newStatus: statusMapping.status,
        timestamp: new Date()
      });

      // Emit diary update for calendar
      global.io.emit('diary_updated', {
        type: 'DIARY_UPDATED',
        data: {
          leadId: leadId,
          leadName: updatedLead.name,
          oldStatus: oldStatus,
          newStatus: statusMapping.status,
          dateBooked: updatedLead.date_booked,
          timestamp: new Date().toISOString(),
          updatedBy: req.user.name,
          updatedAt: new Date().toISOString()
        }
      });
    }

    console.log(`📅 Quick Status Update: ${updatedLead.name} - ${oldStatus} → ${statusMapping.status} (${statusButton})`);

    res.json({
      message: 'Status updated successfully',
      lead: updatedLead,
      statusChange: {
        from: oldStatus,
        to: statusMapping.status,
        button: statusButton
      }
    });

  } catch (error) {
    console.error('Quick status update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/leads/:id/call-status
// @desc    Update call status and trigger workflows
// @access  Private
router.patch('/:id/call-status', auth, async (req, res) => {
  try {
    const { callStatus } = req.body;
    const leadId = req.params.id;

    if (!callStatus) {
      return res.status(400).json({ message: 'Call status is required' });
    }

    // Valid status options
    const validStatuses = [
      'No answer',
      'No Answer x2',
      'No Answer x3',
      'No photo',
      'Left Message',
      'Not interested',
      'Call back',
      'Wrong number',
      'Sales/converted - purchased',
      'Not Qualified',
      'In Progress'
    ];

    if (!validStatuses.includes(callStatus)) {
      return res.status(400).json({ message: 'Invalid call status' });
    }

    // Get the lead
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: leadId }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // ROLE-BASED ACCESS CONTROL
    if (req.user.role !== 'admin' && lead.booker_id !== req.user.id) {
      return res.status(403).json({
        message: 'Access denied. You can only update leads assigned to you.'
      });
    }

    // AUTO-UPGRADE LOGIC for No Answer statuses
    // When user selects "No answer", check current call_status and auto-upgrade
    let finalCallStatus = callStatus;
    if (callStatus === 'No answer') {
      // Get current call_status from lead
      let currentCallStatus = lead.call_status;

      // Also check custom_fields for backward compatibility
      if (!currentCallStatus && lead.custom_fields) {
        try {
          const cf = typeof lead.custom_fields === 'string'
            ? JSON.parse(lead.custom_fields)
            : lead.custom_fields;
          currentCallStatus = cf?.call_status;
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Auto-upgrade based on current status
      if (currentCallStatus === 'No answer') {
        finalCallStatus = 'No Answer x2';
        console.log(`📞 Auto-upgrading lead ${leadId} from "No answer" to "No Answer x2"`);
      } else if (currentCallStatus === 'No Answer x2') {
        finalCallStatus = 'No Answer x3';
        console.log(`📞 Auto-upgrading lead ${leadId} from "No Answer x2" to "No Answer x3"`);
      } else if (currentCallStatus === 'No Answer x3') {
        finalCallStatus = 'No Answer x3'; // Keep at max
        console.log(`📞 Lead ${leadId} already at "No Answer x3" (max reached)`);
      }
    }

    // Prepare update data - use dedicated call_status column
    const updateData = {
      call_status: finalCallStatus,  // Store in dedicated column (use finalCallStatus for auto-upgrade)
      updated_at: new Date().toISOString()
    };

    // Also update custom_fields for backward compatibility
    let customFields = {};
    try {
      if (lead.custom_fields) {
        customFields = typeof lead.custom_fields === 'string'
          ? JSON.parse(lead.custom_fields)
          : lead.custom_fields;
      }
    } catch (e) {
      console.warn('Error parsing custom_fields:', e);
      customFields = {};
    }
    customFields.call_status = finalCallStatus;
    updateData.custom_fields = JSON.stringify(customFields);

    // Get callback time and note if provided
    const { callbackTime, callbackNote } = req.body;

    // Determine workflow actions based on status
    // Only send email for first "No answer" - not for x2/x3
    const emailTriggers = ['Left Message', 'No answer', 'No photo']; // Note: 'No Answer x2' and 'No Answer x3' are NOT in emailTriggers
    const closeTriggers = ['Not interested', 'Not Qualified'];
    const callbackTriggers = ['Call back', 'Sales/converted - purchased'];

    // DON'T change the main status column for bookers
    // Only admins should move leads to "Rejected" status
    // Bookers just update call_status to track their call outcomes
    // This keeps leads in the booker's assigned list

    // Update the lead (fast - just update call_status)
    const updateResult = await dbManager.update('leads', updateData, { id: leadId });

    if (!updateResult || updateResult.length === 0) {
      return res.status(500).json({ message: 'Failed to update call status' });
    }

    const updatedLead = updateResult[0];

    // Return success immediately (don't wait for booking history or workflows)
    // This makes the UI feel instant and responsive
    const workflowResult = {
      emailScheduled: emailTriggers.includes(finalCallStatus) && lead.email,
      callbackScheduled: callbackTriggers.includes(finalCallStatus) && callbackTime
    };

    // Emit real-time update
    if (global.io) {
      global.io.emit('lead_updated', {
        leadId: leadId,
        action: 'call_status_updated',
        callStatus: finalCallStatus,
        updatedBy: req.user.name,
        workflowResult: workflowResult,
        timestamp: new Date()
      });
    }

    // Send response immediately - don't wait for workflows
    res.json({
      success: true,
      message: 'Call status updated successfully',
      callStatus: finalCallStatus,
      workflowResult: workflowResult,
      lead: updatedLead
    });

    // NOW process workflows asynchronously (after response sent)
    // This prevents blocking the user
    // Wrap in setImmediate to ensure it runs after response is sent
    setImmediate(async () => {
      try {
      // Check booking history BEFORE adding new entry (to determine if email should be sent)
      let shouldSendEmail = true;
      // Only send email for first "No answer" - use original callStatus to check if user clicked "No answer"
      if (callStatus === 'No answer' && emailTriggers.includes('No answer') && lead.email) {
        try {
          const history = lead.booking_history || [];
          const parsedHistory = Array.isArray(history) ? history : 
            (typeof history === 'string' ? JSON.parse(history) : []);
          
          // Check if "No answer" (or x2/x3) has been selected before
          const hasNoAnswerBefore = parsedHistory.some(entry => 
            entry.action === 'CALL_STATUS_UPDATE' && 
            entry.details?.callStatus && 
            (entry.details.callStatus === 'No answer' || 
             entry.details.callStatus === 'No Answer x2' || 
             entry.details.callStatus === 'No Answer x3')
          );
          
          if (hasNoAnswerBefore) {
            console.log(`📧 Skipping email for "No answer" - already sent before for lead ${lead.id}`);
            shouldSendEmail = false; // Don't send email if "No answer" was selected before
          }
        } catch (historyError) {
          console.warn('Error checking booking history for "No answer":', historyError);
          // Continue with email send if history check fails (safer to send than not)
          shouldSendEmail = true;
        }
      }

      // Add to booking history (async - don't block response)
      try {
        await addBookingHistoryEntry(
          leadId,
          'CALL_STATUS_UPDATE',
          req.user.id,
          req.user.name,
          {
            callStatus: finalCallStatus,
            workflowTrigger: emailTriggers.includes(finalCallStatus) && shouldSendEmail ? 'email'
              : closeTriggers.includes(finalCallStatus) ? 'close'
              : 'callback',
            updatedBy: req.user.name,
            timestamp: new Date()
          },
          createLeadSnapshot(updatedLead)
        );
      } catch (historyError) {
        console.error('Error adding booking history:', historyError);
      }

      // Email workflow: Send automatic email for "Left Message", "No answer", or "No photo"
      // Only first "No answer" triggers email - x2/x3 don't (they're not in emailTriggers)
      if (emailTriggers.includes(finalCallStatus) && lead.email && shouldSendEmail) {
        try {
        // Determine template type based on call status
        // Each status has its own template type
        let templateType = 'no_answer'; // default
        if (finalCallStatus === 'No photo') {
          templateType = 'no_photo';
        } else if (finalCallStatus === 'Left Message') {
          templateType = 'no_answer'; // Left Message uses no_answer template (same workflow)
        } else if (finalCallStatus === 'No answer') {
          templateType = 'no_answer';
        }
        
        // Find the user's specific template (booker-specific)
        const { data: templates, error: templateError } = await supabase
          .from('templates')
          .select('*')
          .eq('type', templateType)
          .eq('is_active', true)
          .eq('user_id', req.user.id)
          .limit(1);

        let template = null;
        if (!templateError && templates && templates.length > 0) {
          template = templates[0];
          console.log(`📧 Found "${templateType}" template for user ${req.user.name}:`, template.name);
        } else {
          console.warn(`⚠️ No "${templateType}" template found for user ${req.user.name}. Email not sent.`);
        }

        if (template) {
          // Process template with lead data
          const processedTemplate = MessagingService.processTemplate(
            template,
            lead,
            req.user,
            null,
            null
          );

          // Send EMAIL if enabled in template
          if (template.send_email && template.email_body && lead.email) {
            const messageData = {
              id: uuidv4(),
              lead_id: lead.id,
              template_id: template.id,
              type: 'email',
              subject: processedTemplate.subject || 'We\'ve been trying to contact you',
              content: processedTemplate.email_body,
              email_body: processedTemplate.email_body,
              recipient_email: lead.email,
              recipient_phone: lead.phone,
              sent_by: req.user.id,
              status: 'pending',
              created_at: new Date().toISOString()
            };

            await dbManager.insert('messages', messageData);

            // Resolve email account: template > user > default
            let resolvedEmailAccount = 'primary';
            try {
              const resolution = await emailAccountService.resolveEmailAccount({
                templateId: template.id,
                userId: req.user?.id
              });
              if (resolution.type === 'database' && resolution.account) {
                resolvedEmailAccount = resolution.account;
                console.log(`📧 Workflow email using: ${resolution.account.email} (database)`);
              } else {
                resolvedEmailAccount = resolution.accountKey || template.email_account || 'primary';
                console.log(`📧 Workflow email using: ${resolvedEmailAccount} (legacy)`);
              }
            } catch (resolveErr) {
              console.error('📧 Error resolving email account:', resolveErr.message);
              resolvedEmailAccount = template.email_account || 'primary';
            }

            // Send email using MessagingService
            const emailResult = await MessagingService.sendEmail(
              {
                ...messageData,
                recipient_name: lead.name,
                sent_by_name: req.user.name
              },
              resolvedEmailAccount
            );

            workflowResult.emailSent = emailResult.success;
            workflowResult.emailMessage = emailResult.success 
              ? 'Automatic email sent to client' 
              : 'Failed to send email: ' + (emailResult.error || 'Unknown error');

            console.log(`📧 Automatic email sent for call status "${callStatus}" to ${lead.email}`);
          }

          // Send SMS if enabled in template
          if (template.send_sms && template.sms_body && lead.phone) {
            try {
              const smsBody = processedTemplate.sms_body || template.sms_body;
              const smsResult = await sendSMS(lead.phone, smsBody);
              
              workflowResult.smsSent = smsResult.success;
              workflowResult.smsMessage = smsResult.success 
                ? 'Automatic SMS sent to client' 
                : 'Failed to send SMS: ' + (smsResult.error || 'Unknown error');

              console.log(`📱 Automatic SMS sent for call status "${callStatus}" to ${lead.phone}`);

              // Log SMS in messages table
              const smsMessageData = {
                id: uuidv4(),
                lead_id: lead.id,
                template_id: template.id,
                type: 'sms',
                content: smsBody,
                sms_body: smsBody,
                recipient_phone: lead.phone,
                sent_by: req.user.id,
                status: smsResult.success ? 'sent' : 'failed',
                created_at: new Date().toISOString()
              };
              await dbManager.insert('messages', smsMessageData);

              await addBookingHistoryEntry(
                lead.id,
                smsResult.success ? 'SMS_SENT' : 'SMS_FAILED',
                req.user.id,
                req.user.name,
                {
                  body: smsBody,
                  direction: 'sent',
                  channel: 'sms',
                  status: smsResult.success ? 'sent' : 'failed',
                  error: smsResult.success ? null : (smsResult.error || 'Unknown error'),
                  recipient: lead.phone
                }
              );
            } catch (smsError) {
              console.error('Error sending automatic SMS:', smsError);
              workflowResult.smsSent = false;
              workflowResult.smsMessage = 'Failed to send SMS: ' + smsError.message;
            }
          }
        } else {
          console.warn(`⚠️ No template found for call status "${callStatus}"`);
        }
        } catch (emailError) {
          console.error('Error sending automatic email:', emailError);
        }
      }

      // Callback workflow: Create scheduled reminder for "Call back" status
      if (callbackTriggers.includes(callStatus) && callbackTime) {
        try {
        // Parse callback time - supports both formats:
        // New format: YYYY-MM-DDTHH:MM (full datetime with date picker)
        // Legacy format: HH:MM (time only, auto-determines today/tomorrow)
        let targetDateStr;
        let timeStr;

        if (callbackTime.includes('T')) {
          // New format: YYYY-MM-DDTHH:MM
          const [datePart, timePart] = callbackTime.split('T');
          targetDateStr = datePart;
          timeStr = timePart;
          console.log(`📞 Parsing new datetime format: date=${targetDateStr}, time=${timeStr}`);
        } else {
          // Legacy format: HH:MM only - determine date automatically
          timeStr = callbackTime;
          const now = new Date();
          const ukDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
          const ukTimeStr = now.toLocaleTimeString('en-US', {
            timeZone: 'Europe/London',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
          });

          // Check if the time has already passed today in UK time
          const [hours, minutes] = timeStr.split(':');
          const callbackHour = parseInt(hours, 10);
          const callbackMinute = parseInt(minutes, 10);
          const currentUKHour = parseInt(ukTimeStr.split(':')[0], 10);
          const currentUKMinute = parseInt(ukTimeStr.split(':')[1], 10);
          const currentUKTimeMinutes = currentUKHour * 60 + currentUKMinute;
          const callbackTimeMinutes = callbackHour * 60 + callbackMinute;

          targetDateStr = ukDateStr;
          if (callbackTimeMinutes <= currentUKTimeMinutes) {
            // Time has passed, schedule for tomorrow
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            targetDateStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
          }
        }

        // Validate time format
        const [hours, minutes] = timeStr.split(':');
        const callbackHour = parseInt(hours, 10);
        const callbackMinute = parseInt(minutes, 10);

        if (isNaN(callbackHour) || isNaN(callbackMinute)) {
          throw new Error('Invalid callback time format');
        }

        // Convert UK time to UTC
        // Create date string in UK timezone format
        const ukDateTimeStr = `${targetDateStr}T${timeStr}:00`;

        // Use the same conversion method as dashboard (matching getDateRange logic)
        const startOfDayUK = new Date(ukDateTimeStr);
        const offsetMinutes = -startOfDayUK.getTimezoneOffset();
        let callbackDateTimeUTC = new Date(startOfDayUK.getTime() + (offsetMinutes * 60000));

        // Verify the conversion matches expected UK time
        const verifyUK = callbackDateTimeUTC.toLocaleString('en-US', {
          timeZone: 'Europe/London',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        if (verifyUK !== timeStr) {
          // Fine-tune if needed (shouldn't be necessary with proper conversion)
          const verifyParts = verifyUK.split(':');
          const expectedParts = timeStr.split(':');
          const verifyMins = parseInt(verifyParts[0]) * 60 + parseInt(verifyParts[1]);
          const expectedMins = parseInt(expectedParts[0]) * 60 + parseInt(expectedParts[1]);
          const diffMins = expectedMins - verifyMins;
          callbackDateTimeUTC = new Date(callbackDateTimeUTC.getTime() + (diffMins * 60 * 1000));

          console.log(`📞 Timezone fine-tuning: ${verifyUK} → ${timeStr} (${diffMins} minutes)`);
        }

        // Create callback reminder record
        const reminderData = {
          id: uuidv4(),
          lead_id: leadId,
          user_id: req.user.id,
          callback_time: callbackDateTimeUTC.toISOString(),
          callback_note: callbackNote || null,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await dbManager.insert('callback_reminders', reminderData);

        workflowResult.callbackScheduled = true;
        workflowResult.callbackTime = callbackTime;
        workflowResult.callbackNote = callbackNote;

        // Format for logging
        const displayDate = new Date(callbackDateTimeUTC).toLocaleDateString('en-GB', {
          timeZone: 'Europe/London',
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        console.log(`📞 Callback reminder scheduled for ${displayDate} at ${timeStr} UK time (${callbackDateTimeUTC.toISOString()} UTC) - USER: ${req.user.id} (${req.user.name})`);
        } catch (callbackError) {
          console.error('Error creating callback reminder:', callbackError);
        }
      }
      } catch (workflowError) {
        // Global catch for any unhandled errors in the async workflow
        // This prevents server crashes from unhandled promise rejections
        console.error('❌ Error in async call-status workflow:', workflowError);
      }
    });

  } catch (error) {
    console.error('Update call status error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// @route   GET /api/leads/:id/callbacks
// @desc    Get upcoming callback reminders for a specific lead (user-specific)
// @access  Private
router.get('/:id/callbacks', auth, async (req, res) => {
  try {
    const leadId = req.params.id;
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Only show callbacks created by the current user (user-specific)
    const { data: reminders, error } = await supabase
      .from('callback_reminders')
      .select('*')
      .eq('lead_id', leadId)
      .eq('user_id', req.user.id)
      .in('status', ['pending', 'notified'])
      .gte('callback_time', now.toISOString())
      .lte('callback_time', sevenDaysFromNow.toISOString())
      .order('callback_time', { ascending: true });

    if (error) {
      console.error('Error fetching callback reminders for lead:', error);
      return res.status(500).json({ message: 'Failed to fetch callbacks' });
    }

    res.json(reminders || []);
  } catch (error) {
    console.error('Error fetching callback reminders for lead:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leads/callback-reminders/upcoming
// @desc    Get upcoming callback reminders for the current user
// @access  Private
router.get('/callback-reminders/upcoming', auth, async (req, res) => {
  try {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // Next 90 days (3 months)

    const pastCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago max for overdue

    console.log(`📞 Fetching callbacks for user ${req.user.id} (${req.user.name}) - including overdue (back to ${pastCutoff.toISOString()})`);

    // Get all incomplete callback reminders (pending OR notified) for the current user
    // Including overdue ones up to 30 days old so bookers don't lose track
    const { data: reminders, error } = await supabase
      .from('callback_reminders')
      .select(`
        *,
        leads:lead_id (
          id,
          name,
          phone,
          email
        )
      `)
      .eq('user_id', req.user.id)  // USER-SPECIFIC: Only show this user's callbacks
      .in('status', ['pending', 'notified'])  // Show both pending and notified (not yet completed)
      .gte('callback_time', pastCutoff.toISOString())  // Don't show callbacks older than 30 days
      .lte('callback_time', futureDate.toISOString())
      .order('callback_time', { ascending: true })
      .limit(100);

    if (error) {
      console.error('Error fetching callback reminders:', error);
      return res.status(500).json({ message: 'Server error' });
    }

    console.log(`📞 Found ${(reminders || []).length} callbacks for user ${req.user.id} (${req.user.name})`);

    // Debug: Log each reminder's user_id to verify filtering
    if (reminders && reminders.length > 0) {
      reminders.forEach(r => {
        console.log(`📞 Callback ${r.id}: user_id=${r.user_id}, lead=${r.leads?.name}, time=${r.callback_time}`);
      });
    }

    // Get today, yesterday and tomorrow in UK timezone for comparison
    const todayUK = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowUK = tomorrowDate.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayUK = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

    // Format reminders for frontend
    const formattedReminders = (reminders || []).map(reminder => {
      const callbackTime = new Date(reminder.callback_time);

      // Get the date in UK timezone
      const callbackDateUK = callbackTime.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      const callbackTimeOnly = callbackTime.toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Determine the date label
      let dateLabel;
      if (callbackDateUK === todayUK) {
        dateLabel = 'Today';
      } else if (callbackDateUK === tomorrowUK) {
        dateLabel = 'Tomorrow';
      } else if (callbackDateUK === yesterdayUK) {
        dateLabel = 'Yesterday';
      } else if (callbackTime < now) {
        // Overdue - show the date it was due
        dateLabel = callbackTime.toLocaleDateString('en-GB', {
          timeZone: 'Europe/London',
          weekday: 'short',
          day: '2-digit',
          month: 'short'
        }) + ' (overdue)';
      } else {
        // Future dates
        dateLabel = callbackTime.toLocaleDateString('en-GB', {
          timeZone: 'Europe/London',
          weekday: 'short',
          day: '2-digit',
          month: 'short'
        });
      }

      const callbackTimeDisplay = `${dateLabel} at ${callbackTimeOnly}`;

      // Check if this callback is overdue (callback time has passed)
      const isOverdue = callbackTime < now;

      return {
        id: reminder.id,
        type: 'callback_reminder',
        leadId: reminder.lead_id,
        leadName: reminder.leads?.name || 'Unknown Lead',
        leadPhone: reminder.leads?.phone || '',
        callbackTime: reminder.callback_time,
        callbackTimeDisplay: callbackTimeDisplay,
        callbackDateLabel: dateLabel,
        callbackTimeOnly: callbackTimeOnly,
        callbackNote: reminder.callback_note || '',
        message: `Call back ${reminder.leads?.name || 'lead'} - ${callbackTimeDisplay}${reminder.callback_note ? ` - ${reminder.callback_note}` : ''}`,
        timestamp: reminder.callback_time,
        created_at: reminder.created_at,
        isToday: callbackDateUK === todayUK,
        isTomorrow: callbackDateUK === tomorrowUK,
        isOverdue: isOverdue
      };
    });

    res.json({
      reminders: formattedReminders,
      // Debug info - remove after confirming fix
      _debug: {
        requestingUserId: req.user.id,
        requestingUserName: req.user.name,
        totalFound: formattedReminders.length
      }
    });
  } catch (error) {
    console.error('Error fetching upcoming callback reminders:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/leads/public
// @desc    Get leads for dashboard (temporary fix for authentication issue)
// @access  Public (temporary)
router.get('/public', async (req, res) => {
  try {
    const { date_booked_start, date_booked_end, limit, booked_at_start, booked_at_end, created_at_start, created_at_end, updated_at_start, updated_at_end, assigned_at_start, assigned_at_end } = req.query;

    console.log('📊 PUBLIC LEADS API: Dashboard requesting lead details');

    // Use Supabase directly for proper filtering
    let query = supabase.from('leads').select('*');

    // ✅ DAILY ACTIVITY FIX: Priority order - booked_at > assigned_at > created_at > updated_at > date_booked
    if (booked_at_start && booked_at_end) {
      query = query.gte('booked_at', booked_at_start).lte('booked_at', booked_at_end);
      console.log(`📅 Public leads filtering by booked_at: ${booked_at_start} to ${booked_at_end}`);
    } else if (assigned_at_start && assigned_at_end) {
      query = query.gte('assigned_at', assigned_at_start).lte('assigned_at', assigned_at_end);
      console.log(`📅 Public leads filtering by assigned_at: ${assigned_at_start} to ${assigned_at_end}`);
    } else if (created_at_start && created_at_end) {
      query = query.gte('created_at', created_at_start).lte('created_at', created_at_end);
      console.log(`📅 Public leads filtering by created_at: ${created_at_start} to ${created_at_end}`);
    } else if (updated_at_start && updated_at_end) {
      query = query.gte('updated_at', updated_at_start).lte('updated_at', updated_at_end);
      console.log(`📅 Public leads filtering by updated_at: ${updated_at_start} to ${updated_at_end}`);
    } else if (date_booked_start && date_booked_end) {
      query = query.gte('date_booked', date_booked_start).lte('date_booked', date_booked_end);
      console.log(`📅 Public leads filtering by date_booked: ${date_booked_start} to ${date_booked_end}`);
    }

    // Exclude ghost bookings
    query = query.neq('postcode', 'ZZGHOST');

    // Apply limit
    if (limit) {
      query = query.limit(parseInt(limit));
    } else {
      query = query.limit(1000); // Default limit
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('❌ Supabase query error:', error);
      throw error;
    }

    console.log(`📊 PUBLIC LEADS RESULT: Found ${leads?.length || 0} leads`);
    res.json({ leads: leads || [] });

  } catch (error) {
    console.error('❌ Public leads error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 
