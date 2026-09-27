import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FiCalendar, FiClock, FiMapPin, FiUser, FiX, FiPhone, FiMail,
  FiFileText, FiActivity, FiCheckCircle,
  FiExternalLink, FiCheck, FiSettings, FiEdit, FiEdit2, FiMessageSquare,
  FiChevronDown, FiChevronUp, FiChevronLeft, FiChevronRight, FiSearch, FiDownload, FiSend,
  FiImage, FiUpload, FiCamera, FiRefreshCw, FiTrash2
} from 'react-icons/fi';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SaleModal from '../components/SaleModal';
import PackageSelectionModal from '../components/PackageSelectionModal';
import InvoiceModal from '../components/InvoiceModal';
import SendContractModal from '../components/SendContractModal';
import PresentationGallery from '../components/PresentationGallery';
import ImageLightbox from '../components/ImageLightbox';
import LazyImage from '../components/LazyImage';
import OptimizedImage from '../components/OptimizedImage';
import { getOptimizedImageUrl, getCloudinaryUrl, getBlurPlaceholder } from '../utils/imageUtils';
import { getCurrentUKTime, toLocalDateStr } from '../utils/timeUtils';
import { decodeEmailContent, isEmailContentEncoded } from '../utils/emailContentDecoder';
import GmailEmailRenderer from '../components/GmailEmailRenderer';
import CalendarMessageModal from '../components/CalendarMessageModal';
import SlotCalendar from '../components/SlotCalendar';
import WeeklySlotCalendar from '../components/WeeklySlotCalendar';
import MonthlySlotCalendar from '../components/MonthlySlotCalendar';

const Calendar = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [eventsUpdateKey, setEventsUpdateKey] = useState(0); // Force SlotCalendar re-render on status change
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [showNotes, setShowNotes] = useState(false); // Collapsible notes section (default collapsed)
  const [replyChannel, setReplyChannel] = useState('sms'); // 'sms' or 'email' toggle for quick reply
  const [showMessageHistory, setShowMessageHistory] = useState(false); // Collapsible message history
  // Toggle to expand additional quick status actions
  const [showMoreStatuses, setShowMoreStatuses] = useState(false);
  // Message modal state (popup for SMS/Email conversation)
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageModalChannel, setMessageModalChannel] = useState('sms');
  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDate, setReviewDate] = useState('');
  const [reviewTime, setReviewTime] = useState('');
  const [reviewAvailableSlots, setReviewAvailableSlots] = useState([]);
  const [reviewSlotsLoading, setReviewSlotsLoading] = useState(false);

  // Model stats editing state
  const [editingStats, setEditingStats] = useState(false);
  const [savingStats, setSavingStats] = useState(false);
  const [statsForm, setStatsForm] = useState({
    date_of_birth: '',
    height_inches: '',
    chest_inches: '',
    waist_inches: '',
    hips_inches: '',
    eye_color: '',
    hair_color: '',
    hair_length: ''
  });

  // All possible time slots
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

  // Calculate available slots when review date changes
  const calculateAvailableReviewSlots = useCallback(async (selectedDateStr) => {
    if (!selectedDateStr) {
      setReviewAvailableSlots([]);
      return;
    }

    setReviewSlotsLoading(true);

    try {
      // Fetch blocked slots for the selected date
      const blockedResponse = await axios.get('/api/blocked-slots', {
        params: {
          start_date: selectedDateStr,
          end_date: selectedDateStr
        }
      });
      const dateBlockedSlots = blockedResponse.data || [];

      // Get existing bookings for the selected date from events state
      const selectedDate = new Date(selectedDateStr);
      const bookedSlots = events.filter(event => {
        if (!event.date_booked) return false;
        if (event.isRescheduledAway) return false; // ghosts don't occupy a slot
        const eventDate = new Date(event.date_booked);
        return toLocalDateStr(eventDate) === selectedDateStr;
      });

      // Calculate available slots
      const available = [];

      ALL_TIME_SLOTS.forEach(slot => {
        // Check slot 1 availability
        const slot1Blocked = dateBlockedSlots.some(b =>
          (!b.time_slot || b.time_slot === slot.time) &&
          (!b.slot_number || parseInt(b.slot_number) === 1)
        );
        const slot1Booked = bookedSlots.some(e =>
          e.time_booked === slot.time && parseInt(e.booking_slot) === 1
        );

        // Check slot 2 availability
        const slot2Blocked = dateBlockedSlots.some(b =>
          (!b.time_slot || b.time_slot === slot.time) &&
          (!b.slot_number || parseInt(b.slot_number) === 2)
        );
        const slot2Booked = bookedSlots.some(e =>
          e.time_booked === slot.time && parseInt(e.booking_slot) === 2
        );

        // Check slot 3 availability
        const slot3Blocked = dateBlockedSlots.some(b =>
          (!b.time_slot || b.time_slot === slot.time) &&
          (!b.slot_number || parseInt(b.slot_number) === 3)
        );
        const slot3Booked = bookedSlots.some(e =>
          e.time_booked === slot.time && parseInt(e.booking_slot) === 3
        );

        // Check slot 4 availability
        const slot4Blocked = dateBlockedSlots.some(b =>
          (!b.time_slot || b.time_slot === slot.time) &&
          (!b.slot_number || parseInt(b.slot_number) === 4)
        );
        const slot4Booked = bookedSlots.some(e =>
          e.time_booked === slot.time && parseInt(e.booking_slot) === 4
        );

        // If any slot is available, add to available list
        if (!slot1Blocked && !slot1Booked) {
          available.push({ time: slot.time, slot: 1, label: `${slot.label} - Slot 1` });
        }
        if (!slot2Blocked && !slot2Booked) {
          available.push({ time: slot.time, slot: 2, label: `${slot.label} - Slot 2` });
        }
        if (!slot3Blocked && !slot3Booked) {
          available.push({ time: slot.time, slot: 3, label: `${slot.label} - Slot 3` });
        }
        if (!slot4Blocked && !slot4Booked) {
          available.push({ time: slot.time, slot: 4, label: `${slot.label} - Slot 4` });
        }
      });

      setReviewAvailableSlots(available);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      // Fallback to all slots if there's an error
      const fallback = [];
      ALL_TIME_SLOTS.forEach(slot => {
        fallback.push({ time: slot.time, slot: 1, label: `${slot.label} - Slot 1` });
        fallback.push({ time: slot.time, slot: 2, label: `${slot.label} - Slot 2` });
        fallback.push({ time: slot.time, slot: 3, label: `${slot.label} - Slot 3` });
        fallback.push({ time: slot.time, slot: 4, label: `${slot.label} - Slot 4` });
      });
      setReviewAvailableSlots(fallback);
    } finally {
      setReviewSlotsLoading(false);
    }
  }, [events]);
  
  // PERFORMANCE: Cache for loaded date ranges - Track which date ranges have been loaded
  // Use ref instead of state to prevent fetchEvents from being recreated
  const loadedRangesRef = useRef(new Set());
  const [loadedRanges, setLoadedRanges] = useState(new Set()); // Keep state for UI if needed, but use ref for logic

  const [showLeadFormModal, setShowLeadFormModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = getCurrentUKTime();
    return { dateStr: now.toISOString(), date: now };
  });
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const calendarRef = useRef(null);
  const bookingAlertShownRef = useRef(new Set()); // Track which booking leads have already shown the alert
  const isInitialLoadRef = useRef(true); // Track if this is initial page load to suppress blocked day alerts
  const lastFetchTimeRef = useRef(0); // Use ref for lastFetchTime to prevent recreation
  const fetchEventsRef = useRef(null); // Ref to fetchEvents function for use in callbacks
  const { socket, subscribeToCalendarUpdates, subscribeToLeadUpdates, isConnected, emitCalendarUpdate } = useSocket();
  const [leadForm, setLeadForm] = useState({
    _id: '',
    name: '',
    phone: '',
    email: '',
    postcode: '',
    status: 'New',
    notes: '',
    image_url: '',
    isReschedule: false,
    booking_slot: 1,
    time_booked: ''
  });
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractLead, setContractLead] = useState(null);
  const [contractInvoiceData, setContractInvoiceData] = useState(null);
  const [showPresentationGallery, setShowPresentationGallery] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [imageSelectionMode, setImageSelectionMode] = useState(false); // true when selecting after package
  const [selectedSale, setSelectedSale] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [bookingTemplates, setBookingTemplates] = useState([]);

  // Secondary confirmation template state (only shown for direct calendar clicks)
  const [secondaryTemplateId, setSecondaryTemplateId] = useState(null);
  const [secondaryTemplates, setSecondaryTemplates] = useState([]);
  const [isDirectCalendarClick, setIsDirectCalendarClick] = useState(false);
  const [templateMode, setTemplateMode] = useState('primary'); // 'primary' or 'secondary'

  // Get currently selected template's settings
  const selectedTemplate = useMemo(() => {
    if (!selectedTemplateId || !bookingTemplates.length) return null;
    return bookingTemplates.find(t => t._id === selectedTemplateId) || bookingTemplates[0];
  }, [selectedTemplateId, bookingTemplates]);

  // Check if template supports email/sms
  const templateSupportsEmail = selectedTemplate?.sendEmail !== false;
  const templateSupportsSms = selectedTemplate?.sendSMS !== false;
  const [updatingNotes, setUpdatingNotes] = useState(false);
  const [isBookingInProgress, setIsBookingInProgress] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentView, setCurrentView] = useState(() => {
    // Persist calendar view across page refreshes
    const savedView = localStorage.getItem('calendarView');
    return savedView || 'monthly';
  }); // 'daily', 'weekly', or 'monthly' for slot calendar
  const [currentDate, setCurrentDate] = useState(() => {
    // Restore saved date if available, otherwise use current UK time
    const savedDate = localStorage.getItem('calendarDate');
    if (savedDate) {
      try {
        const parsed = new Date(savedDate);
        // Validate the date is reasonable (not too old or in the future)
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    return getCurrentUKTime();
  });
  const [selectedSlot, setSelectedSlot] = useState(1); // Track selected slot for booking
  const [selectedTime, setSelectedTime] = useState(''); // Track selected time for booking
  const [blockedSlots, setBlockedSlots] = useState([]); // Track blocked slots for calendar display
  
  // Available time slots matching the calendar (10:00 - 16:30, every 30 minutes)
  const AVAILABLE_TIMES = [
    '10:00', '10:30',
    '11:00', '11:30',
    '12:00', '12:30',
    '13:00', '13:30',
    '14:00', '14:30',
    '15:00', '15:30',
    '16:00', '16:30'
  ];

  // Reject lead modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('Duplicate');
  const [rejecting, setRejecting] = useState(false);
  
  // Image lightbox state
  const [lightboxImage, setLightboxImage] = useState(null);

  // Photos state for calendar modal
  const [leadPhotos, setLeadPhotos] = useState([]);
  const [totalPhotoCount, setTotalPhotoCount] = useState(0); // Total count for "View Gallery" button
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [hasMorePhotos, setHasMorePhotos] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMorePhotos, setLoadingMorePhotos] = useState(false);
  const currentPhotoFetchLeadIdRef = useRef(null); // Track current fetch to prevent race conditions

  // Photographer upload state
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDetails, setUploadDetails] = useState({ current: 0, total: 0, currentFileName: '' });
  const [dragActive, setDragActive] = useState(false);
  const uploadInputRef = useRef(null);

  // Photo folder organization
  const [selectedUploadFolder, setSelectedUploadFolder] = useState(null);
  const [galleryFolderFilter, setGalleryFolderFilter] = useState('all');

  // Photo folder options
  const PHOTO_FOLDERS = [
    { id: 'headshots', label: 'Headshots', icon: '👤' },
    { id: 'zcard', label: 'Z-Card', icon: '📇' },
    { id: 'best-pics', label: 'Best Pics', icon: '⭐' }
  ];

  // Memoize fetchEvents to prevent unnecessary re-renders
  const [isFetching, setIsFetching] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const fetchTimeoutRef = useRef(null);

  // Helper function to close event modal and clear URL param
  const closeEventModal = useCallback(() => {
    setShowEventModal(false);
    setSearchParams({}, { replace: true });
    // Reset photo-related state to prevent cross-lead data mixing
    setSelectedPhotoIds([]);
    setSelectedPhotos([]);
    setLeadPhotos([]);
    setTotalPhotoCount(0);
    // Refresh calendar data when modal closes to ensure colors are up to date
    setTimeout(() => {
      if (fetchEventsRef.current) {
        fetchEventsRef.current(true);
      }
    }, 100);
  }, [setSearchParams]);

  const getEventColor = useCallback((status, hasSale, isConfirmed = false, isDoubleConfirmed = false) => {
    // Special case: If lead has a sale and status is 'Attended', show as blue (Complete)
    if (hasSale && status?.toLowerCase() === 'attended') {
      return '#2563eb'; // bright blue for complete status
    }

    if (hasSale) return '#2563eb'; // bright blue for leads with a sale

    // VIBRANT STATUS COLORS
    switch (status?.toLowerCase()) {
      case 'new':
        return '#f97316'; // vibrant orange
      case 'unconfirmed':
        return '#fb923c'; // bright orange for unconfirmed
      case 'double confirmed':
        return '#15803d'; // vivid dark green for double confirmed
      case 'confirmed':
        return '#22c55e'; // bright green for confirmed
      case 'unassigned':
        return '#6b7280'; // gray for unassigned booked leads
      case 'booked':
        return '#3b82f6'; // bright blue for booked leads
      case 'arrived':
        return '#2563eb'; // vivid blue for arrived
      case 'left':
        return '#1f2937'; // dark gray/black for left
      case 'on show':
        return '#f59e0b'; // bright amber
      case 'no sale':
        return '#b91c1c'; // vivid dark red for no sale
      case 'attended':
        return '#2563eb'; // bright blue for attended status
      case 'complete':
        return '#2563eb'; // bright blue for complete status
      case 'cancelled':
        return '#f43f5e'; // bright rose for cancelled
      case 'no show':
        return '#ef4444'; // bright red for no show
      case 'review':
        return '#8b5cf6'; // vivid purple for review
      case 'assigned':
        return '#8b5cf6'; // vivid purple
      case 'contacted':
        return '#06b6d4'; // bright cyan
      case 'interested':
        return '#10b981'; // bright emerald
      case 'not interested':
        return '#ef4444'; // bright red
      case 'callback':
        return '#8b5cf6'; // vivid purple
      case 'rescheduled':
        return '#f97316'; // vibrant orange
      case 'reschedule':
        return '#f97316'; // vibrant orange
      default:
        return '#6b7280'; // gray for unknown statuses
    }
  }, []); // Empty dependency array since this function is pure
  
  // Fetch blocked slots for the current date range
  const fetchBlockedSlots = useCallback(async () => {
    try {
      // Calculate date range based on current view
      let startDate, endDate;
      
      if (currentView === 'daily') {
        // For daily view, fetch blocked slots for the current date
        const dateStr = toLocalDateStr(currentDate);
        startDate = dateStr;
        endDate = dateStr;
      } else if (currentView === 'weekly') {
        // For weekly view, fetch blocked slots for the week
        const weekStart = new Date(currentDate);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        weekStart.setDate(diff);
        startDate = toLocalDateStr(weekStart);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        endDate = toLocalDateStr(weekEnd);
      } else {
        // For monthly view, fetch blocked slots for the current month
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        startDate = toLocalDateStr(monthStart);
        endDate = toLocalDateStr(monthEnd);
      }
      
      const response = await axios.get('/api/blocked-slots', {
        params: {
          start_date: startDate,
          end_date: endDate
        }
      });
      
      setBlockedSlots(response.data || []);
      console.log(`🔒 Fetched ${response.data?.length || 0} blocked slots for ${startDate} to ${endDate}`);
    } catch (error) {
      console.error('Error fetching blocked slots:', error);
      setBlockedSlots([]);
    }
  }, [currentDate, currentView]);
  
  // Memoize fetchEvents to prevent recreating it on every render
  const fetchEvents = useCallback(async (force = false) => {
    // If force refresh, clear the cache so we actually re-fetch.
    // NOTE: we intentionally do NOT clear events here — keeping the current events
    // on screen avoids a jarring blank flash; the fresh set atomically REPLACES them
    // when the fetch returns (see the force branch in setEvents below).
    if (force) {
      console.log('📅 Force refresh: Clearing calendar cache');
      loadedRangesRef.current = new Set();
      setLoadedRanges(new Set());
    }
    
    // Prevent multiple simultaneous calls
    if (isFetching && !force) {
      console.log('📅 Calendar: Fetch already in progress, skipping...');
      return;
    }
    
    // Increased debounce for better performance (minimum 3 seconds between fetches)
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 3000) {
      console.log('📅 Calendar: Fetch debounced, too soon since last fetch');
      return;
    }
    
    // Clear any pending fetch timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }
    
    // Set fetching state
    setIsFetching(true);
    lastFetchTimeRef.current = now; // Update ref instead of state
    
    try {
      console.log(`📅 Fetching calendar events...`);
      
      // FIX: Always fetch ALL bookings with a very wide date range (5 years back to 5 years forward)
      // This ensures ALL bookings are always visible at any time, like any standard calendar
      // OPTIMIZED: Wide range but with performance optimizations to prevent slowdown
      const now = new Date();
      const startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 5); // 5 years back
      startDate.setMonth(0); // January
      startDate.setDate(1); // 1st of month
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(now);
      endDate.setFullYear(endDate.getFullYear() + 5); // 5 years forward
      endDate.setMonth(11); // December
      endDate.setDate(31); // 31st of month
      endDate.setHours(23, 59, 59, 999);

      // Use a single "all bookings" key to ensure we only fetch once unless forced
      const rangeKey = 'ALL_BOOKINGS';
      
      // Check if all bookings were already loaded (unless force refresh)
      if (!force && loadedRangesRef.current.has(rangeKey)) {
        console.log('📅 All bookings already loaded, skipping fetch');
        setIsFetching(false);
        return;
      }

      const dateParams = `&start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
      console.log(`📅 Fetching ALL bookings from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()} (10 year range)`);

      // Use the new calendar endpoint with wide date range to get ALL bookings
      // Increased limit to 10000 to ensure we get all bookings
      const cacheBuster = force ? `?t=${Date.now()}${dateParams}&limit=10000` : `${dateParams}&limit=10000`;
      const response = await axios.get(`/api/leads/calendar${cacheBuster}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        timeout: 15000 // 15 second timeout (reduced from 30s)
      });

      const leads = response.data.leads || [];
      console.log(`📅 Received ${leads.length} leads from server`);
      
      // Debug logging
      if (leads.length === 0) {
        console.log('📅 No leads received from server. Full response:', response.data);
      } else {
        console.log('📅 Leads received:', leads.map(lead => ({
          name: lead.name,
          status: lead.status,
          date_booked: lead.date_booked,
          time_booked: lead.time_booked,
          booking_slot: lead.booking_slot
        })));
      }
      
      // Validate leads data
      const validLeads = leads.filter(lead => {
        // Comprehensive validation
        if (!lead) {
          console.warn('⚠️ Skipping null/undefined lead');
          return false;
        }
        
        if (!lead.id) {
          console.warn('⚠️ Lead missing ID:', lead);
          return false;
        }
        
        // Allow leads without booking dates - they'll be handled in the event mapping
        return true;
      });
      
      // Convert leads to calendar events - include both dated and undated booked leads
      // Debug: Check image_url presence in leads
      const leadsWithImages = validLeads.filter(l => l.image_url && l.image_url !== '');
      console.log(`📸 Calendar: ${leadsWithImages.length} out of ${validLeads.length} leads have image_url`);
      if (leadsWithImages.length > 0) {
        console.log('📸 Sample leads with images:', leadsWithImages.slice(0, 3).map(l => ({ name: l.name, image_url: l.image_url, hasImageUrl: !!l.image_url, imageUrlLength: l.image_url?.length })));
      }
      
      // Check if ALL leads have the image_url property (even if empty)
      const leadsWithImageUrlProperty = validLeads.filter(l => 'image_url' in l);
      console.log(`📸 Leads with image_url property: ${leadsWithImageUrlProperty.length}/${validLeads.length}`);
      
      const serverEvents = validLeads
        .filter(lead => {
          const hasBookingDate = lead.date_booked && lead.date_booked !== null && lead.date_booked !== 'null';
          const isBookedWithoutDate = lead.status === 'Booked' && !lead.date_booked;
          const isNotDeleted = !lead.deleted_at;
          const isNotCancelled = lead.status !== 'Cancelled' && lead.status !== 'Rejected';

          // Allow leads with booking dates OR leads with status "Booked" (even without dates)
          // Exclude cancelled and rejected leads from calendar
          return (hasBookingDate || isBookedWithoutDate) && isNotDeleted && isNotCancelled;
        })
        .map(lead => {
          // Parse the booking date more robustly
          let startDate;

          if (lead.date_booked && lead.date_booked !== null && lead.date_booked !== 'null') {
            // Lead has a booking date
            startDate = new Date(lead.date_booked);
            if (isNaN(startDate.getTime())) {
              console.warn(`Invalid date for lead ${lead.name}: ${lead.date_booked}`);
              return null;
            }
          } else if (lead.status === 'Booked') {
            // Lead is booked but no date set - use updated_at as booking date (when it was actually booked)
            if (lead.updated_at) {
              startDate = new Date(lead.updated_at);
            } else {
              // Fallback to today's date if no updated_at
              startDate = new Date();
              startDate.setHours(9, 0, 0, 0); // Set to 9 AM today
            }
          } else {
            // Should not happen due to filter, but just in case
            return null;
          }
          
          // Create end date (default to 15 minutes after start)
          const endDate = new Date(startDate);
          endDate.setMinutes(endDate.getMinutes() + 30);
          
          // Parse booking history for SMS notification icon
          let bookingHistory = lead.booking_history || [];
          
          // Ensure bookingHistory is always an array
          if (!Array.isArray(bookingHistory)) {
            try {
              bookingHistory = typeof bookingHistory === 'string' ? JSON.parse(bookingHistory) : [];
            } catch (e) {
              console.warn('Failed to parse bookingHistory:', e);
              bookingHistory = [];
            }
          }
          
          // Determine display status - prioritize booking_status, then confirmation status, then regular status
          let displayStatus;
          const hasBookingDate = lead.date_booked && lead.date_booked !== null && lead.date_booked !== 'null';

          if (lead.booking_status) {
            displayStatus = lead.booking_status; // Reschedule, Arrived, Left, No Show, No Sale
          } else if (lead.status === 'Booked') {
            if (!hasBookingDate && lead.updated_at) {
              displayStatus = 'Booked'; // Booked with actual booking date (updated_at)
            } else if (!hasBookingDate) {
              displayStatus = 'Unassigned'; // Booked but no date info
            } else {
              displayStatus = lead.is_confirmed ? 'Confirmed' : 'Unconfirmed';
            }
          } else {
            displayStatus = lead.status;
          }
          
          // Determine if double confirmed
          const isDoubleConfirmed = lead.is_double_confirmed || false;

          // Update display status if double confirmed
          if (isDoubleConfirmed && displayStatus === 'Confirmed') {
            displayStatus = 'Double Confirmed';
          }

          // PERFORMANCE: Simplified title construction
          const event = {
            id: lead.id,
            title: `${lead.name} - ${displayStatus || lead.status}`,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            allDay: false,
            backgroundColor: getEventColor(displayStatus, lead.hasSale, lead.is_confirmed, isDoubleConfirmed),
            borderColor: getEventColor(displayStatus, lead.hasSale, lead.is_confirmed, isDoubleConfirmed),
            // Add flat fields for slot calendar components
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            date_booked: lead.date_booked,
            time_booked: lead.time_booked,
            booking_slot: lead.booking_slot,
            is_confirmed: lead.is_confirmed,
            is_double_confirmed: isDoubleConfirmed,
            booking_status: lead.booking_status,
            has_sale: lead.hasSale,
            hasUnreadSms: lead.has_unread_sms || false,
            hasUnreadEmail: lead.has_unread_email || false,
            hasReceivedSms: lead.has_received_sms || false,
            hasReceivedEmail: lead.has_received_email || false,
            extendedProps: {
              lead: {
                ...lead,
                bookingHistory: bookingHistory  // Use parsed array instead of string
              },
              phone: lead.phone,
              status: lead.status,
              displayStatus: displayStatus, // Store what status to display
              booker: lead.booker?.name || lead.booker_name || 'N/A',
              isConfirmed: lead.is_confirmed || false,
              isDoubleConfirmed: isDoubleConfirmed
            }
          };

          // If this booking has been sent to "Review" with a DIFFERENT review date,
          // grey out the ORIGINAL date (exactly like a reschedule) and let the separate
          // review event be the active appointment on the review date.
          if (lead.booking_status === 'Review' && lead.review_date) {
            const mainDay = lead.date_booked ? String(lead.date_booked).split('T')[0] : null;
            const reviewDay = String(lead.review_date).split('T')[0];
            if (mainDay && reviewDay && mainDay !== reviewDay) {
              event.isRescheduledAway = true;
              event.movedTo = lead.review_date;
              event.backgroundColor = '#d1d5db';
              event.borderColor = '#9ca3af';
              event.extendedProps.isRescheduledAway = true;
              event.extendedProps.movedTo = lead.review_date;
              event.extendedProps.displayStatus = 'Review (moved)';
            }
          }

          return event;
        })
        .filter(event => event !== null); // Remove any null events from invalid dates

      console.log(`📅 Calendar: Created ${serverEvents.length} server events`);
      
      // Debug: Log sample events to verify structure
      if (serverEvents.length > 0) {
        console.log('📅 Sample event structure:', {
          id: serverEvents[0].id,
          name: serverEvents[0].name,
          date_booked: serverEvents[0].date_booked,
          time_booked: serverEvents[0].time_booked,
          booking_slot: serverEvents[0].booking_slot,
          start: serverEvents[0].start
        });
      }

      // Prevent duplicate events by using a Set to track unique event IDs
      const uniqueEventIds = new Set();
      const finalEvents = serverEvents.filter(event => {
        if (uniqueEventIds.has(event.id)) {
          console.warn(`📅 Duplicate event found for lead: ${event.title}`);
          return false;
        }
        uniqueEventIds.add(event.id);
        return true;
      });

      console.log(`📅 Calendar: Final events array has ${finalEvents.length} unique events`);

      // GHOST EVENTS: when a booking is rescheduled, the original slot is vacated.
      // We render a greyed "rescheduled away" marker on the original date/slot so it's
      // visible that a booking used to be there (and where it moved to). These ghosts do
      // NOT occupy the slot — the slot stays bookable.
      const ghostEvents = [];
      validLeads.forEach(lead => {
        let history = lead.booking_history || [];
        if (!Array.isArray(history)) {
          try { history = typeof history === 'string' ? JSON.parse(history) : []; }
          catch (e) { history = []; }
        }
        const currentDay = lead.date_booked ? new Date(lead.date_booked).toDateString() : null;
        const seenGhostDays = new Set();
        history.forEach(entry => {
          if (entry.action !== 'RESCHEDULE') return;
          const oldDate = entry.details?.oldDate;
          if (!oldDate) return;
          const oldStart = new Date(oldDate);
          if (isNaN(oldStart.getTime())) return;
          const oldDay = oldStart.toDateString();
          // Skip if the original date is the current (active) booking date, or already ghosted
          if (oldDay === currentDay || seenGhostDays.has(oldDay)) return;
          seenGhostDays.add(oldDay);

          const movedTo = entry.details?.newDate || lead.date_booked;
          const oldTime = entry.details?.oldTimeBooked
            || `${String(oldStart.getHours()).padStart(2, '0')}:${String(oldStart.getMinutes()).padStart(2, '0')}`;
          const oldSlot = entry.details?.oldBookingSlot || 1;

          ghostEvents.push({
            id: `ghost-${lead.id}-${oldStart.getTime()}`,
            title: `${lead.name} — rescheduled`,
            start: oldStart.toISOString(),
            end: new Date(oldStart.getTime() + 30 * 60000).toISOString(),
            allDay: false,
            backgroundColor: '#d1d5db',
            borderColor: '#9ca3af',
            isRescheduledAway: true,
            movedTo,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            date_booked: oldDate,
            time_booked: oldTime,
            booking_slot: oldSlot,
            booking_status: 'Reschedule',
            extendedProps: {
              lead: { ...lead },
              status: lead.status,
              displayStatus: 'Rescheduled away',
              isRescheduledAway: true,
              movedTo
            }
          });
        });
      });
      if (ghostEvents.length > 0) {
        console.log(`📅 Calendar: Created ${ghostEvents.length} rescheduled-away ghost markers`);
        finalEvents.push(...ghostEvents);
      }

      // REVIEW APPOINTMENTS: a "Review" books a SEPARATE follow-up appointment stored in
      // review_date/review_time/review_slot. The original booking stays on its own date;
      // here we surface the review as its own visible (purple) appointment on the new date.
      const reviewEvents = [];
      validLeads.forEach(lead => {
        if (!lead.review_date) return;
        // Only surface a review appointment while the lead is ACTUALLY in Review status.
        // (Some leads keep a stale review_date after moving to No Show/Complete/etc. —
        // those must not render phantom review events. This matches the greyed-original rule.)
        if (lead.booking_status !== 'Review') return;
        // Parse the review day (stored as YYYY-MM-DD or ISO) and time (HH:MM)
        const reviewDay = String(lead.review_date).split('T')[0];
        if (!reviewDay) return;
        const rTime = lead.review_time || '00:00';
        const rSlot = lead.review_slot || 1;

        // Skip if the review lands on the exact same day+time+slot as the main booking
        const mainDay = lead.date_booked ? String(lead.date_booked).split('T')[0] : null;
        if (mainDay === reviewDay && (lead.time_booked || '') === rTime && (lead.booking_slot || 1) === rSlot) {
          return;
        }

        const [rh, rm] = rTime.split(':');
        const reviewStart = new Date(`${reviewDay}T${String(rh || '0').padStart(2, '0')}:${String(rm || '0').padStart(2, '0')}:00`);
        if (isNaN(reviewStart.getTime())) return;

        reviewEvents.push({
          id: `review-${lead.id}`,
          title: `${lead.name} - Review`,
          start: reviewStart.toISOString(),
          end: new Date(reviewStart.getTime() + 30 * 60000).toISOString(),
          allDay: false,
          backgroundColor: '#8b5cf6',
          borderColor: '#7c3aed',
          isReviewAppointment: true,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          // Position the review event on the review date/slot
          date_booked: lead.review_date,
          time_booked: rTime,
          booking_slot: rSlot,
          booking_status: 'Review',
          has_sale: lead.has_sale,
          is_confirmed: lead.is_confirmed,
          hasUnreadSms: lead.has_unread_sms || false,
          hasUnreadEmail: lead.has_unread_email || false,
          hasReceivedSms: lead.has_received_sms || false,
          hasReceivedEmail: lead.has_received_email || false,
          extendedProps: {
            lead: { ...lead },
            phone: lead.phone,
            status: lead.status,
            displayStatus: 'Review',
            isReviewAppointment: true,
            booker: lead.booker?.name || lead.booker_name || 'N/A'
          }
        });
      });
      if (reviewEvents.length > 0) {
        console.log(`📅 Calendar: Created ${reviewEvents.length} review appointment events`);
        finalEvents.push(...reviewEvents);
      }

      // Mark all bookings as loaded - use ref to prevent recreation
      loadedRangesRef.current.add(rangeKey);
      setLoadedRanges(new Set(loadedRangesRef.current)); // Update state for UI if needed
      console.log(`📅 Marked all bookings as loaded (${finalEvents.length} events)`);

      // On a FORCE refresh, atomically REPLACE the events with the fresh full set.
      // This swaps in changes (moved bookings, new ghost/review markers, removals)
      // in a single render with no blank flash. Non-force fetches merge (add-only).
      setEvents(prevEvents => {
        if (force) {
          console.log(`📅 Force refresh: replacing with ${finalEvents.length} fresh events`);
          return finalEvents;
        }
        const existingIds = new Set(prevEvents.map(e => e.id));
        const newUniqueEvents = finalEvents.filter(e => !existingIds.has(e.id));
        const mergedEvents = [...prevEvents, ...newUniqueEvents];
        console.log(`📅 Merging ${newUniqueEvents.length} new events with ${prevEvents.length} existing events = ${mergedEvents.length} total events`);
        return mergedEvents;
      });

      // Check for highlighting after events are set (reduced timeout for performance)
      setTimeout(() => {
        checkForHighlighting(finalEvents);
      }, 50);
    } catch (error) {
      console.group('❌ Calendar Events Fetch Error');
      console.error('Detailed Error:', error);
      
      // Detailed error logging
      if (error.response) {
        // The request was made and the server responded with a status code
        console.error('Response Status:', error.response.status);
        console.error('Response Data:', error.response.data);
        console.error('Response Headers:', error.response.headers);
        
        // Specific error handling based on status
        switch (error.response.status) {
          case 401:
            console.error('Authentication failed. Token may be expired.');
            // Optionally trigger logout or token refresh
            break;
          case 403:
            console.error('Access denied. Check user permissions.');
            break;
          case 404:
            console.error('Calendar endpoint not found.');
            break;
          case 500:
            console.error('Server-side error occurred.');
            break;
          default:
            console.error(`Unexpected status code: ${error.response.status}`);
            break;
        }
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received:', error.request);
      } else {
        // Something happened in setting up the request
        console.error('Error setting up request:', error.message);
      }
      console.groupEnd();

      // Fallback error handling
      setEvents(prevEvents => {
        if (prevEvents.length === 0) {
          // Provide a helpful message or empty state
          console.warn('📅 No events could be loaded. Check your connection or permissions.');
          return [];
        }
        return prevEvents;
      });
    } finally {
      // Always reset fetching state
      setIsFetching(false);
    }
  }, [getEventColor, isFetching]); // Removed loadedRanges and lastFetchTime - using refs instead to prevent recreation loop

  // Fetch booking confirmation templates
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        console.log('📋 Fetching booking confirmation templates...');
        const response = await axios.get('/api/templates?type=booking_confirmation&isActive=true', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        console.log('📋 Templates response:', response.data);
        console.log('📋 Number of templates:', response.data?.length || 0);
        setBookingTemplates(response.data || []);
        // Set the first template as default if available
        if (response.data && response.data.length > 0) {
          setSelectedTemplateId(response.data[0]._id);
          console.log('📋 Default template selected:', response.data[0].name, response.data[0]._id);
        } else {
          console.warn('⚠️ No active booking confirmation templates found');
        }
      } catch (error) {
        console.error('❌ Error fetching booking templates:', error);
        setBookingTemplates([]);
      }
    };
    fetchTemplates();
  }, []);

  // Fetch secondary confirmation templates
  useEffect(() => {
    const fetchSecondaryTemplates = async () => {
      try {
        const response = await axios.get('/api/templates?type=secondary_confirmation&isActive=true', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        setSecondaryTemplates(response.data || []);
      } catch (error) {
        console.error('Error fetching secondary templates:', error);
        setSecondaryTemplates([]);
      }
    };
    fetchSecondaryTemplates();
  }, []);

  // Track if we've already opened modal from current URL eventId (prevents double-open on close)
  const modalOpenedFromUrlRef = useRef(false);

  // Handle URL query params for modal state (enables browser back button to return to modal)
  useEffect(() => {
    const eventId = searchParams.get('eventId');

    // Reset ref when eventId is removed from URL
    if (!eventId) {
      modalOpenedFromUrlRef.current = false;
      return;
    }

    // Only open modal from URL if we haven't already opened it for this eventId
    if (eventId && events.length > 0 && !modalOpenedFromUrlRef.current) {
      const event = events.find(e => e.id === eventId);
      if (event) {
        setSelectedEvent(event);
        setShowEventModal(true);
        modalOpenedFromUrlRef.current = true;
      } else {
        // Event not found, clean up the URL
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, events, setSearchParams]);

  // Use ref to track if initial fetch has been done to prevent loops
  const initialFetchDoneRef = useRef(false);
  
  // Use useEffect WITHOUT fetchEvents as dependency to prevent loops
  useEffect(() => {
    // Only run initial fetch once
    if (initialFetchDoneRef.current) return;
    
    // PERFORMANCE: Single initial fetch after mount
    const initialFetch = setTimeout(() => {
      console.log('📅 Initial calendar data fetch');
      fetchEvents(true); // Force first fetch
      initialFetchDoneRef.current = true;
    }, 100); // Small delay to let calendar render first
    
    // Check if there's lead data from the leads page
    const bookingLead = localStorage.getItem('bookingLead');
    if (bookingLead) {
      // Coming from Leads page - don't show secondary template dropdown
      setIsDirectCalendarClick(false);
      try {
        const leadData = JSON.parse(bookingLead);
        const leadId = leadData.id;
        
        // Only show alert if we haven't shown it for this lead yet
        if (!bookingAlertShownRef.current.has(leadId)) {
          console.log('📊 Loading booking data from localStorage:', leadData);
          setLeadForm({
            _id: leadId, // Preserve the lead ID
            name: leadData.name || '',
            phone: leadData.phone || '',
            email: leadData.email || '',
            postcode: leadData.postcode || '',
            status: 'Booked', // Set status to Booked when coming from leads page
            notes: leadData.notes || '',
            image_url: leadData.image_url || '',
            isReschedule: leadData.isReschedule || false,
            original_booker_id: leadData.booker_id || null
          });
          console.log('📊 Set leadForm with ID:', leadId);
          
          // Mark this lead as having shown the alert
          bookingAlertShownRef.current.add(leadId);
          
          // Clear the localStorage data immediately to prevent re-triggering
          localStorage.removeItem('bookingLead');
          
          // Show a contextual notification based on current status (only once)
          setTimeout(() => {
            const action = leadData.isReschedule ? 'reschedule' : (leadData.currentStatus?.toLowerCase() === 'booked' ? 'reschedule' : 'book');
            const message = `Lead data for ${leadData.name} has been loaded. Click on a time slot to ${action} the appointment.`;
            alert(message);
          }, 500);
        } else {
          // Lead data already processed, just load it without showing alert
          setLeadForm({
            _id: leadId,
            name: leadData.name || '',
            phone: leadData.phone || '',
            email: leadData.email || '',
            postcode: leadData.postcode || '',
            status: 'Booked',
            notes: leadData.notes || '',
            image_url: leadData.image_url || '',
            isReschedule: leadData.isReschedule || false,
            original_booker_id: leadData.booker_id || null
          });
          localStorage.removeItem('bookingLead');
        }
      } catch (error) {
        console.error('Error parsing lead data:', error);
        localStorage.removeItem('bookingLead');
      }
    }

    // Check if there's a refresh trigger from LeadDetail
    const refreshTrigger = localStorage.getItem('calendarRefreshTrigger');
    if (refreshTrigger) {
      console.log('📅 Calendar: Refresh trigger detected, refreshing events');
      fetchEvents();
      localStorage.removeItem('calendarRefreshTrigger');
    }
    
    // Cleanup
    return () => {
      clearTimeout(initialFetch);
    };
  }, []); // Empty dependency array - only run once on mount

  // Fetch blocked slots when date or view changes
  useEffect(() => {
    fetchBlockedSlots();
  }, [currentDate, currentView, fetchBlockedSlots]);

  // Prevent viewing blocked days in daily view
  useEffect(() => {
    if (currentView === 'daily' && blockedSlots.length > 0) {
      const dateStr = toLocalDateStr(currentDate);
      const isDayBlocked = blockedSlots.some(block => {
        const blockDateStr = toLocalDateStr(new Date(block.date));
        // Full day block: date matches AND no time_slot AND no slot_number
        return blockDateStr === dateStr && !block.time_slot && !block.slot_number;
      });

      if (isDayBlocked) {
        // On initial load, silently switch to monthly without alert
        // This handles the case where user refreshed while daily view was saved but day is now blocked
        if (!isInitialLoadRef.current) {
          alert('This day is blocked and cannot be viewed');
        }
        setCurrentView('monthly'); // Switch back to monthly view
      }
    }
    // Mark initial load as complete after first check
    if (isInitialLoadRef.current && blockedSlots.length > 0) {
      isInitialLoadRef.current = false;
    }
  }, [currentView, currentDate, blockedSlots]);

  // Persist calendar view and date to localStorage when they change
  useEffect(() => {
    localStorage.setItem('calendarView', currentView);
    // Also save the current date so daily/weekly views restore to the right date
    localStorage.setItem('calendarDate', currentDate.toISOString());
  }, [currentView, currentDate]);

  // Consolidated real-time updates with proper debouncing
  // Update ref to store fetchEvents to avoid dependency issues
  useEffect(() => {
    fetchEventsRef.current = fetchEvents;
  }, [fetchEvents]);
  
  useEffect(() => {
    let refreshTimeout = null;
    let pollingInterval = null;
    let unsubscribeCalendar = null;
    let unsubscribeLeads = null;
    
    const debouncedFetch = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      refreshTimeout = setTimeout(() => {
        fetchEventsRef.current(); // Use ref to avoid dependency
      }, 5000); // Increased to 5 seconds for better performance
    };
    
    // Setup subscriptions
    if (subscribeToCalendarUpdates) {
      unsubscribeCalendar = subscribeToCalendarUpdates((update) => {
        console.log('📅 Calendar: Real-time calendar update received', update);
        setLastUpdated(new Date());
        
        // Handle status changes instantly without full fetch
        if (update.data?.type === 'status_changed' && update.data?.event) {
          const updatedEventData = update.data.event;
          const updatedLead = update.data.lead;
          
          // Update the specific event immediately
          setEvents(prevEvents => {
            return prevEvents.map(event => {
              if (event.id === updatedEventData.id || (updatedLead && event.extendedProps?.lead?.id === updatedLead.id)) {
                // Merge the updated event data
                return {
                  ...event,
                  ...updatedEventData,
                  extendedProps: {
                    ...event.extendedProps,
                    ...updatedEventData.extendedProps,
                    lead: updatedLead || event.extendedProps.lead
                  }
                };
              }
              return event;
            });
          });
          
          // Update selectedEvent if it's the one being changed
          setSelectedEvent(prev => {
            if (prev && (prev.id === updatedEventData.id || (updatedLead && prev.extendedProps?.lead?.id === updatedLead.id))) {
              return {
                ...prev,
                ...updatedEventData,
                extendedProps: {
                  ...prev.extendedProps,
                  ...updatedEventData.extendedProps,
                  lead: updatedLead || prev.extendedProps.lead
                }
              };
            }
            return prev;
          });
          
          console.log('📅 Calendar: Status updated in real-time');
        } else if (update.data?.type === 'status_changed' && update.data?.event === null) {
          // Handle cancellation - remove event
          const cancelledLead = update.data.lead;
          if (cancelledLead) {
            setEvents(prevEvents => prevEvents.filter(event =>
              event.id !== cancelledLead.id && event.extendedProps?.lead?.id !== cancelledLead.id
            ));
            setSelectedEvent(prev => {
              if (prev && (prev.id === cancelledLead.id || prev.extendedProps?.lead?.id === cancelledLead.id)) {
                closeEventModal();
                return null;
              }
              return prev;
            });
            console.log('📅 Calendar: Event cancelled in real-time');
          }
        } else {
          // For other updates, use debounced fetch
          debouncedFetch();
        }
      });
    }

    if (subscribeToLeadUpdates) {
      unsubscribeLeads = subscribeToLeadUpdates((update) => {
        console.log('📅 Calendar: Real-time lead update received', update);
        setLastUpdated(new Date());
        
        // Update calendar events when leads change - but be smarter about it
        switch (update.type) {
          case 'LEAD_CREATED':
          case 'LEAD_DELETED':
            console.log('📅 Calendar: Refreshing events due to', update.type);
            debouncedFetch(); // Use debounced fetch
            break;
          case 'LEAD_UPDATED':
            // For status updates, only refresh if the lead has a booking date
            const lead = update.data?.lead;
            if (lead && lead.date_booked) {
              console.log('📅 Calendar: Refreshing events due to booking-related update');
              debouncedFetch(); // Use debounced fetch
            }
            break;
          case 'LEAD_ASSIGNED':
          case 'NOTES_UPDATED':
          case 'messages_read':
            // These don't typically affect calendar visibility, so skip refresh
            console.log('📅 Calendar: Skipping refresh for', update.type);
            break;
          default:
            break;
        }
      });
    }
    
    // Reduced polling frequency to prevent overloading
    pollingInterval = setInterval(() => {
      debouncedFetch(); // Use debounced fetch
    }, 300000); // Poll every 5 minutes - increased from 2 min to prevent DB overload

    return () => {
      // Clean up subscriptions
      if (unsubscribeCalendar) {
        unsubscribeCalendar();
      }
      if (unsubscribeLeads) {
        unsubscribeLeads();
      }
      
      // Clean up intervals and timeouts
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  }, [subscribeToCalendarUpdates, subscribeToLeadUpdates, closeEventModal]); // Removed fetchEvents - using ref instead

  // Create a debounced fetch function that can be used throughout the component
  const debouncedFetchEvents = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchEvents();
    }, 3000); // Increased to 3 seconds for better performance
  }, [fetchEvents]);

  // Realtime: update open calendar modal conversation instantly on inbound SMS
  useEffect(() => {
    if (!socket) return;
    const handleSmsReceived = (data) => {
      try {
        if (!data || !data.leadId) return;

        // Update unread + received flags on the events list for calendar badge
        const isEmail = data.channel === 'email' || data.type === 'EMAIL_RECEIVED';
        setEvents(prev => prev.map(evt => {
          if (evt.id === data.leadId) {
            return isEmail
              ? { ...evt, hasUnreadEmail: true, hasReceivedEmail: true }
              : { ...evt, hasUnreadSms: true, hasReceivedSms: true };
          }
          return evt;
        }));
        setEventsUpdateKey(prev => prev + 1);

        if (!selectedEvent) return;
        const openLeadId = selectedEvent.extendedProps?.lead?.id;
        if (openLeadId && data.leadId === openLeadId) {
          const existing = selectedEvent.extendedProps.lead.bookingHistory || selectedEvent.extendedProps.lead.booking_history || [];
          const actionType = isEmail ? 'EMAIL_RECEIVED' : 'SMS_RECEIVED';
          // Avoid duplicates by timestamp/content
          const dup = existing.some((e) => {
            try {
              return (
                e && (e.action === 'SMS_RECEIVED' || e.action === 'EMAIL_RECEIVED') &&
                (e.details?.body || e.details?.message) === data.content &&
                new Date(e.timestamp).getTime() === new Date(data.timestamp).getTime()
              );
            } catch { return false; }
          });
          if (!dup) {
            const newEntry = {
              action: actionType,
              timestamp: data.timestamp,
              details: {
                body: data.content,
                subject: data.subject || '',
                sender: data.phone || data.email,
                direction: 'received',
                channel: isEmail ? 'email' : 'sms',
                status: 'received',
                read: false
              }
            };
            const updatedHistory = [...existing, newEntry];
            const updatedLead = {
              ...selectedEvent.extendedProps.lead,
              bookingHistory: updatedHistory
            };
            // Update snapshot in place so modal stays open and live-updates
            setSelectedEvent(prev => prev ? ({
              ...prev,
              ...(isEmail ? { hasUnreadEmail: true } : { hasUnreadSms: true }),
              extendedProps: { ...prev.extendedProps, lead: updatedLead }
            }) : prev);
          }
        }
      } catch {}
    };
    // Handle message sent notifications (booking confirmations)
    const handleMessageSent = (data) => {
      console.log('📧 ========== MESSAGE SENT NOTIFICATION ==========');
      console.log('📧 Status:', data.status);
      console.log('📧 Type:', data.type);
      console.log('📧 Lead ID:', data.leadId);
      console.log('📧 Channels:', data.channels);
      if (data.status === 'success') {
        console.log('📧 Email Account:', data.emailAccountName);
        console.log('📧 Email Account Key:', data.emailAccount);
        console.log('📧 SMS Provider:', data.smsProvider);
      } else {
        console.log('📧 Error:', data.error);
      }
      console.log('📧 ==============================================');

      if (data.status === 'success') {
        // Show success notification with details
        const details = [];
        if (data.channels.email) {
          details.push(`Email via ${data.emailAccountName || 'email'}`);
        }
        if (data.channels.sms) {
          details.push(`SMS via ${data.smsProvider || 'SMS'}`);
        }

        const message = `✅ ${data.message || 'Booking confirmation sent: ' + details.join(' and ')}`;
        alert(message);
      } else if (data.status === 'error') {
        // Show error notification
        alert(`❌ ${data.message || 'Failed to send booking confirmation'}`);
      }
    };

    // Listen for both event names to ensure compatibility
    socket.on('sms_received', handleSmsReceived);
    socket.on('message_received', handleSmsReceived);
    socket.on('message_sent', handleMessageSent);

    return () => {
      socket.off('sms_received', handleSmsReceived);
      socket.off('message_received', handleSmsReceived);
      socket.off('message_sent', handleMessageSent);
    };
  }, [socket, selectedEvent]);

  // Fetch messages from messages table when modal opens (booking_history not in calendar API)
  // Also marks messages as read on the server side and clears unread flags locally
  useEffect(() => {
    if (!showEventModal || !selectedEvent) return;
    const leadId = selectedEvent.extendedProps?.lead?.id || selectedEvent.id;
    if (!leadId) return;

    const fetchMessages = async () => {
      try {
        const resp = await axios.get(`/api/leads/${leadId}/messages`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
          timeout: 5000
        });
        const history = resp.data?.messages || [];

        // Clear unread flags (server marks read_status=true, so update local state to match)
        // Keep hasReceived* = true so the static icon still shows
        setSelectedEvent(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            hasUnreadSms: false,
            hasUnreadEmail: false,
            extendedProps: {
              ...prev.extendedProps,
              lead: {
                ...prev.extendedProps.lead,
                bookingHistory: history.length > 0 ? history : (prev.extendedProps?.lead?.bookingHistory || [])
              }
            }
          };
        });

        // Also update the events array so the calendar slot icon changes from flashing to static
        setEvents(prev => prev.map(evt => {
          if (evt.id === leadId) {
            return { ...evt, hasUnreadSms: false, hasUnreadEmail: false };
          }
          return evt;
        }));

        // Auto-select reply channel based on what the lead has
        const lead = selectedEvent?.extendedProps?.lead;
        if (lead?.phone) setReplyChannel('sms');
        else if (lead?.email) setReplyChannel('email');
      } catch (e) {
        // Silently fail - messages just won't show
      }
    };
    fetchMessages();
  }, [showEventModal, selectedEvent?.id]);

  // Fetch photos for a lead with pagination (optimized for modals)
  const fetchLeadPhotos = useCallback(async (leadId, reset = true, cursor = null, folderPath = null) => {
    if (!leadId) {
      setLeadPhotos([]);
      setTotalPhotoCount(0);
      return;
    }

    // Allow admin, viewer, and photographer roles to see photos
    if (user?.role !== 'admin' && user?.role !== 'viewer' && user?.role !== 'photographer') {
      return;
    }

    // Track which lead we're fetching for (prevents race conditions)
    currentPhotoFetchLeadIdRef.current = leadId;

    if (reset) {
      setLoadingPhotos(true);
    } else {
      setLoadingMorePhotos(true);
    }

    try {
      // Build params object - only include folderPath if filtering by specific folder
      const photosParams = {
        leadId,
        limit: 20, // Smaller initial load for faster modal opening
        cursor: cursor || undefined,
        fields: 'minimal' // Only fetch needed fields
      };

      // Only add folderPath filter if not 'all'
      if (folderPath && folderPath !== 'all') {
        photosParams.folderPath = folderPath;
      }

      const countParams = { leadId };
      if (folderPath && folderPath !== 'all') {
        countParams.folderPath = folderPath;
      }

      // Fetch photos and total count in parallel
      const [photosResponse, countResponse] = await Promise.all([
        axios.get('/api/photos', { params: photosParams }),
        // Only fetch count on initial load (reset=true)
        reset ? axios.get('/api/photos/count', { params: countParams }) : Promise.resolve(null)
      ]);

      // Check if this response is still relevant (prevents race conditions)
      if (currentPhotoFetchLeadIdRef.current !== leadId) {
        console.log('📸 Ignoring stale photo response for lead:', leadId);
        return;
      }

      if (photosResponse.data.success) {
        const newPhotos = photosResponse.data.photos || [];

        if (reset) {
          setLeadPhotos(newPhotos);
          // Update total count from count endpoint
          if (countResponse?.data?.count !== undefined) {
            setTotalPhotoCount(countResponse.data.count);
          }
        } else {
          setLeadPhotos(prev => [...prev, ...newPhotos]);
        }

        // Update pagination state
        setHasMorePhotos(photosResponse.data.hasMore || false);
        setNextCursor(photosResponse.data.nextCursor || null);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
      // Only update state if this is still the current fetch
      if (currentPhotoFetchLeadIdRef.current === leadId && reset) {
        setLeadPhotos([]);
        setTotalPhotoCount(0);
      }
    } finally {
      // Only update loading state if this is still the current fetch
      if (currentPhotoFetchLeadIdRef.current === leadId) {
        setLoadingPhotos(false);
        setLoadingMorePhotos(false);
      }
    }
  }, [user?.role]);

  // Load more photos for modal
  const loadMorePhotos = useCallback(() => {
    if (selectedEvent.extendedProps?.lead?.id && hasMorePhotos && !loadingMorePhotos && nextCursor) {
      fetchLeadPhotos(selectedEvent.extendedProps.lead.id, false, nextCursor, galleryFolderFilter);
    }
  }, [selectedEvent, hasMorePhotos, loadingMorePhotos, nextCursor, fetchLeadPhotos, galleryFolderFilter]);

  // Handle photo upload for photographers
  const handlePhotoUpload = async (files) => {
    if (!files || files.length === 0) return;
    if (!selectedEvent?.extendedProps?.lead?.id) {
      alert('No lead selected for photo upload');
      return;
    }
    if (!selectedUploadFolder) {
      alert('Please select a folder first');
      return;
    }

    const leadId = selectedEvent.extendedProps.lead.id;
    const fileArray = Array.from(files);
    const totalFiles = fileArray.length;

    setUploading(true);
    setUploadProgress(0);
    setUploadDetails({ current: 0, total: totalFiles, currentFileName: '' });

    let uploadedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];

      // Update current file info
      setUploadDetails({
        current: i + 1,
        total: totalFiles,
        currentFileName: file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name
      });

      try {
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('leadId', leadId);
        formData.append('folderPath', selectedUploadFolder);

        // Don't set Content-Type - let axios set it with boundary
        await axios.post('/api/photos/upload', formData);

        uploadedCount++;
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        failedCount++;
      }

      // Update progress
      setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
    }

    setUploading(false);
    setUploadProgress(0);
    setUploadDetails({ current: 0, total: 0, currentFileName: '' });
    setShowUploadPanel(false);
    setSelectedUploadFolder(null); // Reset folder selection for next upload

    // Refresh photos (reset pagination) with current filter
    fetchLeadPhotos(leadId, true, null, galleryFolderFilter);

    // Show result notification
    if (failedCount > 0) {
      alert(`Uploaded ${uploadedCount} of ${totalFiles} photos. ${failedCount} failed.`);
    } else if (uploadedCount > 0) {
      alert(`Successfully uploaded ${uploadedCount} photo${uploadedCount > 1 ? 's' : ''}!`);
    }
  };

  // Drag and drop handlers for photo upload
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handlePhotoUpload(e.dataTransfer.files);
    }
  };

  // Delete photo handler
  const handleDeletePhoto = async (photoId, e) => {
    e.stopPropagation(); // Prevent opening lightbox when clicking delete

    if (!window.confirm('Are you sure you want to delete this photo? This cannot be undone.')) {
      return;
    }

    try {
      const response = await axios.delete(`/api/photos/${photoId}`);

      if (response.data.success) {
        // Remove photo from local state
        setLeadPhotos(prev => prev.filter(p => p.id !== photoId));
        setTotalPhotoCount(prev => Math.max(0, prev - 1));
      } else {
        alert('Failed to delete photo: ' + (response.data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Error deleting photo: ' + (error.response?.data?.message || error.message));
    }
  };

  // Fetch photos when event modal opens (reset pagination)
  useEffect(() => {
    if (showEventModal && selectedEvent?.extendedProps?.lead?.id) {
      // Reset pagination and folder filter state when modal opens
      setHasMorePhotos(false);
      setNextCursor(null);
      setGalleryFolderFilter('all'); // Reset to show all photos
      setSelectedUploadFolder(null); // Reset upload folder selection
      fetchLeadPhotos(selectedEvent.extendedProps.lead.id, true, null, 'all');
    } else {
      setLeadPhotos([]);
      setTotalPhotoCount(0);
      setHasMorePhotos(false);
      setNextCursor(null);
      setGalleryFolderFilter('all');
    }
  }, [showEventModal, selectedEvent, fetchLeadPhotos]);

  // Re-fetch photos when folder filter changes
  useEffect(() => {
    if (showEventModal && selectedEvent?.extendedProps?.lead?.id) {
      setHasMorePhotos(false);
      setNextCursor(null);
      fetchLeadPhotos(selectedEvent.extendedProps.lead.id, true, null, galleryFolderFilter);
    }
  }, [galleryFolderFilter]); // Only trigger on filter change, not on other deps

  const checkForHighlighting = (eventsToCheck) => {
    // Check if there's a booking to highlight from Daily Diary
    const highlightBooking = localStorage.getItem('highlightBooking');
    if (highlightBooking) {
      try {
        const bookingData = JSON.parse(highlightBooking);
        
        // Find the target event
        const targetEvent = eventsToCheck.find(event => 
          event.id === bookingData.leadId || 
          event.extendedProps?.lead?.name === bookingData.leadName
        );
        
        // Navigate to the specific date and highlight the booking
        setTimeout(() => {
          const calendarApi = calendarRef.current?.getApi();
          if (calendarApi) {
            // Navigate to the booking date
            calendarApi.gotoDate(bookingData.date);
            
            if (targetEvent) {
              // Show event details
              setTimeout(() => {
                setSelectedEvent(targetEvent);
                setShowEventModal(true);
              }, 500);
            }
          }
          
          // Show notification
          alert(`Navigated to ${bookingData.leadName}'s booking on ${new Date(bookingData.date).toLocaleDateString()}`);
        }, 1000);
        
        // Clear the localStorage data
        localStorage.removeItem('highlightBooking');
      } catch (error) {
        console.error('Error parsing highlight booking data:', error);
        localStorage.removeItem('highlightBooking');
      }
    }
  };


  const getStatusBadgeClass = (status) => {
    switch (status?.toLowerCase()) {
      case 'new':
        return 'status-badge status-new';
      case 'confirmed':
        return 'status-badge status-booked';
      case 'booked':
        return 'status-badge status-booked';
      case 'attended':
        return 'status-badge status-attended';
      case 'complete':
        return 'status-badge status-attended';
      case 'cancelled':
        return 'status-badge status-cancelled';
      case 'no show':
        return 'status-badge status-cancelled';
      case 'reschedule':
        return 'status-badge status-reschedule';
      default:
        return 'status-badge status-new';
    }
  };

  // Create a stable snapshot of a FullCalendar EventApi to avoid losing
  // references when the calendar re-renders on live updates (e.g. new SMS)
  const createEventSnapshot = (eventApi) => {
    if (!eventApi) return null;
    return {
      id: eventApi.id,
      title: eventApi.title,
      start: eventApi.start ? new Date(eventApi.start) : null,
      end: eventApi.end ? new Date(eventApi.end) : null,
      allDay: !!eventApi.allDay,
      backgroundColor: eventApi.backgroundColor,
      borderColor: eventApi.borderColor,
      extendedProps: {
        ...(eventApi.extendedProps || {})
      }
    };
  };

  // Removed unused handleEventClick and handleDateTimeClick functions



  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setLeadForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSaveBooking = async () => {
    if (isBookingInProgress) {
      console.log('📊 Booking already in progress, ignoring duplicate request');
      return;
    }

    if (!leadForm.name || !leadForm.phone) {
      alert('Please fill in required fields (Name and Phone)');
      return;
    }

    console.log('📅 ========== SAVE BOOKING START ==========');
    console.log('📅 Lead Form:', leadForm);
    console.log('📅 Is Reschedule:', leadForm.isReschedule);
    console.log('📅 Send Email:', sendEmail);
    console.log('📅 Send SMS:', sendSms);
    console.log('📅 Selected Template ID:', selectedTemplateId);
    console.log('📅 Available Templates:', bookingTemplates.map(t => ({ id: t._id, name: t.name })));
    console.log('📅 ========================================');

    setIsBookingInProgress(true);

    // Use the clicked time directly from selectedDate, but ensure we're working with local time
    const selectedDateTime = selectedDate.date || new Date(selectedDate.dateStr);
    const endDateTime = new Date(selectedDateTime);
    endDateTime.setMinutes(endDateTime.getMinutes() + 30); // 30-minute booking slots to match calendar intervals
    
    // TIMEZONE FIX: Preserve exact local time without UTC conversion
    const year = selectedDateTime.getFullYear();
    const month = selectedDateTime.getMonth();
    const date = selectedDateTime.getDate();
    const hours = selectedDateTime.getHours();
    const minutes = selectedDateTime.getMinutes();
    
    // Create a new date with the same local time components
    const localDateTime = new Date(year, month, date, hours, minutes, 0, 0);
    const localEndDateTime = new Date(year, month, date, hours, minutes + 30, 0, 0);
    
    // Store just the date portion (YYYY-MM-DD) - no timezone suffix needed
    // The time is stored separately in time_booked
    const localDateStr = toLocalDateStr(localDateTime);
    
    // Debug logging to show the time handling
    console.log('🕐 Time Debug:', {
      originalSelectedDate: selectedDate,
      selectedDateTime: selectedDateTime.toISOString(),
      selectedDateTimeLocal: selectedDateTime.toLocaleString(),
      selectedDateTimeUTC: selectedDateTime.toUTCString(),
      localDateTime: localDateTime.toISOString(),
      localDateTimeLocal: localDateTime.toLocaleString(),
      endDateTime: endDateTime.toISOString(),
      endDateTimeLocal: endDateTime.toLocaleString(),
      timezoneOffset: selectedDateTime.getTimezoneOffset(),
      hour: selectedDateTime.getHours(),
      minute: selectedDateTime.getMinutes(),
      localHour: localDateTime.getHours(),
      localMinute: localDateTime.getMinutes()
    });
    
    // Create a temporary event ID to track this booking
    const tempEventId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Get current user from localStorage or context
      const currentUser = JSON.parse(localStorage.getItem('user')) || {};
      
              // Debug logging to understand the booking flow
        console.log('📊 Booking Debug Info:', {
          leadFormId: leadForm._id,
          leadFormIdType: typeof leadForm._id,
          leadFormIdLength: leadForm._id ? leadForm._id.length : 0,
          isExistingLead: leadForm._id && leadForm._id !== '',
          leadForm: leadForm,
        selectedDateTime: localDateTime.toISOString()
      });
      
                    // PERSISTENCE FIX: Handle existing leads from lead details properly
      const { _id, ...leadDataWithoutId } = leadForm;
      const createData = {
        ...leadDataWithoutId,
        date_booked: localDateStr,
        time_booked: leadForm.time_booked || `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        booking_slot: leadForm.booking_slot || selectedSlot || 1,
        // Include the _id if we have one (from lead details page)
        ...((_id && _id !== '') ? { _id } : {}),
        status: 'Booked',
        is_confirmed: leadForm.isReschedule ? 0 : 0, // Reset to unconfirmed (0) when rescheduling, 0 for new bookings
        booker: leadForm.isReschedule && leadForm.original_booker_id
        ? leadForm.original_booker_id
        : (currentUser._id || currentUser.id || '507f1f77bcf86cd799439012'),
        // Add reschedule fields if this is a reschedule
        ...(leadForm.isReschedule && {
          booking_status: 'Reschedule', // Set to new Reschedule status to indicate rescheduling
          rescheduleReason: `Appointment rescheduled via calendar to ${localDateTime.toLocaleString()}`
        })
      };
      
      console.log('📊 Creating/updating lead with data:', {
        hasExistingId: !!_id,
        finalData: createData
      });
      
      console.log('📤 Sending booking request with:', {
        ...createData,
        sendEmail,
        sendSms,
        templateId: selectedTemplateId
      });

      const response = await axios.post('/api/leads', {
        ...createData,
        sendEmail,
        sendSms,
        templateId: selectedTemplateId,
        secondaryTemplateId: isDirectCalendarClick ? secondaryTemplateId : null
      });

      console.log('✅ Booking API response:', response.data);

      if (response.data.success || response.data.lead || response.data) {
        const leadResult = response.data.lead || response.data;
        
        // Check if this was an existing lead that was updated
        const isExistingLead = response.data.isExistingLead || false;
        
        // Create the final calendar event with the real lead ID
        // Use same display logic as fetchEvents - show "Unconfirmed" for new bookings, "Confirmed" only when manually changed
        const displayStatus = leadResult.is_confirmed ? 'Confirmed' : 'Unconfirmed';
        const newEvent = {
          id: leadResult.id || tempEventId,
          name: leadForm.name,
          title: `${leadForm.name} - ${displayStatus}`,
          phone: leadForm.phone,
          email: leadForm.email,
          date_booked: leadResult.date_booked || localDateStr,
          time_booked: leadResult.time_booked || leadForm.time_booked,
          booking_slot: leadResult.booking_slot || leadForm.booking_slot || 1,
          status: 'Booked',
          is_confirmed: leadResult.is_confirmed || false,
          booking_status: leadResult.booking_status,
          has_sale: leadResult.has_sale || leadResult.hasSale || 0,
          image_url: leadResult.image_url,
          notes: leadResult.notes,
          postcode: leadResult.postcode,
          start: localDateTime,
          end: localEndDateTime,
          backgroundColor: getEventColor(displayStatus, leadResult.hasSale, leadResult.is_confirmed),
          borderColor: getEventColor(displayStatus, leadResult.hasSale, leadResult.is_confirmed),
          extendedProps: {
            lead: {
              ...leadResult,
              bookingHistory: Array.isArray(leadResult.bookingHistory) ? leadResult.bookingHistory : (leadResult.booking_history || [])
            },
            phone: leadForm.phone,
            status: 'Booked',
            displayStatus: displayStatus,
            booker: currentUser.name || 'Current User',
            isConfirmed: leadResult.is_confirmed || false
          }
        };
        
        // Update events array properly - remove temp event if exists and add real event
        setEvents(prevEvents => {
          const filteredEvents = prevEvents.filter(event => event.id !== tempEventId);
          // If it's an existing lead, also remove any duplicate events with the same lead ID
          const finalEvents = isExistingLead 
            ? filteredEvents.filter(event => event.id !== leadResult.id)
            : filteredEvents;
          return [...finalEvents, newEvent];
        });
        
        // Emit real-time update to other clients
        emitCalendarUpdate({
          type: 'booking_created',
          lead: leadResult,
          event: newEvent,
          timestamp: new Date()
        });
        
        const message = isExistingLead 
          ? `✅ Appointment updated successfully for ${leadForm.name}!`
          : `✅ Appointment booked successfully for ${leadForm.name}!`;
        alert(message);

        // No direct SMS send here; backend handles according to sendEmail/sendSms flags
        
        // Log the action for debugging
        console.log(`📅 Booking action: ${isExistingLead ? 'Updated existing lead' : 'Created new lead'} for ${leadForm.name}`);
        
        // Force refresh calendar events to ensure consistency with server.
        // Must be a FORCE refresh (clears the ALL_BOOKINGS cache) so the refetch
        // re-reads booking_history and regenerates the "rescheduled away" ghost marker
        // on the original date. A non-force fetch early-returns and the ghost never shows.
        // Near-instant: the server has already committed the booking/reschedule before
        // it responded, so a short delay is enough to feel immediate.
        setTimeout(() => {
          console.log('📅 Force-refreshing calendar after booking to ensure consistency');
          fetchEvents(true);
        }, 300);
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      console.error('Error details:', {
        status: error.response?.status,
        message: error.response?.data?.message,
        data: error.response?.data,
        formData: leadForm
      });
      
      // Check if this is a validation error or server error
      if (error.response && error.response.status === 400) {
        alert(`❌ Booking failed: ${error.response.data.message || 'Invalid data provided'}`);
        return; // Don't create local event for validation errors
      }
      
      if (error.response && error.response.status === 401) {
        alert(`❌ Authentication required. Please log in again.`);
        return;
      }
      
      if (error.response && error.response.status === 403) {
        alert(`❌ Access denied. You don't have permission to create bookings.`);
        return;
      }
      
      // For server/network errors, create local event as fallback
      const fallbackEvent = {
        id: tempEventId,
        title: `${leadForm.name} - Booked (Pending)`,
        start: localDateTime,
        end: localEndDateTime,
        backgroundColor: '#FFA500', // Orange for pending
        borderColor: '#FFA500',
        extendedProps: {
          lead: leadForm,
          phone: leadForm.phone,
          status: 'Booked',
          booker: 'Current User',
          isPending: true // Mark as pending confirmation
        }
      };
      
      setEvents(prevEvents => [...prevEvents, fallbackEvent]);
      
      // Show appropriate message
      if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
        alert(`📱 Booking saved locally for ${leadForm.name}. Will sync when connection is restored.`);
      } else {
        alert(`⚠️ Booking created locally for ${leadForm.name}. Please check your connection.`);
      }
      
      // Try to sync pending bookings after a delay
      setTimeout(() => {
        retryPendingBookings();
      }, 5000);
    } finally {
      setIsBookingInProgress(false);
    }

    // Reset form and close modal
    setLeadForm({
      _id: '',
      name: '',
      phone: '',
      email: '',
      postcode: '',
      status: 'New',
      notes: '',
      image_url: ''
    });
    setShowLeadFormModal(false);
    setIsBookingInProgress(false);
    setSecondaryTemplateId(null);
    setIsDirectCalendarClick(false);

    // Refresh calendar events to show the updated booking
    setTimeout(() => {
      fetchEvents();
    }, 500);
  };

  // Function to retry pending bookings
  const retryPendingBookings = async () => {
    const pendingEvents = events.filter(event => event.extendedProps?.isPending);
    
    for (const event of pendingEvents) {
      try {
        const leadData = {
          ...event.extendedProps.lead,
          date_booked: event.start.toISOString(),
          status: 'Booked'
        };
        
        const response = await axios.post('/api/leads', leadData);
        
        if (response.data.success || response.data.lead) {
          const leadResult = response.data.lead || response.data;
          
          // Update the event to confirmed status
          setEvents(prevEvents => 
            prevEvents.map(evt => 
              evt.id === event.id 
                ? {
                    ...evt,
                    id: leadResult.id,
                    title: evt.title.replace(' (Pending)', ''),
                    backgroundColor: getEventColor('Booked', leadResult.hasSale),
                    borderColor: getEventColor('Booked', leadResult.hasSale),
                    extendedProps: {
                      ...evt.extendedProps,
                      lead: leadResult,
                      isPending: false,
                      isConfirmed: true
                    }
                  }
                : evt
            )
          );
        }
      } catch (error) {
        console.log(`Failed to sync pending booking for ${event.extendedProps.lead.name}`);
      }
    }
  };

  const formatEventTime = (event) => {
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : start;
    
    return `${start.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })} - ${end.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })}`;
  };

  const handleResendWelcomePack = async () => {
    if (!selectedEvent || !selectedEvent.extendedProps?.lead) {
      alert('No lead data available for this event.');
      return;
    }

    const leadId = selectedEvent.extendedProps.lead.id || selectedEvent.id;
    const leadName = selectedEvent.extendedProps.lead.name || selectedEvent.title.split(' - ')[0];

    if (!leadId) {
      alert('Unable to identify lead ID.');
      return;
    }

    // Confirm action
    if (!window.confirm(`Resend welcome pack to ${leadName}?\n\nThis will send the booking confirmation email and SMS using the selected template.`)) {
      return;
    }

    try {
      const response = await axios.post(`/api/leads/${leadId}/resend-welcome-pack`, {
        templateId: selectedTemplateId || (bookingTemplates.length > 0 ? bookingTemplates[0]._id : null)
      });

      if (response.data.success) {
        const channels = [];
        if (response.data.emailSent) channels.push('Email');
        if (response.data.smsSent) channels.push('SMS');
        
        alert(`✅ Welcome pack resent successfully via ${channels.join(' and ')}!`);
        
        // Refresh events to update booking history
        setTimeout(() => {
          fetchEvents();
        }, 1000);
      } else {
        alert(`❌ Failed to resend welcome pack: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error resending welcome pack:', error);
      alert(`❌ Error resending welcome pack: ${error.response?.data?.message || error.message || 'Unknown error'}`);
    }
  };

  const handleSendSecondaryTemplate = async () => {
    if (!selectedEvent || !selectedEvent.extendedProps?.lead) {
      alert('No lead data available for this event.');
      return;
    }

    if (!secondaryTemplateId) {
      alert('Please select a template first.');
      return;
    }

    const leadId = selectedEvent.extendedProps.lead.id || selectedEvent.id;
    const leadName = selectedEvent.extendedProps.lead.name || selectedEvent.title.split(' - ')[0];

    // Get the template name for the success message
    const selectedTemplateName = secondaryTemplates.find(t => t._id === secondaryTemplateId)?.name || 'Template';

    if (!leadId) {
      alert('Unable to identify lead ID.');
      return;
    }

    // Confirm action
    if (!window.confirm(`Send "${selectedTemplateName}" to ${leadName}?`)) {
      return;
    }

    try {
      const response = await axios.post(`/api/leads/${leadId}/resend-welcome-pack`, {
        templateId: secondaryTemplateId
      });

      if (response.data.success) {
        const channels = [];
        if (response.data.emailSent) channels.push('Email');
        if (response.data.smsSent) channels.push('SMS');

        alert(`✅ "${selectedTemplateName}" sent successfully via ${channels.join(' and ')}!`);

        // Refresh events to update booking history
        setTimeout(() => {
          fetchEvents();
        }, 1000);
      } else {
        alert(`❌ Failed to send template: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending template:', error);
      alert(`❌ Error sending template: ${error.response?.data?.message || error.message || 'Unknown error'}`);
    }
  };

  const handleEventStatusChange = async (newStatus) => {
    if (!selectedEvent || !selectedEvent.extendedProps?.lead) {
      alert('No lead data available for this event.');
      return;
    }

    // ROLE-BASED ACCESS CONTROL for booking status changes
    // Only admin, booker, and viewer can change booking status
    if (!(user?.role === 'admin' || user?.role === 'booker' || user?.role === 'viewer')) {
      alert('Access denied. You do not have permission to change booking status.');
      return;
    }

    // For bookers: can change Confirmed/Unconfirmed/Cancelled on any booking, but other statuses only on their assigned leads
    if (user?.role === 'booker') {
      const isConfirmationChange = newStatus === 'Confirmed' || newStatus === 'Unconfirmed';
      const isCancellationChange = newStatus === 'Cancelled';
      const isAssignedLead = selectedEvent.extendedProps?.lead?.booker === user.id;
      
      if (!isConfirmationChange && !isCancellationChange && !isAssignedLead) {
        alert('Access denied. You can only change Confirmed/Unconfirmed/Cancelled status on any booking, or other statuses on leads assigned to you.');
        return;
      }
    }

    // Viewers have admin-level access for status changes (no restrictions)

    const leadName = selectedEvent.extendedProps.lead.name || selectedEvent.title.split(' - ')[0];
    const oldStatus = selectedEvent.extendedProps.status;
    
    // Special handling for cancellation
    if (newStatus === 'Cancelled') {
      const confirmationMessage = `Are you sure you want to cancel ${leadName}'s appointment?\n\n` +
        `This will:\n` +
        `• Remove the booking from the calendar\n` +
        `• Clear all booking information (date, time, slot)\n` +
        `• Move the lead status to "Cancelled"\n` +
        `• Save the booking details to history for tracking\n` +
        `• Allow the lead to be reassigned later\n\n` +
        `This action cannot be undone.`;

      if (!window.confirm(confirmationMessage)) {
        return;
      }
    } else if (newStatus === 'Confirmed') {
      if (!window.confirm(`Are you sure you want to confirm ${leadName}'s appointment?\n\nThis will mark the booking as confirmed but keep it on the calendar.`)) {
        return;
      }
    } else if (newStatus === 'Unconfirmed') {
      if (!window.confirm(`Set ${leadName}'s appointment to Unconfirmed?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Are you sure you want to change ${leadName}'s status to "${newStatus}"?`)) {
        return;
      }
    }

    // Store previous state for rollback if API call fails
    const previousEvent = { ...selectedEvent };
    const previousEvents = [...events];

    // Prepare update data
    // Exclude transient computed fields that don't exist in the database schema
    const { 
      has_received_email, has_received_sms, has_unread_email, has_unread_sms,
      hasReceivedEmail, hasReceivedSms, hasUnreadEmail, hasUnreadSms,
      ...leadData 
    } = selectedEvent.extendedProps.lead;
    
    let updateData = {
      ...leadData
    };

    // For cancellation, set status to Cancelled and clear all booking information
    if (newStatus === 'Cancelled') {
      updateData = {
        ...updateData,
        status: 'Cancelled',
        cancellation_reason: 'Appointment cancelled via calendar',
        // Clear all booking information - history will preserve these values
        date_booked: null,
        time_booked: null,
        booking_slot: null,
        is_confirmed: null,
        booking_status: null
      };
    } else if (newStatus === 'Double Confirmed') {
      updateData = {
        ...updateData,
        status: 'Booked',
        is_confirmed: 1,
        is_double_confirmed: 1,
        booking_status: null
      };
    } else if (newStatus === 'Confirmed') {
      updateData = {
        ...updateData,
        status: 'Booked',
        is_confirmed: 1,
        is_double_confirmed: 0,
        booking_status: null
      };
    } else if (newStatus === 'Unconfirmed') {
      updateData = {
        ...updateData,
        status: 'Booked',
        is_confirmed: 0,
        is_double_confirmed: 0,
        booking_status: null
      };
    } else if (newStatus === 'Reschedule' || newStatus === 'Arrived' || newStatus === 'Left' || newStatus === 'No Show' || newStatus === 'No Sale' || newStatus === 'Review') {
      updateData = {
        ...updateData,
        status: 'Booked',
        booking_status: newStatus,
        is_confirmed: newStatus === 'Reschedule' ? 0 : (newStatus === 'Review' ? updateData.is_confirmed : null)
      };
    } else {
      updateData = {
        ...updateData,
        status: newStatus,
        booking_status: null
      };
    }

    // OPTIMISTIC UPDATE: Update UI immediately
    if (newStatus === 'Cancelled') {
      // Remove the event from calendar immediately
      setEvents(prevEvents => prevEvents.filter(event => event.id !== selectedEvent.id));
      closeEventModal();

      // Emit real-time update IMMEDIATELY
      emitCalendarUpdate({
        type: 'status_changed',
        lead: { ...selectedEvent.extendedProps.lead, ...updateData },
        event: null,
        oldStatus: oldStatus,
        newStatus: 'Cancelled',
        timestamp: new Date()
      });
    } else {
      // Create updated event for optimistic update
      const eventTitle = newStatus === 'Double Confirmed'
        ? `${leadName} - Booked (Double Confirmed)`
        : newStatus === 'Confirmed'
          ? `${leadName} - Booked (Confirmed)`
          : newStatus === 'Unconfirmed'
            ? `${leadName} - Booked (Unconfirmed)`
            : (newStatus === 'Reschedule' || newStatus === 'Arrived' || newStatus === 'Left' || newStatus === 'No Show' || newStatus === 'No Sale' || newStatus === 'Review')
              ? `${leadName} - ${newStatus}`
              : `${leadName} - ${newStatus}`;

      // Create optimistic lead update
      const optimisticLead = {
        ...selectedEvent.extendedProps.lead,
        ...updateData
      };

      // Determine new flat properties for SlotCalendar
      const newIsConfirmed = (newStatus === 'Confirmed' || newStatus === 'Double Confirmed') ? 1 : (newStatus === 'Unconfirmed' ? 0 : selectedEvent.is_confirmed);
      const newIsDoubleConfirmed = newStatus === 'Double Confirmed' ? 1 : 0;
      const newBookingStatus = (newStatus === 'Reschedule' || newStatus === 'Arrived' || newStatus === 'Left' || newStatus === 'No Show' || newStatus === 'No Sale' || newStatus === 'Review') ? newStatus : null;

      const updatedEvent = {
        ...selectedEvent,
        title: eventTitle,
        backgroundColor: getEventColor(
          newStatus,
          optimisticLead.hasSale,
          newStatus === 'Confirmed' || newStatus === 'Double Confirmed',
          newStatus === 'Double Confirmed'
        ),
        borderColor: getEventColor(
          newStatus,
          optimisticLead.hasSale,
          newStatus === 'Confirmed' || newStatus === 'Double Confirmed',
          newStatus === 'Double Confirmed'
        ),
        // FLAT PROPERTIES for SlotCalendar and MonthlySlotCalendar color updates
        is_confirmed: newIsConfirmed,
        is_double_confirmed: newIsDoubleConfirmed,
        booking_status: newBookingStatus,
        has_sale: optimisticLead.has_sale || selectedEvent.has_sale || false,
        name: optimisticLead.name || selectedEvent.name,
        time_booked: optimisticLead.time_booked || selectedEvent.time_booked,
        date_booked: optimisticLead.date_booked || selectedEvent.date_booked,
        booking_slot: optimisticLead.booking_slot || selectedEvent.booking_slot,
        extendedProps: {
          ...selectedEvent.extendedProps,
          status: (newStatus === 'Double Confirmed' || newStatus === 'Confirmed' || newStatus === 'Unconfirmed' || newStatus === 'Reschedule' || newStatus === 'Arrived' || newStatus === 'Left' || newStatus === 'No Show' || newStatus === 'No Sale' || newStatus === 'Review') ? 'Booked' : newStatus,
          displayStatus: newStatus,
          isConfirmed: (newStatus === 'Confirmed' || newStatus === 'Double Confirmed') ? true : (newStatus === 'Unconfirmed' ? false : selectedEvent.extendedProps?.isConfirmed || false),
          isDoubleConfirmed: newStatus === 'Double Confirmed',
          bookingStatus: newBookingStatus,
          lead: optimisticLead
        }
      };

      // Update UI immediately (optimistic update)
      setEvents(prevEvents => {
        const newEvents = prevEvents.map(event =>
          event.id === selectedEvent.id ? updatedEvent : event
        );
        return newEvents;
      });
      setSelectedEvent(updatedEvent);
      // Force SlotCalendar to re-render with new colors
      setEventsUpdateKey(prev => prev + 1);
      
      // Emit real-time update IMMEDIATELY (before API call)
      emitCalendarUpdate({
        type: 'status_changed',
        lead: optimisticLead,
        event: updatedEvent,
        oldStatus: oldStatus,
        newStatus: newStatus === 'Cancelled' ? 'Cancelled' : (newStatus === 'Confirmed' ? 'Booked' : newStatus),
        timestamp: new Date()
      });
    }

    // Make API call in background (non-blocking)
    (async () => {
      try {
        // Use the real lead id (selectedEvent.id may be a synthetic "review-<id>" event id)
        const targetLeadId = selectedEvent.extendedProps?.lead?.id || selectedEvent.id;
        const response = await axios.put(`/api/leads/${targetLeadId}`, updateData);

        if (response.data.success || response.data.lead) {
          const updatedLead = response.data.lead || response.data;
          
          // Update with server response (in case server made additional changes)
          if (newStatus !== 'Cancelled') {
            const eventTitle = newStatus === 'Confirmed'
              ? `${leadName} - Booked (Confirmed)`
              : newStatus === 'Unconfirmed'
                ? `${leadName} - Booked (Unconfirmed)`
                : (newStatus === 'Reschedule' || newStatus === 'Arrived' || newStatus === 'Left' || newStatus === 'No Show' || newStatus === 'No Sale')
                  ? `${leadName} - ${newStatus}`
                  : `${leadName} - ${newStatus}`;
            
            const finalEvent = {
              ...selectedEvent,
              title: eventTitle,
              backgroundColor: getEventColor(
                newStatus === 'Confirmed' ? 'Booked' : (newStatus === 'Unconfirmed' ? 'Unconfirmed' : newStatus),
                updatedLead.hasSale,
                newStatus === 'Confirmed'
              ),
              borderColor: getEventColor(
                newStatus === 'Confirmed' ? 'Booked' : (newStatus === 'Unconfirmed' ? 'Unconfirmed' : newStatus),
                updatedLead.hasSale,
                newStatus === 'Confirmed'
              ),
              // Explicit flat properties for SlotCalendar (ensures they're not lost from closure)
              date_booked: updatedLead.date_booked || selectedEvent.date_booked,
              time_booked: updatedLead.time_booked || selectedEvent.time_booked,
              booking_slot: updatedLead.booking_slot || selectedEvent.booking_slot,
              is_confirmed: updatedLead.is_confirmed,
              is_double_confirmed: updatedLead.is_double_confirmed || 0,
              booking_status: updatedLead.booking_status || null,
              name: updatedLead.name || selectedEvent.name,
              phone: updatedLead.phone || selectedEvent.phone,
              email: updatedLead.email || selectedEvent.email,
              extendedProps: {
                ...selectedEvent.extendedProps,
                status: (newStatus === 'Confirmed' || newStatus === 'Unconfirmed' || newStatus === 'Reschedule' || newStatus === 'Arrived' || newStatus === 'Left' || newStatus === 'No Show' || newStatus === 'No Sale') ? 'Booked' : newStatus,
                displayStatus: newStatus,
                isConfirmed: newStatus === 'Confirmed' ? true : (newStatus === 'Unconfirmed' ? false : (newStatus === 'Reschedule' || newStatus === 'Arrived' || newStatus === 'Left' || newStatus === 'No Show' || newStatus === 'No Sale') ? (newStatus === 'Reschedule' ? 0 : null) : selectedEvent.extendedProps?.isConfirmed || false),
                bookingStatus: (newStatus === 'Reschedule' || newStatus === 'Arrived' || newStatus === 'Left' || newStatus === 'No Show' || newStatus === 'No Sale') ? newStatus : undefined,
                lead: updatedLead
              }
            };
            
            setEvents(prevEvents => {
              const newEvents = prevEvents.map(event =>
                event.id === selectedEvent.id ? finalEvent : event
              );
              return newEvents;
            });
            setSelectedEvent(finalEvent);
            setEventsUpdateKey(prev => prev + 1); // Force calendar re-render with server data
          }

          // Emit diary update for synchronization
          // Diary stats tracking removed - endpoint not implemented
          
          // Real-time update already emitted above, just sync with server response
          // Background refresh to ensure sync (but don't override optimistic update)
          setTimeout(() => {
            debouncedFetchEvents();
          }, 2000);
        }
      } catch (error) {
        console.error('Error updating event status:', error);
        
        // ROLLBACK: Revert optimistic update on error
        setEvents(previousEvents);
        setSelectedEvent(previousEvent);
        setEventsUpdateKey(prev => prev + 1); // Force calendar re-render with reverted data
        
        // More detailed error reporting
        let errorMessage = 'Failed to update status. Changes have been reverted. Please try again.';
        if (error.response) {
          errorMessage = `Server error: ${error.response.data?.message || error.response.statusText}. Changes have been reverted.`;
        } else if (error.request) {
          errorMessage = 'Network error: Could not reach server. Changes have been reverted.';
        } else {
          errorMessage = `Error: ${error.message}. Changes have been reverted.`;
        }
        
        alert(errorMessage);
      }
    })();
  };

  const handleRejectLead = () => {
    if (!selectedEvent || !selectedEvent.extendedProps?.lead) {
      alert('No lead data available for this event.');
      return;
    }

    const leadName = selectedEvent.extendedProps.lead.name || selectedEvent.title.split(' - ')[0];
    
    if (!window.confirm(`Are you sure you want to reject ${leadName}?\n\nThis will:\n• Move the lead to "Rejected" status\n• Remove the booking from the calendar\n• This action cannot be undone.`)) {
      return;
    }

    setShowRejectModal(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedEvent?.id) return;
    
    setRejecting(true);
    try {
      const response = await axios.patch(`/api/leads/${selectedEvent.id}/reject`, { 
        reason: rejectReason 
      });
      
      if (response.data.success || response.data.lead) {
        const leadName = selectedEvent.extendedProps.lead.name || selectedEvent.title.split(' - ')[0];

        // Remove the event from calendar completely
        setEvents(prevEvents => prevEvents.filter(event => event.id !== selectedEvent.id));
        closeEventModal();
        setShowRejectModal(false);

        alert(`❌ Successfully rejected ${leadName}. The lead has been moved to "Rejected" status.`);
        
        // Force a delayed refresh to ensure server sync
        setTimeout(() => {
          debouncedFetchEvents();
        }, 1500);
      }
    } catch (error) {
      console.error('Error rejecting lead:', error);
      alert('Failed to reject lead. Please try again.');
    } finally {
      setRejecting(false);
    }
  };

  const handleRescheduleAppointment = () => {
    if (!selectedEvent || !selectedEvent.extendedProps?.lead) {
      alert('No lead data available for this event.');
      return;
    }

    const leadName = selectedEvent.extendedProps.lead.name || selectedEvent.title.split(' - ')[0];

    if (!window.confirm(`Are you sure you want to reschedule ${leadName}'s appointment?`)) {
      return;
    }

    console.log('📅 Starting reschedule for:', leadName);
    console.log('📅 Current template selected:', selectedTemplateId);
    console.log('📅 Available templates:', bookingTemplates.length);

    // Load the lead data into the form for rescheduling
    setLeadForm({
      _id: selectedEvent.extendedProps.lead.id,
      name: selectedEvent.extendedProps.lead.name || '',
      phone: selectedEvent.extendedProps.lead.phone || '',
      email: selectedEvent.extendedProps.lead.email || '',
      postcode: selectedEvent.extendedProps.lead.postcode || '',
      status: 'Booked', // Keep as booked for rescheduling
      notes: selectedEvent.extendedProps.lead.notes || '',
      image_url: selectedEvent.extendedProps.lead.image_url || '',
      isReschedule: true,
      original_booker_id: selectedEvent.extendedProps.lead.booker_id || null
    });

    // Close the event modal and open the booking form
    closeEventModal();
    setSendEmail(true);
    setSendSms(true);

    // Ensure a template is selected - use first template if none selected
    if (!selectedTemplateId && bookingTemplates.length > 0) {
      console.log('⚠️ No template selected, setting default template:', bookingTemplates[0].name);
      setSelectedTemplateId(bookingTemplates[0]._id);
    }

    setShowLeadFormModal(true);

    // Set the selected date to the current event date for easy rescheduling
    if (selectedEvent.start) {
      const dt = new Date(selectedEvent.start);
      setSelectedDate({ dateStr: dt.toISOString(), date: dt });
    }

    console.log('📅 Reschedule modal opened - Template ID:', selectedTemplateId || bookingTemplates[0]?._id);
  };

  // Navigation functions for day-specific booking browsing
  const getEventsForSelectedDay = () => {
    if (!selectedEvent?.start) return [];
    
    const selectedDate = new Date(selectedEvent.start);
    const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    
    return events.filter(event => {
      if (event.isRescheduledAway) return false; // skip ghost markers in booking navigation
      const eventDate = new Date(event.start);
      return eventDate >= dayStart && eventDate < dayEnd;
    }).sort((a, b) => new Date(a.start) - new Date(b.start));
  };

  const navigateToPreviousBooking = () => {
    const dayEvents = getEventsForSelectedDay();
    const currentIndex = dayEvents.findIndex(event => event.id === selectedEvent.id);
    
    if (currentIndex > 0) {
      const prevEvent = dayEvents[currentIndex - 1];
      console.log('📸 Navigating to previous event:', prevEvent.title, 'Image URL:', prevEvent.extendedProps?.lead?.image_url);
      setSelectedEvent(createEventSnapshot(prevEvent));
    }
  };

  const navigateToNextBooking = () => {
    const dayEvents = getEventsForSelectedDay();
    const currentIndex = dayEvents.findIndex(event => event.id === selectedEvent.id);
    
    if (currentIndex < dayEvents.length - 1) {
      const nextEvent = dayEvents[currentIndex + 1];
      console.log('📸 Navigating to next event:', nextEvent.title, 'Image URL:', nextEvent.extendedProps?.lead?.image_url);
      setSelectedEvent(createEventSnapshot(nextEvent));
    }
  };

  const getNavigationState = () => {
    const dayEvents = getEventsForSelectedDay();
    const currentIndex = dayEvents.findIndex(event => event.id === selectedEvent.id);
    
    return {
      canGoPrevious: currentIndex > 0,
      canGoNext: currentIndex < dayEvents.length - 1,
      currentIndex: currentIndex + 1,
      totalEvents: dayEvents.length
    };
  };

  const handleEditNotes = () => {
    const currentNotes = selectedEvent.extendedProps?.lead?.notes || '';
    setNotesText(currentNotes);
    setShowNotes(true); // Expand notes section when editing
    setEditingNotes(true);
  };

  const handleSaveNotes = async () => {
    if (!selectedEvent?.id) return;
    
    const currentNotes = selectedEvent.extendedProps?.lead?.notes || '';
    const newNotes = notesText.trim();
    
    // Don't save if notes haven't changed
    if (currentNotes === newNotes) {
      setEditingNotes(false);
      return;
    }
    
    setUpdatingNotes(true);
    try {
      const response = await axios.patch(`/api/leads/${selectedEvent.id}/notes`, {
        notes: newNotes,
        oldNotes: currentNotes
      });
      
      // Update the event with new notes
      setEvents(prevEvents => 
        prevEvents.map(event => 
          event.id === selectedEvent.id 
            ? {
                ...event,
                extendedProps: {
                  ...event.extendedProps,
                  lead: {
                    ...event.extendedProps.lead,
                    notes: newNotes
                  }
                }
              }
            : event
        )
      );
      
      // Update selectedEvent
      setSelectedEvent(prev => ({
        ...prev,
        extendedProps: {
          ...prev.extendedProps,
          lead: {
            ...prev.extendedProps.lead,
            notes: newNotes
          }
        }
      }));
      
      setEditingNotes(false);
      
      // Show success message with details
      const changeType = currentNotes ? 'modified' : 'added';
      alert(`Notes ${changeType} successfully by ${response.data.updatedBy}!`);
      
    } catch (error) {
      console.error('Error updating notes:', error);
      if (error.response?.status === 403) {
        alert('Access denied. You may not have permission to edit this lead.');
      } else {
        alert('Failed to update notes. Please try again.');
      }
    } finally {
      setUpdatingNotes(false);
    }
  };

  const handleCancelNotes = () => {
    setEditingNotes(false);
    setNotesText('');
  };

  // Populate stats form when selectedEvent changes
  useEffect(() => {
    if (selectedEvent?.extendedProps?.lead) {
      const lead = selectedEvent.extendedProps.lead;
      setStatsForm({
        date_of_birth: lead.date_of_birth ? lead.date_of_birth.split('T')[0] : '',
        height_inches: lead.height_inches || '',
        chest_inches: lead.chest_inches || '',
        waist_inches: lead.waist_inches || '',
        hips_inches: lead.hips_inches || '',
        eye_color: lead.eye_color || '',
        hair_color: lead.hair_color || '',
        hair_length: lead.hair_length || ''
      });
      setEditingStats(false); // Reset to display mode when switching events
    }
  }, [selectedEvent]);

  // Handle saving model stats
  const handleSaveStats = async () => {
    if (!selectedEvent?.id) return;

    setSavingStats(true);
    try {
      const response = await axios.put(`/api/leads/${selectedEvent.id}`, {
        date_of_birth: statsForm.date_of_birth || null,
        height_inches: statsForm.height_inches ? parseInt(statsForm.height_inches) : null,
        chest_inches: statsForm.chest_inches ? parseInt(statsForm.chest_inches) : null,
        waist_inches: statsForm.waist_inches ? parseInt(statsForm.waist_inches) : null,
        hips_inches: statsForm.hips_inches ? parseInt(statsForm.hips_inches) : null,
        eye_color: statsForm.eye_color || null,
        hair_color: statsForm.hair_color || null,
        hair_length: statsForm.hair_length || null
      });

      if (response.data.success || response.data.lead) {
        // Update the event with new stats
        const updatedLead = response.data.lead || response.data;
        setEvents(prevEvents =>
          prevEvents.map(event =>
            event.id === selectedEvent.id
              ? {
                  ...event,
                  extendedProps: {
                    ...event.extendedProps,
                    lead: {
                      ...event.extendedProps.lead,
                      date_of_birth: statsForm.date_of_birth,
                      height_inches: statsForm.height_inches,
                      chest_inches: statsForm.chest_inches,
                      waist_inches: statsForm.waist_inches,
                      hips_inches: statsForm.hips_inches,
                      eye_color: statsForm.eye_color,
                      hair_color: statsForm.hair_color,
                      hair_length: statsForm.hair_length
                    }
                  }
                }
              : event
          )
        );

        // Update selectedEvent as well
        setSelectedEvent(prev => prev ? ({
          ...prev,
          extendedProps: {
            ...prev.extendedProps,
            lead: {
              ...prev.extendedProps.lead,
              date_of_birth: statsForm.date_of_birth,
              height_inches: statsForm.height_inches,
              chest_inches: statsForm.chest_inches,
              waist_inches: statsForm.waist_inches,
              hips_inches: statsForm.hips_inches,
              eye_color: statsForm.eye_color,
              hair_color: statsForm.hair_color,
              hair_length: statsForm.hair_length
            }
          }
        }) : null);

        setEditingStats(false);
        alert('Model stats saved successfully!');
      }
    } catch (error) {
      console.error('Error saving stats:', error);
      alert('Failed to save stats. Please try again.');
    } finally {
      setSavingStats(false);
    }
  };

  const getBookingPreview = () => {
    if (!selectedDate) return null;
    
    const selectedDateTime = selectedDate.date;
    const endDateTime = new Date(selectedDateTime);
    endDateTime.setHours(endDateTime.getHours() + 1); // 1-hour slots
    
    return {
      date: selectedDateTime.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
      time: `${selectedDateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })} - ${endDateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })}`
    };
  };

  // Helper function to check if a lead has messages needing a reply
  // const hasRepliedMessages = (leadId) => {
  //   try {
  //     console.log(`🕵️ DEBUGGING Lead ID: ${leadId}`);
      
  //     // Find the lead in events
  //     const lead = events.find(event => 
  //       event.leadId === leadId || 
  //       event.id === leadId || 
  //       (event.title && event.title.includes('Tim Wilson'))
  //     );
      
  //     console.log('🕵️ LEAD FOUND:', JSON.stringify(lead, null, 2));
      
  //     if (!lead) {
  //       console.log(`❌ NO LEAD FOUND for ID: ${leadId}`);
  //       return false;
  //     }
      
  //     // Check booking history
  //     const bookingHistory = lead.booking_history || 
  //                            lead.bookingHistory || 
  //                            lead.extendedProps?.lead?.bookingHistory || 
  //                            [];
      
  //     console.log('🔍 FULL BOOKING HISTORY:', JSON.stringify(bookingHistory, null, 2));
      
  //     // Filter SMS messages
  //     const smsMessages = bookingHistory.filter(h => 
  //       ['SMS_SENT', 'SMS_RECEIVED'].includes(h.action)
  //     );
      
  //     console.log('📱 SMS MESSAGES:', JSON.stringify(smsMessages, null, 2));
      
  //     // If no SMS messages, no need for reply
  //     if (smsMessages.length === 0) {
  //       console.log('❌ NO SMS MESSAGES FOUND');
  //       return false;
  //     }
      
  //     // Sort messages by timestamp (most recent first)
  //     smsMessages.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      
  //     // Check the most recent message
  //     const mostRecentSms = smsMessages[0];
      
  //     console.log('🕒 MOST RECENT SMS:', JSON.stringify(mostRecentSms, null, 2));
      
  //     // Detailed check for reply status
  //     const needsReply = mostRecentSms.action === 'SMS_RECEIVED' && 
  //       (!mostRecentSms.details || mostRecentSms.details.replied !== true);
      
  //     console.log(`🚨 NEEDS REPLY: ${needsReply}`);
  //     console.log(`📨 Most recent SMS action: ${mostRecentSms.action}`);
  //     console.log(`📨 Most recent SMS details: ${JSON.stringify(mostRecentSms.details)}`);
      
  //     return needsReply;
  //   } catch (error) {
  //     console.error('🔥 ERROR in hasRepliedMessages:', error);
  //     return false;
  //   }
  // };

  // Customize event rendering to include message indicator
  // const renderEventContent = (eventInfo) => {
  //   const lead = eventInfo.event.extendedProps;
  //   const hasUnrepliedMessage = hasRepliedMessages(lead.id || lead.leadId);

  //   return (
  //     <div className="flex items-center justify-between">
  //       <div className="flex items-center space-x-2">
  //         <span>{eventInfo.timeText}</span>
  //         {hasUnrepliedMessage && (
  //           <span className="relative ml-1">
  //             <FiMessageSquare className="inline-block text-gray-400" />
  //             <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
  //           </span>
  //         )}
  //       </div>
  //       <span>{eventInfo.event.title}</span>
  //     </div>
  //   );
  // };

  // Export calendar day to CSV
  const handleExportCalendar = async () => {
    try {
      // Get the exact date from the calendar API
      const calendarApi = calendarRef.current.getApi();
      const viewDate = calendarApi.getDate();

      // Format date in local timezone to avoid UTC conversion issues
      const year = viewDate.getFullYear();
      const month = String(viewDate.getMonth() + 1).padStart(2, '0');
      const day = String(viewDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      console.log(`📥 Exporting calendar for ${dateStr}...`);
      console.log(`📅 View date:`, viewDate);
      console.log(`📅 Formatted date string:`, dateStr);

      const response = await axios.get(`/api/leads/calendar/export-csv?date=${dateStr}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `calendar_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      console.log(`✅ Calendar exported successfully for ${dateStr}`);
    } catch (error) {
      console.error('Error exporting calendar:', error);
      alert('Failed to export calendar. Please try again.');
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 lg:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Calendar</h1>

              {/* Real-time Connection Status */}
              <div className="flex items-center space-x-1 sm:space-x-2">
                <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                  isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}></div>
                <span className={`text-xs ${
                  isConnected ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </div>

              {/* Event Count - hide on very small screens (excludes rescheduled-away ghosts) */}
              <div className="hidden sm:flex items-center space-x-2 sm:space-x-3 text-xs text-gray-500">
                <span>📅 {events.filter(e => !e.isRescheduledAway).length}</span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              {events.filter(e => !e.isRescheduledAway).length} events • Updated {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        </div>

        {/* Legend - wrap on mobile */}
        <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto overflow-x-auto">
          <div className="flex items-center space-x-2 text-xs sm:text-sm text-gray-600 whitespace-nowrap">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-blue-500 rounded"></div>
              <span className="hidden sm:inline">New</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-500 rounded"></div>
              <span className="hidden sm:inline">Booked</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-purple-500 rounded"></div>
              <span className="hidden sm:inline">Attended</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-red-500 rounded"></div>
              <span className="hidden sm:inline">Cancelled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar and Export Button */}
      <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
            <FiSearch className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search leads..."
            className="block w-full pl-8 sm:pl-10 pr-8 sm:pr-10 py-2 border border-gray-300 rounded-md text-sm bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchTerm && (
            <div className="absolute inset-y-0 right-0 pr-2 sm:pr-3 flex items-center">
              <button
                onClick={() => setSearchTerm('')}
                className="text-gray-400 hover:text-gray-600 focus:outline-none touch-target"
              >
                <FiX className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>
          )}
          {searchTerm && (
            <p className="mt-2 text-xs sm:text-sm text-gray-600">
              Found {events.filter(event => {
                if (event.isRescheduledAway) return false;
                const search = searchTerm.toLowerCase();
                const leadName = event.extendedProps?.lead?.name || event.title || '';
                const leadPhone = event.extendedProps?.phone || '';
                const leadEmail = event.extendedProps?.lead?.email || '';
                return (
                  leadName.toLowerCase().includes(search) ||
                  leadPhone.includes(search) ||
                  leadEmail.toLowerCase().includes(search)
                );
              }).length} results
            </p>
          )}
        </div>

        {/* Export Calendar Button - Only show in day view */}
        {currentView === 'timeGridDay' && (
          <button
            onClick={handleExportCalendar}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors whitespace-nowrap"
          >
            <FiDownload className="h-4 w-4" />
            <span className="text-sm font-medium">Export Day to CSV</span>
          </button>
        )}
      </div>

      {/* Calendar Navigation and View Toggle */}
      <div className="mobile-card mb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* View Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentView('monthly')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                currentView === 'monthly'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCurrentView('weekly')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                currentView === 'weekly'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setCurrentView('daily')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                currentView === 'daily'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Daily
            </button>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                const newDate = new Date(currentDate);
                if (currentView === 'daily') {
                  newDate.setDate(newDate.getDate() - 1);
                  // Skip blocked days when navigating
                  const maxAttempts = 30; // Prevent infinite loop
                  let attempts = 0;
                  while (attempts < maxAttempts) {
                    const dateStr = toLocalDateStr(newDate);
                    const isDayBlocked = blockedSlots.some(block => {
                      const blockDateStr = toLocalDateStr(new Date(block.date));
                      return blockDateStr === dateStr && !block.time_slot && !block.slot_number;
                    });
                    if (!isDayBlocked) break;
                    newDate.setDate(newDate.getDate() - 1);
                    attempts++;
                  }
                } else if (currentView === 'weekly') {
                  newDate.setDate(newDate.getDate() - 7);
                } else {
                  newDate.setMonth(newDate.getMonth() - 1);
                }
                setCurrentDate(newDate);
                fetchEvents(true);
              }}
              className="p-2 rounded-md bg-gray-200 hover:bg-gray-300 transition-colors"
            >
              <FiChevronLeft className="h-5 w-5" />
            </button>

            <button
              onClick={() => {
                setCurrentDate(getCurrentUKTime());
                fetchEvents(true);
              }}
              className="px-4 py-2 rounded-md bg-gray-200 hover:bg-gray-300 transition-colors font-medium"
            >
              Today
            </button>

            <button
              onClick={() => {
                const newDate = new Date(currentDate);
                if (currentView === 'daily') {
                  newDate.setDate(newDate.getDate() + 1);
                  // Skip blocked days when navigating
                  const maxAttempts = 30; // Prevent infinite loop
                  let attempts = 0;
                  while (attempts < maxAttempts) {
                    const dateStr = toLocalDateStr(newDate);
                    const isDayBlocked = blockedSlots.some(block => {
                      const blockDateStr = toLocalDateStr(new Date(block.date));
                      return blockDateStr === dateStr && !block.time_slot && !block.slot_number;
                    });
                    if (!isDayBlocked) break;
                    newDate.setDate(newDate.getDate() + 1);
                    attempts++;
                  }
                } else if (currentView === 'weekly') {
                  newDate.setDate(newDate.getDate() + 7);
                } else {
                  newDate.setMonth(newDate.getMonth() + 1);
                }
                setCurrentDate(newDate);
                fetchEvents(true);
              }}
              className="p-2 rounded-md bg-gray-200 hover:bg-gray-300 transition-colors"
            >
              <FiChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Slot-Based Calendar */}
      <div className="mobile-card overflow-x-auto">
        {currentView === 'monthly' ? (
          <MonthlySlotCalendar
            key={`monthly-calendar-${eventsUpdateKey}`}
            currentDate={currentDate}
            blockedSlots={blockedSlots}
            events={events.filter(event => {
              if (!event.date_booked) return false;
              
              // Filter by search term
              if (searchTerm) {
                const search = searchTerm.toLowerCase();
                const leadName = event.name || '';
                const leadPhone = event.phone || '';
                const leadEmail = event.email || '';
                return (
                  leadName.toLowerCase().includes(search) ||
                  leadPhone.includes(search) ||
                  leadEmail.toLowerCase().includes(search)
                );
              }
              
              return true;
            })}
            onDayClick={(day) => {
              // Check if the day is fully blocked before switching to daily view
              const dateStr = toLocalDateStr(day);
              const isDayBlocked = blockedSlots.some(block => {
                const blockDateStr = toLocalDateStr(new Date(block.date));
                // Full day block: date matches AND no time_slot AND no slot_number
                return blockDateStr === dateStr && !block.time_slot && !block.slot_number;
              });

              if (isDayBlocked) {
                alert('This day is blocked and cannot be viewed');
                return;
              }

              console.log('Day clicked:', day);
              // Switch to daily view for selected day
              setCurrentDate(day);
              setCurrentView('daily');
            }}
            onEventClick={(event) => {
              console.log('Event clicked:', event);
              // Find the full event from the events array
              // A review event is a synthetic appointment (id "review-<leadId>"); resolve it
              // to the real lead booking so modal actions use the real lead id, not the synthetic one.
              const fullEvent = event.isReviewAppointment
                ? (events.find(e => e.id === event.extendedProps?.lead?.id) || events.find(e => e.id === event.id))
                : events.find(e => e.id === event.id);
              if (fullEvent) {
                setSelectedEvent(fullEvent);
                setShowEventModal(true);
                // Mark as opened so useEffect doesn't re-trigger
                modalOpenedFromUrlRef.current = true;
                // Update URL so browser back button returns to this modal
                setSearchParams({ eventId: event.id }, { replace: true });
              } else {
                console.error('Could not find full event data for:', event.id);
              }
            }}
          />
        ) : currentView === 'daily' ? (
          <SlotCalendar
            key={`slot-calendar-${eventsUpdateKey}`}
            selectedDate={currentDate}
            blockedSlots={blockedSlots}
            events={events.filter(event => {
              if (!event.date_booked) return false;
              
              const eventDate = new Date(event.date_booked);
              const selectedDateStr = toLocalDateStr(currentDate);
              const eventDateStr = toLocalDateStr(eventDate);
              
              // Filter by search term
              if (searchTerm) {
                const search = searchTerm.toLowerCase();
                const leadName = event.name || '';
                const leadPhone = event.phone || '';
                const leadEmail = event.email || '';
                const matchesSearch = 
                  leadName.toLowerCase().includes(search) ||
                  leadPhone.includes(search) ||
                  leadEmail.toLowerCase().includes(search);
                
                return eventDateStr === selectedDateStr && matchesSearch;
              }
              
              return eventDateStr === selectedDateStr;
            })}
            onSlotClick={(time, slot, slotConfig) => {
              console.log('Slot clicked:', time, slot, slotConfig);
              // Open booking modal with pre-filled time and slot
              setSelectedTime(time);
              setSelectedSlot(slot);
              
              // Parse the time string (e.g., "14:00") and set it on the date
              const timeParts = time.split(':');
              const hours = timeParts.length > 0 ? parseInt(timeParts[0], 10) : 0;
              const minutes = timeParts.length > 1 ? parseInt(timeParts[1], 10) : 0;
              
              // Create a new date with the selected time
              const dateWithTime = new Date(currentDate);
              dateWithTime.setHours(hours, minutes, 0, 0);
              
              setSelectedDate({
                dateStr: dateWithTime.toISOString(),
                date: dateWithTime
              });
              setLeadForm({
                ...leadForm,
                time_booked: time,
                booking_slot: slot,
                date_booked: toLocalDateStr(currentDate)
              });
              // Set flag for secondary template visibility - true if NOT coming from Leads page
              setIsDirectCalendarClick(!leadForm._id);
              setShowLeadFormModal(true);
            }}
            onEventClick={(event) => {
              console.log('Event clicked:', event);
              // Find the full event from the events array
              // A review event is a synthetic appointment (id "review-<leadId>"); resolve it
              // to the real lead booking so modal actions use the real lead id, not the synthetic one.
              const fullEvent = event.isReviewAppointment
                ? (events.find(e => e.id === event.extendedProps?.lead?.id) || events.find(e => e.id === event.id))
                : events.find(e => e.id === event.id);
              if (fullEvent) {
                setSelectedEvent(fullEvent);
                setShowEventModal(true);
                // Mark as opened so useEffect doesn't re-trigger
                modalOpenedFromUrlRef.current = true;
                // Update URL so browser back button returns to this modal
                setSearchParams({ eventId: event.id }, { replace: true });
              } else {
                console.error('Could not find full event data for:', event.id);
              }
            }}
          />
        ) : (
          <WeeklySlotCalendar
            weekStart={(() => {
              const date = new Date(currentDate);
              const day = date.getDay();
              const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
              return new Date(date.setDate(diff));
            })()}
            blockedSlots={blockedSlots}
            events={events.filter(event => {
              if (!event.date_booked) return false;
              
              // Filter by search term
              if (searchTerm) {
                const search = searchTerm.toLowerCase();
                const leadName = event.name || '';
                const leadPhone = event.phone || '';
                const leadEmail = event.email || '';
                return (
                  leadName.toLowerCase().includes(search) ||
                  leadPhone.includes(search) ||
                  leadEmail.toLowerCase().includes(search)
                );
              }
              
              return true;
            })}
            onDayClick={(day, time, slot) => {
              console.log('Day/slot clicked:', day, time, slot);
              if (time && slot) {
                // Clicked on a specific slot
                setSelectedTime(time);
                setSelectedSlot(slot);
                
                // Parse the time string (e.g., "14:00") and set it on the date
                const timeParts = time.split(':');
                const hours = timeParts.length > 0 ? parseInt(timeParts[0], 10) : 0;
                const minutes = timeParts.length > 1 ? parseInt(timeParts[1], 10) : 0;
                
                // Create a new date with the selected time
                const dateWithTime = new Date(day);
                dateWithTime.setHours(hours, minutes, 0, 0);
                
                setSelectedDate({
                  dateStr: dateWithTime.toISOString(),
                  date: dateWithTime
                });
                setCurrentDate(day);
                setLeadForm({
                  ...leadForm,
                  time_booked: time,
                  booking_slot: slot,
                  date_booked: toLocalDateStr(day)
                });
                // Set flag for secondary template visibility - true if NOT coming from Leads page
                setIsDirectCalendarClick(!leadForm._id);
                setShowLeadFormModal(true);
              } else {
                // Clicked on day header - check if day is blocked before switching to daily view
                const dateStr = toLocalDateStr(day);
                const isDayBlocked = blockedSlots.some(block => {
                  const blockDateStr = toLocalDateStr(new Date(block.date));
                  // Full day block: date matches AND no time_slot AND no slot_number
                  return blockDateStr === dateStr && !block.time_slot && !block.slot_number;
                });
                
                if (isDayBlocked) {
                  alert('This day is blocked and cannot be viewed');
                  return;
                }
                
                // Switch to daily view
                setCurrentDate(day);
                setCurrentView('daily');
              }
            }}
            onEventClick={(event) => {
              console.log('Event clicked:', event);
              // Find the full event from the events array
              // A review event is a synthetic appointment (id "review-<leadId>"); resolve it
              // to the real lead booking so modal actions use the real lead id, not the synthetic one.
              const fullEvent = event.isReviewAppointment
                ? (events.find(e => e.id === event.extendedProps?.lead?.id) || events.find(e => e.id === event.id))
                : events.find(e => e.id === event.id);
              if (fullEvent) {
                setSelectedEvent(fullEvent);
                setShowEventModal(true);
                // Mark as opened so useEffect doesn't re-trigger
                modalOpenedFromUrlRef.current = true;
                // Update URL so browser back button returns to this modal
                setSearchParams({ eventId: event.id }, { replace: true });
              } else {
                console.error('Could not find full event data for:', event.id);
              }
            }}
          />
        )}
      </div>



      {/* Lead Form Modal */}
      {showLeadFormModal && selectedDate && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 h-full w-full z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="relative mx-auto p-6 border w-full max-w-5xl shadow-lg rounded-lg bg-white calendar-modal-scroll max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {leadForm._id ? (leadForm.isReschedule ? 'Reschedule Appointment' : 'Book Existing Lead') : 'Create New Booking'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {leadForm._id ? (leadForm.isReschedule ? 'Choose a new date and time for the appointment' : 'Schedule appointment for existing lead') : 'Fill in the lead information for the booking'}
                </p>
              </div>
              <button
                onClick={() => setShowLeadFormModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <FiX className="h-6 w-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Lead Form */}
              <div className="space-y-6">
                <h4 className="text-md font-medium text-gray-900 border-b pb-2">Lead Information</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <FiUser className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        name="name"
                        value={leadForm.name}
                        onChange={handleFormChange}
                        className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter full name"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <FiPhone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="tel"
                        name="phone"
                        value={leadForm.phone}
                        onChange={handleFormChange}
                        className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter phone number"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="relative">
                      <FiMail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="email"
                        name="email"
                        value={leadForm.email}
                        onChange={handleFormChange}
                        className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter email address"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                    <div className="relative">
                      <FiMapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        name="postcode"
                        value={leadForm.postcode}
                        onChange={handleFormChange}
                        className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter postcode"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={leadForm.status}
                      onChange={handleFormChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="New">New</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Booked">Booked</option>
                      <option value="Attended">Attended</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <div className="relative">
                      <FiFileText className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <textarea
                        name="notes"
                        value={leadForm.notes}
                        onChange={handleFormChange}
                        rows="3"
                        className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Additional notes..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Booking Preview */}
              <div className="space-y-6">
                <h4 className="text-md font-medium text-gray-900 border-b pb-2">Booking Preview</h4>
                
                {/* Send options */}
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-900 mb-2">Send booking confirmation via</p>
                  <div className="flex items-center space-x-6">
                    <label className="inline-flex items-center space-x-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">Email</span>
                    </label>
                    <label className="inline-flex items-center space-x-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        checked={sendSms}
                        onChange={(e) => setSendSms(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">Text (SMS)</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Both are checked by default. Uncheck to prevent sending.</p>

                  {/* Template Selector */}
                  {(sendEmail || sendSms) && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Template
                      </label>
                      {bookingTemplates.length > 0 ? (
                        <>
                          <select
                            value={selectedTemplateId || ''}
                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {bookingTemplates.map((template) => (
                              <option key={template._id} value={template._id}>
                                {template.name} {template.emailAccount === 'secondary' ? '(diary@example.com)' : '(Primary)'}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            Emails sent via Gmail API
                          </p>
                          {/* Show warning if template doesn't support selected channels */}
                          {sendEmail && !templateSupportsEmail && (
                            <p className="text-xs text-amber-600 mt-1">
                              ⚠️ This template has email disabled - email will not be sent
                            </p>
                          )}
                          {sendSms && !templateSupportsSms && (
                            <p className="text-xs text-amber-600 mt-1">
                              ⚠️ This template has SMS disabled - SMS will not be sent
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
                          ⚠️ No active booking confirmation templates found. Please create one in the Templates page.
                        </div>
                      )}
                    </div>
                  )}

                </div>

                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  {/* Simple Date & Time Picker */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">New Date</label>
                      <input
                        type="date"
                        value={selectedDate ? (selectedDate.dateStr ? selectedDate.dateStr.slice(0, 10) : selectedDate instanceof Date ? selectedDate.toISOString().slice(0, 10) : '') : ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            const newDate = new Date(e.target.value + 'T12:00:00');
                            setSelectedDate({ 
                              dateStr: newDate.toISOString(), 
                              date: newDate 
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">New Time</label>
                      <select
                        value={leadForm.time_booked || (selectedDate && selectedDate.date ? 
                          `${String(selectedDate.date.getHours()).padStart(2, '0')}:${String(selectedDate.date.getMinutes()).padStart(2, '0')}` : 
                          '10:00')}
                        onChange={(e) => {
                          const timeStr = e.target.value;
                          const [hours, minutes] = timeStr.split(':').map(Number);
                          
                          if (selectedDate) {
                            const currentDate = selectedDate.date || selectedDate;
                            const newDate = new Date(currentDate);
                            newDate.setHours(hours, minutes, 0, 0);
                            setSelectedDate({ 
                              dateStr: newDate.toISOString(), 
                              date: newDate 
                            });
                          }
                          
                          // Update time_booked in leadForm
                          setLeadForm({ ...leadForm, time_booked: timeStr });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {AVAILABLE_TIMES.map(time => {
                          const [hours, minutes] = time.split(':').map(Number);
                          const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
                          const ampm = hours >= 12 ? 'PM' : 'AM';
                          const displayTime = `${hour12}:${String(minutes).padStart(2, '0')} ${ampm}`;
                          return (
                            <option key={time} value={time}>
                              {displayTime}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Only times available on the calendar are shown
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Booking Slot</label>
                      <select
                        value={leadForm.booking_slot || 1}
                        onChange={(e) => {
                          setLeadForm({ ...leadForm, booking_slot: parseInt(e.target.value) });
                          setSelectedSlot(parseInt(e.target.value));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={1}>Slot 1</option>
                        <option value={2}>Slot 2</option>
                        <option value={3}>Slot 3</option>
                        <option value={4}>Slot 4</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Select which slot column to book the appointment in
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <FiCalendar className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="font-medium text-gray-900">Date & Time</p>
                      <p className="text-sm text-gray-600">{getBookingPreview()?.date}</p>
                      <p className="text-sm text-gray-600">{getBookingPreview()?.time}</p>
                    </div>
                  </div>

                  {leadForm.name && (
                    <div className="flex items-center space-x-3">
                      <FiUser className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium text-gray-900">Client</p>
                        <p className="text-sm text-gray-600">{leadForm.name}</p>
                      </div>
                    </div>
                  )}

                  {leadForm.phone && (
                    <div className="flex items-center space-x-3">
                      <FiPhone className="h-5 w-5 text-purple-500" />
                      <div>
                        <p className="font-medium text-gray-900">Phone</p>
                        <p className="text-sm text-gray-600">{leadForm.phone}</p>
                      </div>
                    </div>
                  )}

                  {leadForm.email && (
                    <div className="flex items-center space-x-3">
                      <FiMail className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="font-medium text-gray-900">Email</p>
                        <p className="text-sm text-gray-600">{leadForm.email}</p>
                      </div>
                    </div>
                  )}

                  {leadForm.postcode && (
                    <div className="flex items-center space-x-3">
                      <FiMapPin className="h-5 w-5 text-red-500" />
                      <div>
                        <p className="font-medium text-gray-900">Postcode</p>
                        <p className="text-sm text-gray-600">{leadForm.postcode}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center space-x-3">
                    <div className={`w-5 h-5 rounded ${getEventColor(leadForm.status, leadForm.hasSale)}`} style={{backgroundColor: getEventColor(leadForm.status, leadForm.hasSale)}}></div>
                    <div>
                      <p className="font-medium text-gray-900">Status</p>
                      <span className={getStatusBadgeClass(leadForm.status)}>
                        {leadForm.status}
                      </span>
                    </div>
                  </div>

                  {leadForm.notes && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="font-medium text-gray-900 mb-1">Notes</p>
                      <p className="text-sm text-gray-600">{leadForm.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex justify-end space-x-3 pt-6 border-t">
              <button
                onClick={() => setShowLeadFormModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBooking}
                className="btn-primary"
              >
                {leadForm._id ? 'Book Appointment' : 'Save Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal - Wide Layout with Full Details */}
      {showEventModal && selectedEvent && selectedEvent.start && (() => {
        // Debug logging for image URL
        console.log('🖼️ Modal opened - Full selectedEvent:', {
          id: selectedEvent.id,
          title: selectedEvent.title,
          hasExtendedProps: !!selectedEvent.extendedProps,
          hasLead: !!selectedEvent.extendedProps?.lead,
          leadKeys: selectedEvent.extendedProps?.lead ? Object.keys(selectedEvent.extendedProps.lead) : [],
          image_url: selectedEvent.extendedProps?.lead?.image_url,
          image_url_type: typeof selectedEvent.extendedProps?.lead?.image_url,
          image_url_length: selectedEvent.extendedProps?.lead?.image_url?.length
        });
        return true;
      })() && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-1 sm:p-2 md:p-4">
          <div className="relative w-full max-w-sm sm:max-w-2xl md:max-w-4xl lg:max-w-5xl bg-white rounded-lg shadow-2xl max-h-[95vh] overflow-y-auto calendar-modal-scroll flex flex-col">
            {/* Header: Photo and Main Details Top Right */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-3 sm:p-4">
              {/* Main Details */}
              <div className="flex-1 mb-2 sm:mb-0 mt-10 sm:mt-0">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-1 flex items-center flex-wrap">
                  {selectedEvent.extendedProps?.lead?.name || selectedEvent.title}
                  {selectedEvent.extendedProps?.lead?.age && (
                    <span className="text-white/90 font-normal ml-2">({selectedEvent.extendedProps.lead.age})</span>
                  )}
                  {/* Message indicator: flashing for unread, static for read */}
                  {(selectedEvent.hasUnreadSms || selectedEvent.hasUnreadEmail) ? (
                    <span className="relative ml-2 animate-pulse">
                      {selectedEvent.hasUnreadSms ? (
                        <FiMessageSquare className="inline-block w-5 h-5 text-green-300" />
                      ) : (
                        <FiMail className="inline-block w-5 h-5 text-yellow-300" />
                      )}
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" style={{animationDuration: '1.5s'}} />
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                    </span>
                  ) : (selectedEvent.hasReceivedSms || selectedEvent.hasReceivedEmail) ? (
                    <span className="ml-2">
                      {selectedEvent.hasReceivedSms ? (
                        <FiMessageSquare className="inline-block w-4 h-4 text-white/50" />
                      ) : (
                        <FiMail className="inline-block w-4 h-4 text-white/50" />
                      )}
                    </span>
                  ) : null}
                </h3>
                <div className="flex items-center space-x-3">
                  <span className={`${getStatusBadgeClass(selectedEvent.extendedProps?.status)} px-3 py-1 rounded-lg text-sm font-medium`}>
                    {selectedEvent.extendedProps?.status || 'Scheduled'}
                  </span>
                  {selectedEvent.extendedProps?.isConfirmed && (
                    <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-white/20 text-white">
                      <FiCheck className="h-4 w-4 mr-2" />
                      Confirmed
                    </span>
                  )}
                </div>
                {(selectedEvent.extendedProps?.lead?.booked_at || selectedEvent.extendedProps?.lead?.created_at) && (
                  <p className="text-white/80 text-xs mt-1">
                    Booked on: {new Date(selectedEvent.extendedProps.lead.booked_at || selectedEvent.extendedProps.lead.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              {/* Photo Top Right */}
              <div className="relative ml-0 sm:ml-4 absolute top-3 right-3 sm:static">
                <div
                  className="cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => {
                    if (selectedEvent.extendedProps?.lead?.image_url) {
                      console.log('🖼️ Opening image:', selectedEvent.extendedProps.lead.image_url);
                      setLightboxImage(selectedEvent.extendedProps.lead.image_url);
                    }
                  }}
                >
                  <LazyImage
                    key={`${selectedEvent.id}-${selectedEvent.extendedProps?.lead?.image_url || 'no-image'}`}
                    src={getOptimizedImageUrl(selectedEvent.extendedProps?.lead?.image_url, 'optimized')}
                    alt={selectedEvent.extendedProps?.lead?.name || selectedEvent.title}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-white shadow-lg object-cover"
                    fallbackClassName="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-white shadow-lg bg-white flex items-center justify-center"
                    lazy={false}
                    preload={true}
                    onError={() => {
                      console.error('❌ Image failed to load:', selectedEvent.extendedProps?.lead?.image_url);
                    }}
                    onLoad={() => {
                      console.log('✅ Image loaded successfully:', selectedEvent.extendedProps?.lead?.image_url);
                    }}
                  />
                </div>
                {/* Status indicator */}
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-white shadow-lg ${
                  selectedEvent.extendedProps?.status === 'Attended' ? 'bg-green-500' :
                  selectedEvent.extendedProps?.status === 'Booked' ? 'bg-blue-500' :
                  selectedEvent.extendedProps?.status === 'Cancelled' ? 'bg-red-500' :
                  'bg-gray-400'
                }`}></div>
              </div>

              {/* Navigation arrows with close button centered at top */}
              {(() => {
                const navState = getNavigationState();
                return (
                  <div className="absolute top-3 left-1/2 transform -translate-x-1/2 flex space-x-1 sm:space-x-2 z-10">
                    <button
                      onClick={navigateToPreviousBooking}
                      disabled={!navState.canGoPrevious}
                      className={`p-1.5 sm:p-2 rounded-full bg-white/20 backdrop-blur-sm transition-all duration-200 ${
                        navState.canGoPrevious
                          ? 'text-white hover:text-gray-900 hover:bg-white/40 shadow-lg'
                          : 'text-white/30 cursor-not-allowed bg-white/10'
                      }`}
                      title="Previous booking"
                    >
                      <FiChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                    <button
                      onClick={closeEventModal}
                      className="p-1.5 sm:p-2 rounded-full bg-white/20 backdrop-blur-sm text-white hover:text-gray-900 hover:bg-white/40 transition-all duration-200 shadow-lg"
                      title="Close"
                    >
                      <FiX className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                    <button
                      onClick={navigateToNextBooking}
                      disabled={!navState.canGoNext}
                      className={`p-1.5 sm:p-2 rounded-full bg-white/20 backdrop-blur-sm transition-all duration-200 ${
                        navState.canGoNext
                          ? 'text-white hover:text-gray-900 hover:bg-white/40 shadow-lg'
                          : 'text-white/30 cursor-not-allowed bg-white/10'
                      }`}
                      title="Next booking"
                    >
                      <FiChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                    </button>
                  </div>
                );
              })()}
            </div>
            {/* Main Info Center */}
            <div className="p-2 sm:p-3 md:p-4 flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left Column - Contact Information */}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                    <FiUser className="h-4 w-4 mr-2 text-indigo-600" />
                    Contact Information
                  </h4>
                  <div className="space-y-3">
                    {/* Date and Time */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-3">
                      <div className="flex items-start space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center flex-shrink-0">
                          <FiCalendar className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Appointment Date & Time</p>
                          <p className="text-sm font-bold text-gray-900">
                            {selectedEvent.start ? new Date(selectedEvent.start).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            }) : 'Date not available'}
                          </p>
                          <p className="text-xs text-gray-600 flex items-center">
                            <FiClock className="h-3 w-3 mr-1" />
                            {selectedEvent.start ? formatEventTime(selectedEvent) : 'Time not available'}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Phone */}
                    {selectedEvent.extendedProps?.phone && (
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-3">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                            <FiPhone className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">Phone Number</p>
                            <p className="text-sm font-bold text-gray-900">{selectedEvent.extendedProps.phone}</p>
                            <a href={`tel:${selectedEvent.extendedProps.phone}`} className="text-xs text-purple-600 hover:text-purple-800 transition-colors">
                              Click to call →
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Email */}
                    {selectedEvent.extendedProps?.lead?.email && (
                      <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg p-3">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-pink-500 flex items-center justify-center flex-shrink-0">
                            <FiMail className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-pink-600 uppercase tracking-wide">Email Address</p>
                            <p className="text-sm font-bold text-gray-900 break-all">{selectedEvent.extendedProps.lead.email}</p>
                            <a href={`mailto:${selectedEvent.extendedProps.lead.email}`} className="text-xs text-pink-600 hover:text-pink-800 transition-colors">
                              Send email →
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Postcode */}
                    {selectedEvent.extendedProps?.lead?.postcode && (
                      <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg p-3">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                            <FiMapPin className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-orange-600 uppercase tracking-wide">Postcode</p>
                            <p className="text-sm font-bold text-gray-900">{selectedEvent.extendedProps.lead.postcode}</p>
                            <a href={`https://maps.google.com/maps?q=${selectedEvent.extendedProps.lead.postcode}`} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:text-orange-800 transition-colors">
                              View on map →
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Model Stats Section - L'Oreal Style */}
                    <div className="mt-4 bg-gradient-to-br from-slate-50 via-gray-50 to-zinc-100 rounded-xl p-4 border border-gray-200 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center">
                          <span className="w-6 h-6 rounded-full bg-gradient-to-r from-gray-800 to-gray-600 flex items-center justify-center mr-2">
                            <FiUser className="h-3 w-3 text-white" />
                          </span>
                          Model Stats
                        </h5>
                        <button
                          onClick={() => setEditingStats(!editingStats)}
                          className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
                        >
                          <FiEdit2 className="h-3 w-3" />
                          {editingStats ? 'Cancel' : 'Edit'}
                        </button>
                      </div>

                      {editingStats ? (
                        /* Edit Mode */
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
                              <input
                                type="date"
                                value={statsForm.date_of_birth || ''}
                                onChange={(e) => setStatsForm({...statsForm, date_of_birth: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Height (inches)</label>
                              <input
                                type="number"
                                value={statsForm.height_inches || ''}
                                onChange={(e) => setStatsForm({...statsForm, height_inches: e.target.value})}
                                placeholder="e.g. 65"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Chest (inches)</label>
                              <input
                                type="number"
                                value={statsForm.chest_inches || ''}
                                onChange={(e) => setStatsForm({...statsForm, chest_inches: e.target.value})}
                                placeholder="e.g. 34"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Waist (inches)</label>
                              <input
                                type="number"
                                value={statsForm.waist_inches || ''}
                                onChange={(e) => setStatsForm({...statsForm, waist_inches: e.target.value})}
                                placeholder="e.g. 28"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Hips (inches)</label>
                              <input
                                type="number"
                                value={statsForm.hips_inches || ''}
                                onChange={(e) => setStatsForm({...statsForm, hips_inches: e.target.value})}
                                placeholder="e.g. 36"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Eye Color</label>
                              <select
                                value={statsForm.eye_color || ''}
                                onChange={(e) => setStatsForm({...statsForm, eye_color: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                              >
                                <option value="">Select...</option>
                                <option value="Brown">Brown</option>
                                <option value="Blue">Blue</option>
                                <option value="Green">Green</option>
                                <option value="Hazel">Hazel</option>
                                <option value="Grey">Grey</option>
                                <option value="Amber">Amber</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Hair Color</label>
                              <select
                                value={statsForm.hair_color || ''}
                                onChange={(e) => setStatsForm({...statsForm, hair_color: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                              >
                                <option value="">Select...</option>
                                <option value="Black">Black</option>
                                <option value="Brown">Brown</option>
                                <option value="Blonde">Blonde</option>
                                <option value="Red">Red</option>
                                <option value="Auburn">Auburn</option>
                                <option value="Grey">Grey</option>
                                <option value="White">White</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Hair Length</label>
                              <select
                                value={statsForm.hair_length || ''}
                                onChange={(e) => setStatsForm({...statsForm, hair_length: e.target.value})}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent transition-all"
                              >
                                <option value="">Select...</option>
                                <option value="Bald">Bald</option>
                                <option value="Buzz">Buzz</option>
                                <option value="Short">Short</option>
                                <option value="Medium">Medium</option>
                                <option value="Long">Long</option>
                                <option value="Very Long">Very Long</option>
                              </select>
                            </div>
                          </div>
                          <button
                            onClick={handleSaveStats}
                            disabled={savingStats}
                            className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-gray-800 to-gray-700 text-white text-sm font-medium rounded-lg hover:from-gray-700 hover:to-gray-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {savingStats ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Saving...
                              </>
                            ) : (
                              <>
                                <FiCheck className="h-4 w-4" />
                                Save Stats
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        /* Display Mode */
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">DOB</span>
                            <span className="text-sm font-medium text-gray-900">
                              {selectedEvent.extendedProps?.lead?.date_of_birth
                                ? new Date(selectedEvent.extendedProps.lead.date_of_birth).toLocaleDateString('en-GB')
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Height</span>
                            <span className="text-sm font-medium text-gray-900">
                              {selectedEvent.extendedProps?.lead?.height_inches
                                ? `${selectedEvent.extendedProps.lead.height_inches}"`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Chest</span>
                            <span className="text-sm font-medium text-gray-900">
                              {selectedEvent.extendedProps?.lead?.chest_inches
                                ? `${selectedEvent.extendedProps.lead.chest_inches}"`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Waist</span>
                            <span className="text-sm font-medium text-gray-900">
                              {selectedEvent.extendedProps?.lead?.waist_inches
                                ? `${selectedEvent.extendedProps.lead.waist_inches}"`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Hips</span>
                            <span className="text-sm font-medium text-gray-900">
                              {selectedEvent.extendedProps?.lead?.hips_inches
                                ? `${selectedEvent.extendedProps.lead.hips_inches}"`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Eyes</span>
                            <span className="text-sm font-medium text-gray-900">
                              {selectedEvent.extendedProps?.lead?.eye_color || '—'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Hair</span>
                            <span className="text-sm font-medium text-gray-900">
                              {selectedEvent.extendedProps?.lead?.hair_color || '—'}
                            </span>
                          </div>
                          <div className="col-span-2 flex justify-between items-center py-1.5">
                            <span className="text-xs text-gray-500 uppercase tracking-wide">Hair Length</span>
                            <span className="text-sm font-medium text-gray-900">
                              {selectedEvent.extendedProps?.lead?.hair_length || '—'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column - Details & Actions */}
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                    <FiSettings className="h-4 w-4 mr-2 text-indigo-600" />
                    Details & Actions
                  </h4>
                  <div className="space-y-3">
                    {/* Send options (applies to next booking/reschedule) */}
                    <div className="bg-white border border-gray-100 rounded-lg p-3">
                      <h5 className="text-sm font-bold text-gray-900 mb-2">Booking confirmation channels</h5>
                      <div className="flex items-center space-x-6">
                        <label className="inline-flex items-center space-x-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                            checked={sendEmail}
                            onChange={(e) => setSendEmail(e.target.checked)}
                          />
                          <span className="text-sm text-gray-700">Email</span>
                        </label>
                        <label className="inline-flex items-center space-x-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                            checked={sendSms}
                            onChange={(e) => setSendSms(e.target.checked)}
                          />
                          <span className="text-sm text-gray-700">Text (SMS)</span>
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">These settings apply when you reschedule from this modal.</p>

                      {/* Dynamic Template Selector */}
                      {(sendEmail || sendSms) && (
                        <div className="mt-3">
                          {/* Toggle Button */}
                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-700">
                              {templateMode === 'primary' ? 'Booking Confirmation' : 'Secondary Confirmation'}
                            </label>
                            {secondaryTemplates && secondaryTemplates.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setTemplateMode(templateMode === 'primary' ? 'secondary' : 'primary')}
                                className={`flex items-center space-x-2 px-3 py-1.5 text-sm font-semibold rounded-lg shadow-sm transition-all duration-200 ${
                                  templateMode === 'primary'
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                                    : 'bg-gradient-to-r from-indigo-500 to-blue-500 text-white hover:from-indigo-600 hover:to-blue-600'
                                }`}
                              >
                                <FiRefreshCw className="h-4 w-4" />
                                <span>Switch to {templateMode === 'primary' ? 'Confirm' : 'Primary'}</span>
                              </button>
                            )}
                          </div>

                          {/* Template Dropdown - Changes based on mode */}
                          {templateMode === 'primary' ? (
                            bookingTemplates.length > 0 ? (
                              <>
                                <select
                                  value={selectedTemplateId || ''}
                                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                >
                                  {bookingTemplates.map((template) => (
                                    <option key={template._id} value={template._id}>
                                      {template.name} {template.emailAccount === 'secondary' ? '(Diary)' : '(Primary)'}
                                    </option>
                                  ))}
                                </select>
                                {sendEmail && !templateSupportsEmail && (
                                  <p className="text-xs text-amber-600 mt-1">
                                    ⚠️ This template has email disabled
                                  </p>
                                )}
                                {sendSms && !templateSupportsSms && (
                                  <p className="text-xs text-amber-600 mt-1">
                                    ⚠️ This template has SMS disabled
                                  </p>
                                )}
                              </>
                            ) : (
                              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-2">
                                ⚠️ No active booking templates found
                              </div>
                            )
                          ) : (
                            <select
                              value={secondaryTemplateId || ''}
                              onChange={(e) => setSecondaryTemplateId(e.target.value || null)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            >
                              <option value="">None - No secondary email</option>
                              {secondaryTemplates.map((template) => (
                                <option key={template._id} value={template._id}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {templateMode === 'primary' ? 'Main booking confirmation' : 'Optional additional email'}
                          </p>
                        </div>
                      )}

                      {/* Send Button - Changes based on mode */}
                      {selectedEvent.extendedProps?.lead?.date_booked && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          {templateMode === 'primary' ? (
                            <>
                              <button
                                onClick={handleResendWelcomePack}
                                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg"
                                title="Resend welcome pack (booking confirmation email and SMS)"
                              >
                                <FiSend className="h-4 w-4" />
                                <span className="text-sm font-medium">Resend Welcome Pack</span>
                              </button>
                              <p className="text-xs text-gray-500 mt-1 text-center">
                                Sends booking confirmation via email and SMS
                              </p>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={handleSendSecondaryTemplate}
                                disabled={!secondaryTemplateId}
                                className={`w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg ${
                                  secondaryTemplateId
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }`}
                                title="Send selected template"
                              >
                                <FiSend className="h-4 w-4" />
                                <span className="text-sm font-medium">Send</span>
                              </button>
                              <p className="text-xs text-gray-500 mt-1 text-center">
                                {secondaryTemplateId ? 'Send selected template to customer' : 'Select a template above'}
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Assigned User */}
                    {selectedEvent.extendedProps?.booker && (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3">
                        <div className="flex items-start space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                            <FiUser className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-green-600 uppercase tracking-wide">Assigned To</p>
                            <p className="text-sm font-bold text-gray-900">{selectedEvent.extendedProps.booker}</p>
                            <p className="text-xs text-green-600">Account Manager</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quick Status Actions */}
                    <div className="bg-white border border-gray-100 rounded-lg p-3">
                      <h5 className="text-sm font-bold text-gray-900 mb-2 flex items-center">
                        <FiActivity className="h-4 w-4 mr-2 text-indigo-600" />
                        Quick Status Update
                      </h5>
                      {(() => {
                        const isBooked = selectedEvent.extendedProps?.status === 'Booked';
                        const isConfirmed = selectedEvent.extendedProps?.isConfirmed;
                        const isDoubleConfirmed = selectedEvent.extendedProps?.isDoubleConfirmed || selectedEvent.extendedProps?.lead?.is_double_confirmed;

                        // Determine current status with better fallback logic
                        let currentDisplayStatus = selectedEvent.extendedProps?.displayStatus || selectedEvent.extendedProps?.bookingStatus;

                        // If no displayStatus/bookingStatus, determine from other props
                        if (!currentDisplayStatus) {
                          if (isBooked && isDoubleConfirmed) {
                            currentDisplayStatus = 'Double Confirmed';
                          } else if (isBooked && isConfirmed) {
                            currentDisplayStatus = 'Confirmed';
                          } else if (isBooked && isConfirmed === false) {
                            currentDisplayStatus = 'Unconfirmed';
                          } else if (isBooked) {
                            currentDisplayStatus = 'Booked';
                          } else {
                            currentDisplayStatus = selectedEvent.extendedProps?.status || 'Unknown';
                          }
                        }

                        // Check permissions for status changes
                        const canChangeConfirmation = user?.role === 'admin' || user?.role === 'viewer' || user?.role === 'booker';
                        const canChangeOtherStatuses = user?.role === 'admin' || user?.role === 'viewer';

                        // Status options with VIBRANT colors
                        const statusOptions = [
                          { value: 'Unconfirmed', label: 'Unconfirmed', color: '#fb923c', permission: canChangeConfirmation },
                          { value: 'Confirmed', label: 'Confirmed ✓', color: '#22c55e', permission: canChangeConfirmation },
                          { value: 'Double Confirmed', label: 'Double Confirmed ✓✓', color: '#15803d', permission: canChangeConfirmation },
                          { value: 'Arrived', label: 'Arrived', color: '#2563eb', permission: canChangeOtherStatuses },
                          { value: 'Left', label: 'Left', color: '#1f2937', permission: canChangeOtherStatuses },
                          { value: 'No Show', label: 'No Show', color: '#ef4444', permission: canChangeOtherStatuses },
                          { value: 'No Sale', label: 'No Sale', color: '#b91c1c', permission: canChangeOtherStatuses },
                          { value: 'Review', label: 'Review', color: '#8b5cf6', permission: canChangeOtherStatuses },
                          { value: 'Cancelled', label: 'Cancelled', color: '#f43f5e', permission: canChangeConfirmation },
                        ];

                        // Get current status color
                        const getCurrentStatusColor = () => {
                          const option = statusOptions.find(opt => opt.value === currentDisplayStatus);
                          return option?.color || '#6b7280';
                        };

                        const handleStatusDropdownChange = (e) => {
                          const newStatus = e.target.value;
                          if (newStatus === 'Review') {
                            // Open review date/time picker modal
                            setShowReviewModal(true);
                          } else {
                            handleEventStatusChange(newStatus);
                          }
                        };

                        return (
                        <div className="space-y-3">
                          {/* Status Dropdown */}
                          <div className="relative">
                            <select
                              value={currentDisplayStatus}
                              onChange={handleStatusDropdownChange}
                              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 bg-white text-sm font-semibold appearance-none cursor-pointer hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all"
                              style={{
                                paddingLeft: '40px',
                                borderLeftWidth: '4px',
                                borderLeftColor: getCurrentStatusColor()
                              }}
                            >
                              {statusOptions.filter(opt => opt.permission).map(option => (
                                <option
                                  key={option.value}
                                  value={option.value}
                                  style={{ color: option.color }}
                                >
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {/* Color indicator dot - LARGER for visibility */}
                            <div
                              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 rounded-full shadow-sm border-2 border-white"
                              style={{ backgroundColor: getCurrentStatusColor() }}
                            ></div>
                            {/* Dropdown arrow */}
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                              <FiChevronDown className="h-5 w-5 text-gray-400" />
                            </div>
                          </div>

                          {/* Status Color Legend - LARGER dots */}
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            {statusOptions.slice(0, 6).map(option => (
                              <div key={option.value} className="flex items-center space-x-1.5">
                                <div
                                  className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                                  style={{ backgroundColor: option.color }}
                                ></div>
                                <span className="text-gray-700 font-medium truncate">{option.value.replace(' Confirmed', '')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              {/* History/Notes at the bottom */}
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex flex-col space-y-3">
                  {/* SMS Conversation History */}
                  {(() => {
                    const rawHistory = selectedEvent.extendedProps?.lead?.bookingHistory ??
                                       selectedEvent.extendedProps?.lead?.booking_history ?? [];
                    let history = [];
                    try {
                      if (Array.isArray(rawHistory)) {
                        history = rawHistory;
                      } else if (typeof rawHistory === 'string') {
                        history = rawHistory.trim() ? JSON.parse(rawHistory) : [];
                      } else if (rawHistory && typeof rawHistory === 'object') {
                        history = Array.isArray(rawHistory) ? rawHistory : [];
                      }
                    } catch (e) {
                      history = [];
                    }
                    const messages = Array.isArray(history) ? history.filter(h => ['SMS_SENT', 'SMS_RECEIVED', 'SMS_FAILED', 'EMAIL_SENT', 'EMAIL_RECEIVED'].includes(h.action)) : [];
                    
                    if (messages.length === 0) return null;
                    
                    return (
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-3" style={{ minWidth: 0 }}>
                        <div className="flex items-start space-x-3" style={{ minWidth: 0 }}>
                          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                            <FiMessageSquare className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {/* Sleek Message Preview */}
                            <>
                              {/* Header with counts */}
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Messages</p>
                                  <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full">
                                    {messages.length}
                                  </span>
                                </div>
                                {(() => {
                                  const hasSms = messages.some(m => m.action.startsWith('SMS'));
                                  const hasEmail = messages.some(m => m.action.startsWith('EMAIL'));
                                  return (
                                    <div className="flex items-center space-x-1">
                                      {hasSms && (
                                        <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                                          SMS
                                        </span>
                                      )}
                                      {hasEmail && (
                                        <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                                          Email
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            
                            {/* Latest message preview card */}
                            {(() => {
                              const latestMessage = messages[messages.length - 1];
                              const hasSms = messages.some(m => m.action.startsWith('SMS'));
                              const hasEmail = messages.some(m => m.action.startsWith('EMAIL'));
                              
                              return (
                                <>
                                  {/* Preview card */}
                                  <div 
                                    onClick={() => {
                                      setMessageModalChannel(hasSms && !hasEmail ? 'sms' : (hasEmail ? 'email' : 'sms'));
                                      setMessageModalOpen(true);
                                    }}
                                    className="cursor-pointer bg-white rounded-lg p-2 md:p-3 shadow-sm border border-blue-200 hover:border-blue-400 hover:shadow-md transition-all group w-full overflow-hidden"
                                    style={{ maxWidth: '100%', minWidth: 0 }}
                                  >
                                    <div className="flex items-start space-x-2 overflow-hidden">
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                        ['SMS_SENT', 'EMAIL_SENT'].includes(latestMessage.action) 
                                          ? 'bg-blue-100 text-blue-600' 
                                          : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {['SMS_SENT', 'EMAIL_SENT'].includes(latestMessage.action) ? (
                                          <span className="text-xs font-bold">Y</span>
                                        ) : (
                                          <FiUser className="w-3 h-3" />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0" style={{ maxWidth: 'calc(100% - 2rem)' }}>
                                        <div className="flex items-center space-x-2 mb-1 overflow-hidden">
                                          <span className="text-xs font-medium text-gray-700 truncate block max-w-[80px]">
                                            {['SMS_SENT', 'EMAIL_SENT'].includes(latestMessage.action) ? 'You' : selectedEvent.extendedProps?.lead?.name || 'Customer'}
                                          </span>
                                          <span className={`text-[10px] flex-shrink-0 ${
                                            latestMessage.action.startsWith('EMAIL') ? 'text-indigo-500' : 'text-blue-500'
                                          }`}>
                                            {latestMessage.action.startsWith('EMAIL') ? 'Email' : 'SMS'}
                                          </span>
                                        </div>
                                        <p 
                                          className="text-xs text-gray-600 group-hover:text-gray-800 transition-colors truncate block"
                                          style={{ 
                                            display: 'block',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            maxWidth: '100%'
                                          }}
                                        >
                                          {decodeEmailContent(latestMessage.details?.body || latestMessage.details?.message || 'No content')}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    {/* View all button */}
                                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
                                      <span className="text-xs text-gray-400">
                                        {(() => {
                                          try {
                                            if (!latestMessage.timestamp) return '';
                                            const date = new Date(latestMessage.timestamp);
                                            if (isNaN(date.getTime())) return '';
                                            const now = new Date();
                                            const diffHours = (now - date) / (1000 * 60 * 60);
                                            if (diffHours < 1) {
                                              const mins = Math.floor((now - date) / (1000 * 60));
                                              return mins <= 0 ? 'Just now' : `${mins}m ago`;
                                            } else if (diffHours < 24) {
                                              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                            } else {
                                              return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                            }
                                          } catch { return ''; }
                                        })()}
                                      </span>
                                      <span className="text-xs font-medium text-blue-600 group-hover:text-blue-700 flex items-center">
                                        View all messages
                                        <FiChevronRight className="w-3 h-3 ml-0.5" />
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Quick reply buttons */}
                                  <div className="mt-2 flex space-x-2">
                                    {selectedEvent.extendedProps?.lead?.phone && (
                                      <button
                                        onClick={() => {
                                          setMessageModalChannel('sms');
                                          setMessageModalOpen(true);
                                        }}
                                        className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors"
                                      >
                                        <FiMessageSquare className="w-3 h-3" />
                                        <span>Reply SMS</span>
                                      </button>
                                    )}
                                    {selectedEvent.extendedProps?.lead?.email && (
                                      <button
                                        onClick={() => {
                                          setMessageModalChannel('email');
                                          setMessageModalOpen(true);
                                        }}
                                        className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-indigo-500 text-white text-xs font-medium rounded-lg hover:bg-indigo-600 transition-colors"
                                      >
                                        <FiMail className="w-3 h-3" />
                                        <span>Reply Email</span>
                                      </button>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                            </>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  
                  {/* Notes */}
                  <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg p-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-500 flex items-center justify-center flex-shrink-0">
                        <FiFileText className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div 
                          className="flex items-center justify-between mb-1 cursor-pointer hover:bg-gray-100 -mx-2 px-2 py-1 rounded transition-colors"
                          onClick={() => !editingNotes && setShowNotes(!showNotes)}
                        >
                          <div className="flex items-center space-x-2">
                            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Notes</p>
                            {!editingNotes && (
                              showNotes ? (
                                <FiChevronUp className="h-4 w-4 text-gray-600" />
                              ) : (
                                <FiChevronDown className="h-4 w-4 text-gray-600" />
                              )
                            )}
                          </div>
                          {!editingNotes && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditNotes();
                              }}
                              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                            >
                              <FiEdit className="h-3 w-3" />
                              <span>Edit Notes</span>
                            </button>
                          )}
                        </div>
                        
                        {showNotes && (
                          <>
                            {editingNotes ? (
                              <div className="space-y-3">
                                <div className="relative">
                                  <textarea
                                    value={notesText}
                                    onChange={(e) => setNotesText(e.target.value)}
                                    rows="6"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none break-words"
                                    placeholder="Add detailed notes about this lead..."
                                    autoFocus
                                  />
                                  <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                                    {notesText.length} characters
                                  </div>
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="text-xs text-gray-500">
                                    All users can edit notes • Changes appear in booking history
                                  </div>
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={handleSaveNotes}
                                      disabled={updatingNotes}
                                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center space-x-1"
                                    >
                                      {updatingNotes ? (
                                        <>
                                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                          <span>Saving...</span>
                                        </>
                                      ) : (
                                        <>
                                          <FiCheck className="h-3 w-3" />
                                          <span>Save Notes</span>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      onClick={handleCancelNotes}
                                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm font-medium"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2">
                                {selectedEvent.extendedProps?.lead?.notes ? (
                                  <div className="max-h-64 overflow-y-auto">
                                    <p className="text-base text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
                                      {selectedEvent.extendedProps.lead.notes}
                                    </p>
                                    {/* Show who last updated the notes */}
                                    {(() => {
                                      const history = selectedEvent.extendedProps?.lead?.bookingHistory || 
                                                      selectedEvent.extendedProps?.lead?.booking_history || [];
                                      const notesEntries = history.filter(h => h.action === 'NOTES_UPDATED');
                                      const lastNoteEntry = notesEntries[notesEntries.length - 1];
                                      if (lastNoteEntry) {
                                        const updatedBy = lastNoteEntry.details?.updatedBy || 
                                                           lastNoteEntry.performedByName || 
                                                           lastNoteEntry.performed_by_name || 
                                                           lastNoteEntry.performedBy || 
                                                           lastNoteEntry.performed_by || 
                                                           'Unknown';
                                        const updatedAt = lastNoteEntry.timestamp ? 
                                          new Date(lastNoteEntry.timestamp).toLocaleString('en-GB', { 
                                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                                          }) : '';
                                        return (
                                          <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                                            <span>Last updated by <span className="font-medium text-gray-700">{updatedBy}</span></span>
                                            {updatedAt && <span>{updatedAt}</span>}
                                          </div>
                                        );
                                      }
                                      return (
                                        <div className="mt-2 text-xs text-gray-500">
                                          Click "Edit Notes" to modify
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <div className="text-center py-4">
                                    <p className="text-base text-gray-500 italic">No notes available</p>
                                    <p className="text-xs text-gray-400 mt-1">Click "Edit Notes" to add notes</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Sale Details if exists */}
                  {selectedSale && (
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="font-bold text-blue-700 mb-2">Sale Details</h4>
                      <div className="text-sm text-blue-900">
                        <div><b>Amount:</b> £{selectedSale.saleAmount}</div>
                        <div><b>Payment Method:</b> {selectedSale.paymentMethod}</div>
                        <div><b>Notes:</b> {selectedSale.notes || 'None'}</div>
                        <div><b>Recorded By:</b> {selectedSale.user?.name}</div>
                        <div><b>Date:</b> {new Date(selectedSale.bookingDate).toLocaleDateString()}</div>
                      </div>
                    </div>
                  )}

                  {/* Message History */}
                  {selectedEvent.extendedProps?.lead?.bookingHistory && Array.isArray(selectedEvent.extendedProps.lead.bookingHistory) && (() => {
                    const allMsgs = selectedEvent.extendedProps.lead.bookingHistory.filter(h => ['EMAIL_SENT','EMAIL_RECEIVED','SMS_SENT','SMS_RECEIVED'].includes(h.action));
                    if (allMsgs.length === 0) return null;
                    return (
                    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4 mt-4">
                      <div
                        className="flex items-center justify-between mb-2 cursor-pointer hover:bg-blue-100/50 -mx-2 px-2 py-1 rounded transition-colors"
                        onClick={() => setShowMessageHistory(!showMessageHistory)}
                      >
                        <div className="flex items-center space-x-2">
                          <h4 className="text-base font-bold text-blue-700">Message History</h4>
                          <span className="text-xs text-blue-500 bg-blue-200/50 px-1.5 py-0.5 rounded-full">{allMsgs.length}</span>
                          {showMessageHistory ? (
                            <FiChevronUp className="h-4 w-4 text-blue-700" />
                          ) : (
                            <FiChevronDown className="h-4 w-4 text-blue-700" />
                          )}
                        </div>
                      </div>
                      {showMessageHistory && (
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {allMsgs
                            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                            .map((h, idx) => (
                              <div key={idx} className="flex items-start space-x-2">
                                <div className="mt-0.5">
                                  {h.action.startsWith('EMAIL') ? (
                                    <FiMail className={`h-4 w-4 ${h.action === 'EMAIL_RECEIVED' ? 'text-green-600' : 'text-indigo-500'}`} />
                                  ) : (
                                    <FiMessageSquare className={`h-4 w-4 ${h.action === 'SMS_RECEIVED' ? 'text-green-500' : 'text-blue-500'}`} />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-gray-700 flex items-center flex-wrap gap-1">
                                    <span>
                                      {h.action === 'EMAIL_SENT' && 'Email Sent'}
                                      {h.action === 'EMAIL_RECEIVED' && 'Email Received'}
                                      {h.action === 'SMS_SENT' && 'SMS Sent'}
                                      {h.action === 'SMS_RECEIVED' && 'SMS Received'}
                                    </span>
                                    {/* Show who sent/received the message */}
                                    {(() => {
                                      const performerName = h.performedByName || 
                                        h.performed_by_name || 
                                        h.performedBy || 
                                        h.performed_by ||
                                        h.details?.sent_by_name ||
                                        h.details?.performedByName ||
                                        h.details?.performed_by_name;
                                      if (performerName) {
                                        return <span className="text-blue-600 font-medium">by {performerName}</span>;
                                      }
                                      return null;
                                    })()}
                                    <span className="text-gray-400 font-normal ml-auto">{new Date(h.timestamp).toLocaleString()}</span>
                                  </div>
                                  {h.details?.subject && (
                                    <div className="text-xs text-gray-500 truncate">Subject: {h.details.subject}</div>
                                  )}
                                  <div className="text-xs text-gray-600 truncate">{h.details?.body?.slice(0, 100)}{(h.details?.body?.length || 0) > 100 ? '...' : ''}</div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                    );
                  })()}
                </div>
              </div>

              {/* Photos Section - Show for admin, viewer, and photographer */}
              {(user?.role === 'admin' || user?.role === 'viewer' || user?.role === 'photographer') && selectedEvent.extendedProps?.lead?.id && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center">
                      <FiImage className="h-4 w-4 mr-2 text-indigo-600" />
                      Client Photos
                      {leadPhotos.length > 0 && (
                        <span className="ml-2 bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                          {leadPhotos.length}
                        </span>
                      )}
                    </h4>
                    {/* Upload button for photographers and admins */}
                    {(user?.role === 'photographer' || user?.role === 'admin') && (
                      <button
                        onClick={() => setShowUploadPanel(!showUploadPanel)}
                        className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          showUploadPanel
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                        }`}
                      >
                        <FiUpload className="h-3.5 w-3.5" />
                        <span>{showUploadPanel ? 'Close' : 'Upload'}</span>
                      </button>
                    )}
                  </div>

                  {/* Upload Panel - for photographers */}
                  {showUploadPanel && (user?.role === 'photographer' || user?.role === 'admin') && (
                    <div className="mb-4">
                      {/* Folder Selection - show first if no folder selected */}
                      {!selectedUploadFolder && !uploading ? (
                        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-4">
                          <h5 className="text-sm font-semibold text-gray-700 text-center mb-3">
                            Select Folder for Photos
                          </h5>
                          <div className="grid grid-cols-2 gap-2">
                            {PHOTO_FOLDERS.map((folder) => (
                              <button
                                key={folder.id}
                                onClick={() => setSelectedUploadFolder(folder.id)}
                                className="flex items-center justify-center space-x-2 px-3 py-3 bg-white border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all text-sm font-medium text-gray-700 hover:text-indigo-700"
                              >
                                <span className="text-lg">{folder.icon}</span>
                                <span>{folder.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Upload zone - show after folder is selected */
                        <div>
                          {/* Selected folder indicator */}
                          {selectedUploadFolder && !uploading && (
                            <div className="flex items-center justify-between mb-2 px-2">
                              <span className="text-sm text-gray-600">
                                Uploading to: <span className="font-semibold text-indigo-700">
                                  {PHOTO_FOLDERS.find(f => f.id === selectedUploadFolder)?.icon}{' '}
                                  {PHOTO_FOLDERS.find(f => f.id === selectedUploadFolder)?.label}
                                </span>
                              </span>
                              <button
                                onClick={() => setSelectedUploadFolder(null)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                              >
                                Change
                              </button>
                            </div>
                          )}
                          <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                              dragActive
                                ? 'border-indigo-500 bg-indigo-50'
                                : 'border-gray-300 bg-gray-50 hover:border-indigo-400'
                            }`}
                          >
                            {uploading ? (
                              <div className="space-y-3 py-2">
                                {/* Upload icon with pulse */}
                                <div className="relative mx-auto w-12 h-12">
                                  <FiCamera className="h-12 w-12 text-indigo-600" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                  </div>
                                </div>

                                {/* File count */}
                                <div className="text-center">
                                  <p className="text-lg font-semibold text-indigo-700">
                                    Uploading {uploadDetails.current} of {uploadDetails.total}
                                  </p>
                                  {uploadDetails.currentFileName && (
                                    <p className="text-xs text-gray-500 mt-1 font-mono">
                                      {uploadDetails.currentFileName}
                                    </p>
                                  )}
                                </div>

                                {/* Progress bar */}
                                <div className="w-full">
                                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>{uploadProgress}% complete</span>
                                    <span>{uploadDetails.total - uploadDetails.current} remaining</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                                      style={{
                                        width: `${uploadProgress}%`,
                                        background: 'linear-gradient(90deg, #4F46E5, #7C3AED)'
                                      }}
                                    >
                                      {/* Animated stripes */}
                                      <div
                                        className="absolute inset-0 opacity-30"
                                        style={{
                                          backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)',
                                          backgroundSize: '1rem 1rem',
                                          animation: 'progress-stripes 1s linear infinite'
                                        }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>

                                <p className="text-xs text-gray-400 text-center">
                                  Please don't close this window
                                </p>
                              </div>
                            ) : (
                              <>
                                <FiUpload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                                <p className="text-sm text-gray-600 mb-1">
                                  Drag & drop photos here
                                </p>
                                <p className="text-xs text-gray-500 mb-3">
                                  or click to select files
                                </p>
                                <input
                                  type="file"
                                  ref={uploadInputRef}
                                  multiple
                                  accept="image/*,video/*"
                                  onChange={(e) => handlePhotoUpload(e.target.files)}
                                  className="hidden"
                                />
                                <button
                                  onClick={() => uploadInputRef.current?.click()}
                                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                  Select Photos
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Photo Grid - Optimized with progressive loading */}
                  {loadingPhotos ? (
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                      <p className="text-gray-500 text-sm">Loading photos...</p>
                    </div>
                  ) : totalPhotoCount > 0 || leadPhotos.length > 0 || galleryFolderFilter !== 'all' ? (
                    <div className="flex gap-3">
                      {/* Folder Filter Sidebar */}
                      <div className="w-20 flex-shrink-0 space-y-1">
                        <button
                          onClick={() => setGalleryFolderFilter('all')}
                          className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-left ${
                            galleryFolderFilter === 'all'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Full Shoot
                        </button>
                        {PHOTO_FOLDERS.map((folder) => (
                          <button
                            key={folder.id}
                            onClick={() => setGalleryFolderFilter(folder.id)}
                            className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-left ${
                              galleryFolderFilter === folder.id
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            <span className="mr-1">{folder.icon}</span>
                            <span className="truncate">{folder.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Photo Grid Content */}
                      <div className="flex-1 min-w-0">
                        {leadPhotos.length > 0 ? (
                          <>
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                              {leadPhotos.map((photo) => {
                                const imageUrl = photo.cloudinary_secure_url || photo.cloudinary_url;

                                return (
                                  <div
                                    key={photo.id}
                                    className="relative group cursor-pointer rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-400 transition-all bg-gray-100"
                                    style={{ aspectRatio: '1' }}
                                    onClick={() => setLightboxImage(imageUrl)}
                                  >
                                    {/* Progressive loading with OptimizedImage (same as Photographer page) */}
                                    <OptimizedImage
                                      src={imageUrl}
                                      alt={photo.description || 'Client photo'}
                                      size="thumb" // Small thumbnails for grid (100x100)
                                      className="w-full h-full object-cover"
                                      useBlur={true} // Enable blur placeholder
                                      threshold={100} // Start loading 100px before viewport
                                      onError={(e) => {
                                        // Safely handle error
                                        if (e && e.target && e.target.style) {
                                          e.target.style.opacity = '0.3';
                                        }
                                      }}
                                    />
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center z-10 pointer-events-none">
                                      <FiImage className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    {/* Delete button - for admin, viewer, and photographer */}
                                    {(user?.role === 'admin' || user?.role === 'viewer' || user?.role === 'photographer') && (
                                      <button
                                        onClick={(e) => handleDeletePhoto(photo.id, e)}
                                        className="absolute top-1 right-1 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-red-600 shadow-lg"
                                        title="Delete photo"
                                      >
                                        <FiTrash2 className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Load More button for pagination */}
                            {hasMorePhotos && (
                              <div className="mt-3 text-center">
                                <button
                                  onClick={loadMorePhotos}
                                  disabled={loadingMorePhotos}
                                  className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {loadingMorePhotos ? (
                                    <>
                                      <div className="animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full inline-block mr-2"></div>
                                      Loading...
                                    </>
                                  ) : (
                                    `Load More Photos (${leadPhotos.length} loaded)`
                                  )}
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="bg-gray-100 rounded-lg p-4 text-center">
                            <FiImage className="h-6 w-6 mx-auto text-gray-300 mb-2" />
                            <p className="text-gray-500 text-sm">No photos in this folder</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <FiImage className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500 text-sm">No photos uploaded yet</p>
                      {(user?.role === 'photographer' || user?.role === 'admin') && !showUploadPanel && (
                        <button
                          onClick={() => setShowUploadPanel(true)}
                          className="mt-2 text-indigo-600 text-sm hover:text-indigo-800"
                        >
                          Upload photos now
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Action Buttons */}
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                {/* Viewer Actions Row - View Gallery and Start Sale */}
                {(user?.role === 'viewer' || user?.role === 'admin') && leadPhotos.length > 0 && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setImageSelectionMode(false);
                        setShowPresentationGallery(true);
                      }}
                      className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all duration-300 shadow text-xs font-medium"
                    >
                      <FiImage className="h-4 w-4" />
                      <span>View Gallery ({totalPhotoCount || leadPhotos.length})</span>
                    </button>
                    <button
                      onClick={() => {
                        const leadId = selectedEvent?.extendedProps?.lead?.id;
                        // Load any previously saved selections from localStorage
                        const savedKey = `selectedPhotos_${leadId}`;
                        const savedSelection = localStorage.getItem(savedKey);
                        let initialPhotoIds = [];
                        if (savedSelection) {
                          try {
                            initialPhotoIds = JSON.parse(savedSelection);
                          } catch (e) {
                            console.warn('Failed to parse saved photo selection:', e);
                          }
                        }
                        // Start with image selection, then package selection
                        setSelectedPhotoIds(initialPhotoIds);
                        setSelectedPhotos([]);
                        setSelectedPackage(null);
                        setImageSelectionMode(true);
                        setShowPresentationGallery(true);
                      }}
                      className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all duration-300 shadow text-xs font-medium"
                    >
                      <FiCheckCircle className="h-4 w-4" />
                      <span>Start Sale</span>
                    </button>
                  </div>
                )}

                <div className="flex space-x-2">
                  {/* Reschedule Button - Available for all roles */}
                  {selectedEvent.extendedProps?.status !== 'Cancelled' && (
                    <button
                      onClick={() => handleRescheduleAppointment()}
                      className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-gradient-to-r from-orange-400 to-amber-400 text-white rounded-lg hover:from-orange-500 hover:to-amber-500 transition-all duration-300 shadow text-xs font-medium"
                    >
                      <FiClock className="h-4 w-4" />
                      <span>Reschedule</span>
                    </button>
                  )}

                  {/* View Lead Details Button - Hidden for viewers */}
                  {user?.role !== 'viewer' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigate(`/leads/${selectedEvent.id}`);
                      }}
                      className="flex-1 flex items-center justify-center space-x-1 px-3 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-all duration-300 shadow text-xs font-medium"
                    >
                      <FiExternalLink className="h-4 w-4" />
                      <span>View Lead Details</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message Modal - Popup for SMS/Email conversation */}
      {messageModalOpen && selectedEvent?.extendedProps?.lead && (
        <CalendarMessageModal
          isOpen={messageModalOpen}
          onClose={() => setMessageModalOpen(false)}
          lead={selectedEvent.extendedProps.lead}
          initialChannel={messageModalChannel}
        />
      )}

      {/* Sale Modal (Legacy Quick Sale) */}
      {showSaleModal && selectedEvent && selectedEvent.extendedProps?.lead && (
        <SaleModal
          isOpen={showSaleModal}
          onClose={() => setShowSaleModal(false)}
          lead={selectedEvent.extendedProps.lead}
          existingSale={selectedSale}
          onSaveSuccess={() => {
            setShowSaleModal(false);
            closeEventModal();
            alert(selectedSale ? 'Sale updated successfully!' : 'Sale recorded successfully!');
            handleEventStatusChange('Attended');
            debouncedFetchEvents(); // Use debounced fetch to prevent race conditions
          }}
        />
      )}

      {/* Review Modal - Schedule a review appointment */}
      {showReviewModal && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center">
                <FiCalendar className="h-5 w-5 mr-2" />
                Schedule Review Appointment
              </h3>
              <p className="text-purple-100 text-sm mt-1">
                Keep the original slot and schedule a review date
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-800">Original Booking:</span>{' '}
                  {selectedEvent.extendedProps?.lead?.date_booked
                    ? new Date(selectedEvent.extendedProps.lead.date_booked).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short'
                      })
                    : 'N/A'}{' '}
                  at {selectedEvent.extendedProps?.lead?.time_booked || 'N/A'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Review Date
                </label>
                <input
                  type="date"
                  value={reviewDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setReviewDate(newDate);
                    setReviewTime(''); // Reset time when date changes
                    if (newDate) {
                      calculateAvailableReviewSlots(newDate);
                    } else {
                      setReviewAvailableSlots([]);
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  min={toLocalDateStr(new Date())}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Review Time {reviewSlotsLoading && <span className="text-purple-500">(Loading...)</span>}
                </label>
                <select
                  value={reviewTime}
                  onChange={(e) => setReviewTime(e.target.value)}
                  disabled={!reviewDate || reviewSlotsLoading}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {!reviewDate
                      ? 'Select a date first'
                      : reviewSlotsLoading
                        ? 'Loading available slots...'
                        : reviewAvailableSlots.length === 0
                          ? 'No available slots'
                          : 'Select an available time'}
                  </option>
                  {reviewAvailableSlots.map((slot, idx) => (
                    <option key={`${slot.time}-${slot.slot}-${idx}`} value={`${slot.time}|${slot.slot}`}>
                      {slot.label} (Slot {slot.slot})
                    </option>
                  ))}
                </select>
                {reviewDate && !reviewSlotsLoading && reviewAvailableSlots.length === 0 && (
                  <p className="text-sm text-red-500 mt-1">No available slots on this date. Please select another date.</p>
                )}
                {reviewDate && !reviewSlotsLoading && reviewAvailableSlots.length > 0 && (
                  <p className="text-sm text-green-600 mt-1">{reviewAvailableSlots.length} slot(s) available</p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  setReviewDate('');
                  setReviewTime('');
                  setReviewAvailableSlots([]);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!reviewDate || !reviewTime) {
                    alert('Please select both a date and time for the review.');
                    return;
                  }
                  try {
                    const leadId = selectedEvent.extendedProps?.lead?.id;
                    // Parse time and slot from the combined value
                    const [time, slot] = reviewTime.split('|');
                    // Exclude transient computed fields that don't exist in the database schema
                    const { 
                      has_received_email, has_received_sms, has_unread_email, has_unread_sms,
                      hasReceivedEmail, hasReceivedSms, hasUnreadEmail, hasUnreadSms,
                      ...leadData 
                    } = selectedEvent.extendedProps.lead;
                    // Update lead with review date/time and set status to Review
                    await axios.put(`/api/leads/${leadId}`, {
                      ...leadData,
                      review_date: reviewDate,
                      review_time: time,
                      review_slot: parseInt(slot),
                      booking_status: 'Review'
                    });
                    // Close modal and update UI
                    setShowReviewModal(false);
                    setReviewDate('');
                    setReviewTime('');
                    setReviewAvailableSlots([]);
                    handleEventStatusChange('Review');
                    // Force-refresh so the new review appointment becomes visible on its
                    // own date (a non-force fetch early-returns due to the ALL_BOOKINGS cache).
                    // The review PUT (which sets review_date + booking_status='Review') has
                    // already resolved above, so a short delay feels immediate.
                    setTimeout(() => {
                      if (fetchEventsRef.current) fetchEventsRef.current(true);
                    }, 400);
                    alert(`Review scheduled for ${new Date(reviewDate).toLocaleDateString('en-GB')} at ${time} (Slot ${slot})`);
                  } catch (error) {
                    console.error('Error scheduling review:', error);
                    alert('Failed to schedule review. Please try again.');
                  }
                }}
                disabled={!reviewDate || !reviewTime || reviewSlotsLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Schedule Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Package Selection Modal (New Complete Flow) */}
      {showPackageModal && selectedEvent && selectedEvent.extendedProps?.lead && (
        <PackageSelectionModal
          isOpen={showPackageModal}
          onClose={() => {
            setShowPackageModal(false);
            // Don't clear package if photos are selected (user might come back)
            if (selectedPhotoIds.length === 0) {
              setSelectedPackage(null);
            }
          }}
          lead={selectedEvent.extendedProps.lead}
          selectedPhotoCount={selectedPhotoIds.length}
          selectedPhotoIds={selectedPhotoIds}
          initialPackage={selectedPackage}
          onTrimSelection={() => {
            // Go back to gallery to adjust selection
            setShowPackageModal(false);
            setImageSelectionMode(true);
            setShowPresentationGallery(true);
          }}
          onPackageSelected={(pkg) => {
            // Store selected package and open gallery for image selection
            setSelectedPackage(pkg);
            setShowPackageModal(false);
            setImageSelectionMode(true);
            setShowPresentationGallery(true);
          }}
          onChangeImages={(pkg) => {
            // Go back to gallery to change images (keep the package)
            setSelectedPackage(pkg);
            setShowPackageModal(false);
            setImageSelectionMode(true);
            setShowPresentationGallery(true);
          }}
          onSendContract={(data) => {
            // Store the package and invoice data for the contract
            setSelectedPackage(data.package);
            setContractInvoiceData({
              subtotal: data.totals.subtotal,
              vatAmount: data.totals.vatAmount,
              total: data.totals.total
            });
            setShowPackageModal(false);
            setContractLead(selectedEvent?.extendedProps?.lead); // Capture lead independently
            setShowContractModal(true);
          }}
        />
      )}

      {/* Presentation Gallery - For viewing and selecting photos */}
      {showPresentationGallery && selectedEvent?.extendedProps?.lead && (
        <PresentationGallery
          isOpen={showPresentationGallery}
          onClose={() => {
            setShowPresentationGallery(false);
            setImageSelectionMode(false);
          }}
          photos={leadPhotos}
          leadId={selectedEvent.extendedProps.lead.id}
          leadName={selectedEvent.extendedProps.lead.name || 'Client'}
          initialSelectedIds={selectedPhotoIds}
          imageLimit={selectedPackage?.imageCount ?? selectedPackage?.image_count}
          selectionMode={imageSelectionMode}
          onDeletePhoto={(user?.role === 'admin' || user?.role === 'viewer' || user?.role === 'photographer') ? handleDeletePhoto : null}
          onProceedToPackage={(photoIds, photos) => {
            setSelectedPhotoIds(photoIds);
            setSelectedPhotos(photos);
            // Persist selection to localStorage
            const leadId = selectedEvent?.extendedProps?.lead?.id;
            if (leadId && photoIds.length > 0) {
              localStorage.setItem(`selectedPhotos_${leadId}`, JSON.stringify(photoIds));
            }
            setShowPresentationGallery(false);
            if (imageSelectionMode && selectedPackage) {
              // Already have package selected, proceed to invoice
              setShowPackageModal(true);
            } else {
              // No package yet, open package selection
              setShowPackageModal(true);
            }
          }}
        />
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && currentInvoice && (
        <InvoiceModal
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          invoice={currentInvoice}
          lead={selectedEvent?.extendedProps?.lead}
          onPaymentRecorded={(updatedInvoice) => {
            setCurrentInvoice(updatedInvoice);
          }}
          onSignatureSaved={(updatedInvoice) => {
            setCurrentInvoice(updatedInvoice);
          }}
          onComplete={(completedInvoice) => {
            setCurrentInvoice(completedInvoice);
            setShowInvoiceModal(false);
            closeEventModal();
            alert('Sale completed successfully!');
            handleEventStatusChange('Attended');
            debouncedFetchEvents();
          }}
        />
      )}

      {/* Send Invoice Modal - uses contractLead so it never unmounts from selectedEvent changes */}
      {showContractModal && contractLead && selectedPackage && (
        <SendContractModal
          isOpen={showContractModal}
          onClose={() => {
            setShowContractModal(false);
            setContractLead(null);
            setContractInvoiceData(null);
          }}
          lead={contractLead}
          packageData={selectedPackage}
          invoiceData={contractInvoiceData}
          selectedPhotoIds={selectedPhotoIds}
          onContractSent={(contract) => {
            console.log('Contract sent:', contract);
            // Clear saved photo selection from localStorage since contract is now sent
            const leadId = contractLead?.id;
            if (leadId) {
              localStorage.removeItem(`selectedPhotos_${leadId}`);
            }
            // Optionally close other modals and show success
          }}
          onBackToPackages={() => {
            // Close contract modal and go back to package selection
            setShowContractModal(false);
            setContractLead(null);
            setContractInvoiceData(null);
            setShowPackageModal(true);
          }}
          onBackToPhotos={() => {
            // Close contract modal and go back to photo selection
            setShowContractModal(false);
            setContractLead(null);
            setContractInvoiceData(null);
            setImageSelectionMode(true);
            setShowPresentationGallery(true);
          }}
        />
      )}

      {/* Reject Lead Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Reject Lead</h2>
            <label className="block mb-2 font-medium">Reason:</label>
            <select
              className="w-full border rounded px-3 py-2 mb-4"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            >
              <option value="Duplicate">Duplicate</option>
              <option value="Already Booked">Already Booked</option>
              <option value="Far South">Far South</option>
              <option value="Photo">Photo</option>
              <option value="Not Interested">Not Interested</option>
              <option value="Wrong Number">Wrong Number</option>
              <option value="Other">Other</option>
            </select>
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                onClick={() => setShowRejectModal(false)}
                disabled={rejecting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                disabled={rejecting}
                onClick={handleConfirmReject}
              >
                {rejecting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage}
          alt={selectedEvent?.extendedProps?.lead?.name || 'Lead Photo'}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
};

export default Calendar; 