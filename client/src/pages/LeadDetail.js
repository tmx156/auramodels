import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiEdit, FiSave, FiPhone, FiMail, FiMapPin, FiCalendar, FiMessageSquare, FiSend, FiChevronLeft, FiChevronRight, FiChevronUp, FiChevronDown, FiClock, FiUser, FiCheck, FiSettings, FiX, FiActivity } from 'react-icons/fi';
import axios from 'axios';
import LeadStatusDropdown from '../components/LeadStatusDropdown';
import PhotoModal from '../components/PhotoModal';
import LazyImage from '../components/LazyImage';
import { getOptimizedImageUrl, preloadImages, clearImageQueue, loadImageWithPriority } from '../utils/imageUtils';
import { getCurrentUKTime } from '../utils/timeUtils';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
// import SalesApeButton from '../components/SalesApeButton'; // DISABLED
// import SalesApeStatus from '../components/SalesApeStatus'; // DISABLED
import ReplyDeskButton from '../components/ReplyDeskButton';
import ImageGalleryModal from '../components/ImageGalleryModal';
import PresentationGallery from '../components/PresentationGallery';
import GmailEmailRenderer from '../components/GmailEmailRenderer';
import { Image, FileText, Presentation } from 'lucide-react';

const LeadDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({});

  // Navigation state
  const [allLeads, setAllLeads] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigationLoading, setNavigationLoading] = useState(false);
  
  // Filter context from navigation state
  const [filterContext, setFilterContext] = useState({
    statusFilter: 'all',
    searchTerm: '',
    filteredLeads: [],
    dateFilter: 'all',
    customDateStart: '',
    customDateEnd: '',
    assigned_at_start: null,
    assigned_at_end: null
  });

  // SMS & Email templates state (for Messages section)
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState('');
  const [smsTemplates, setSmsTemplates] = useState([]);
  const [emailTemplates, setEmailTemplates] = useState([]);

  // Photo modal state
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  // Image Gallery modal state
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [leadPhotos, setLeadPhotos] = useState([]);

  // Presentation Gallery state (for viewer flow)
  const [showPresentationGallery, setShowPresentationGallery] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [imageSelectionMode, setImageSelectionMode] = useState(false);


  // Reschedule modal state (kept for potential future use)
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  // Image preloading state
  const [preloadedImages, setPreloadedImages] = useState(new Set());

  // Sale state
  const [sale, setSale] = useState(null);

  // Booking history state
  const [bookingHistory, setBookingHistory] = useState([]);
  // Upcoming callbacks state
  const [upcomingCallbacks, setUpcomingCallbacks] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Messages conversation state
  const [messagesExpanded, setMessagesExpanded] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [newReply, setNewReply] = useState('');
  const [replyMode, setReplyMode] = useState('sms'); // 'sms' or 'email'
  
  // Auto-resize textarea function
  const autoResizeTextarea = (textarea) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 500) + 'px'; // Max height 500px
    }
  };

  // Add state for reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('Duplicated');
  const [rejecting, setRejecting] = useState(false);
  
  // Add state for status change (for bookers)
  const [changingStatus, setChangingStatus] = useState(false);

  // Fallback templates for when API is unavailable
  const fallbackSmsTemplates = [
    { _id: 'welcome', name: 'Welcome Message', message: "Hi [NAME], thanks for your interest! We'll contact you shortly to confirm your photoshoot booking." },
    { _id: 'reminder', name: 'Reminder Message', message: "Hi [NAME], just a reminder about your modelling photoshoot on [DATE] at [TIME]." },
    { _id: 'followup', name: 'Follow-up Message', message: "Hi [NAME], we noticed you haven't confirmed your session. Let us know if you're still interested!" }
  ];

  const fallbackEmailTemplates = [
    { 
      _id: 'welcome', 
      name: 'Welcome Email',
      subject: "Welcome to our Modelling Studio - [NAME]",
      message: "Dear [NAME],\n\nThank you for your interest in our modelling services! We're excited to work with you.\n\nWe'll be in touch shortly to confirm your photoshoot booking and discuss the details.\n\nIf you have any questions in the meantime, please don't hesitate to reach out.\n\nBest regards,\nThe Studio Team"
    },
    { 
      _id: 'reminder', 
      name: 'Reminder Email',
      subject: "Reminder: Your Photoshoot on [DATE]",
      message: "Dear [NAME],\n\nThis is a friendly reminder about your upcoming modelling photoshoot scheduled for [DATE] at [TIME].\n\nPlease ensure you arrive 15 minutes early and bring any items we discussed.\n\nLooking forward to working with you!\n\nBest regards,\nThe Studio Team"
    },
    { 
      _id: 'followup', 
      name: 'Follow-up Email',
      subject: "Following up on your Modelling Session - [NAME]", 
      message: "Dear [NAME],\n\nWe noticed that you haven't confirmed your modelling session yet.\n\nWe're still very interested in working with you and would love to schedule your photoshoot.\n\nPlease let us know if you're still interested or if you have any questions.\n\nBest regards,\nThe Studio Team"
    },
    { 
      _id: 'booking_confirmation', 
      name: 'Booking Confirmation',
      subject: "Booking Confirmed - Your Photoshoot on [DATE]",
      message: "Dear [NAME],\n\nGreat news! Your photoshoot has been confirmed for [DATE] at [TIME].\n\nLocation: Our Studio\nDuration: Approximately 2 hours\n\nPlease bring:\n- A variety of outfits\n- Any specific props or accessories\n- A positive attitude!\n\nWe can't wait to work with you!\n\nBest regards,\nThe Studio Team"
    }
  ];

  // Utility to group templates by category (Bookers Templates)
  const categorizeTemplates = (templates) => {
    const categories = {
      'No Answer Templates': ['no_answer'],
      'Invitation Templates': ['invitation_email'],
    };
    const grouped = { 'No Answer Templates': [], 'Invitation Templates': [] };
    templates.forEach(t => {
      let found = false;
      for (const [cat, types] of Object.entries(categories)) {
        if (types.includes(t.type)) {
          grouped[cat].push(t);
          found = true;
          break;
        }
      }
      if (!found) grouped['Invitation Templates'].push(t); // Default to Invitation Templates if unknown
    });
    return grouped;
  };

  // Show only Bookers Templates (matching BookersTemplates page)
  const isLeadTemplate = (t) => [
    'no_answer',
    'invitation_email'
  ].includes(t.type);

  // Preload adjacent lead images for smooth navigation
  const preloadAdjacentImages = useCallback(async () => {
    if (allLeads.length <= 1) return;

    const currentLeadIndex = currentIndex;
    const adjacentLeads = [];
    
    // Get previous and next leads
    if (currentLeadIndex > 0) {
      adjacentLeads.push(allLeads[currentLeadIndex - 1]);
    }
    if (currentLeadIndex < allLeads.length - 1) {
      adjacentLeads.push(allLeads[currentLeadIndex + 1]);
    }

    // Get optimized image URLs for adjacent leads
    const imageUrls = adjacentLeads
      .map(lead => lead.image_url)
      .filter(url => url && url !== '')
      .map(url => getOptimizedImageUrl(url, 'optimized'));

    if (imageUrls.length === 0) return;

    try {
      console.log('🖼️ Preloading adjacent lead images:', imageUrls);
      await preloadImages(imageUrls);
      
      // Mark images as preloaded
      setPreloadedImages(prev => {
        const newSet = new Set(prev);
        imageUrls.forEach(url => newSet.add(url));
        return newSet;
      });
    } catch (error) {
      console.warn('⚠️ Failed to preload some images:', error);
    }
  }, [allLeads, currentIndex]);

  // Define fetchAllLeads before it's used in useEffect
  const fetchAllLeads = useCallback(async () => {
    try {
      const statusFilter = location.state?.statusFilter || filterContext.statusFilter;
      const searchTerm = location.state?.searchTerm || filterContext.searchTerm;
      const assigned_at_start = location.state?.assigned_at_start || filterContext.assigned_at_start;
      const assigned_at_end = location.state?.assigned_at_end || filterContext.assigned_at_end;
      const booked_at_start = location.state?.booked_at_start || filterContext.booked_at_start;
      const booked_at_end = location.state?.booked_at_end || filterContext.booked_at_end;
      const date_booked_start = location.state?.date_booked_start || filterContext.date_booked_start;
      const date_booked_end = location.state?.date_booked_end || filterContext.date_booked_end;
      const created_at_start = location.state?.created_at_start || filterContext.created_at_start;
      const created_at_end = location.state?.created_at_end || filterContext.created_at_end;
      const status_changed_at_start = location.state?.status_changed_at_start || filterContext.status_changed_at_start;
      const status_changed_at_end = location.state?.status_changed_at_end || filterContext.status_changed_at_end;

      // Use leads from navigation state if available
      const filteredLeadsFromState = location.state?.filteredLeads || filterContext.filteredLeads;
      let leadsToUse;

      if (filteredLeadsFromState?.length > 0) {
        leadsToUse = filteredLeadsFromState;
      } else {
        // Fetch all matching leads in a single request for navigation
        const params = { page: 1, limit: 2000, nav: 'true' };
        if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
        if (searchTerm) params.search = searchTerm;
        if (assigned_at_start && assigned_at_end) {
          params.assigned_at_start = assigned_at_start;
          params.assigned_at_end = assigned_at_end;
        }
        if (booked_at_start && booked_at_end) {
          params.booked_at_start = booked_at_start;
          params.booked_at_end = booked_at_end;
        }
        if (date_booked_start && date_booked_end) {
          params.date_booked_start = date_booked_start;
          params.date_booked_end = date_booked_end;
        }
        if (created_at_start && created_at_end) {
          params.created_at_start = created_at_start;
          params.created_at_end = created_at_end;
        }
        if (status_changed_at_start && status_changed_at_end) {
          params.status_changed_at_start = status_changed_at_start;
          params.status_changed_at_end = status_changed_at_end;
        }
        const response = await axios.get('/api/leads', { params });
        leadsToUse = response.data.leads || response.data || [];
      }
      setAllLeads(leadsToUse);

      // Update filterContext
      if (statusFilter !== filterContext.statusFilter || searchTerm !== filterContext.searchTerm || assigned_at_start !== filterContext.assigned_at_start) {
        setFilterContext(prev => ({
          ...prev,
          statusFilter: statusFilter || 'all',
          searchTerm: searchTerm || '',
          filteredLeads: leadsToUse,
          assigned_at_start: assigned_at_start || null,
          assigned_at_end: assigned_at_end || null
        }));
      }

      // Find current lead's position
      const index = leadsToUse.findIndex(lead =>
        lead.id === id ||
        lead.id.toString() === id ||
        lead.id === id.toString()
      );
      setCurrentIndex(index !== -1 ? index : 0);
    } catch (error) {
      console.error('Error fetching all leads:', error);
      setError('Failed to fetch leads. Please try again.');
      setAllLeads([]);
      setCurrentIndex(0);
    }
  }, [id, filterContext, location.state]);

  // Define all fetch functions before they're used in useEffect hooks
  const fetchTemplates = useCallback(async () => {
    try {
      // Fetch user-specific templates (bookersOnly=true means only their templates)
      const response = await axios.get('/api/templates?bookersOnly=true');
      const allTemplates = response.data.map(template => ({
        ...template,
        _id: template.id || template._id // Ensure _id field exists
      }));
      
      // Filter for Bookers Template types only
      const bookersTemplates = allTemplates.filter(isLeadTemplate);
      
      // Set both SMS and Email templates to the same filtered list
      // (templates can have both smsBody and emailBody)
      setSmsTemplates(bookersTemplates.filter(t => t.smsBody || t.sendSMS));
      setEmailTemplates(bookersTemplates.filter(t => t.emailBody || t.sendEmail));
    } catch (error) {
      console.error('Error fetching templates:', error);
      // Use fallback templates
      setSmsTemplates(fallbackSmsTemplates);
      setEmailTemplates(fallbackEmailTemplates);
    }
  }, []);

  const fetchLead = useCallback(async () => {
    if (!id) {
      console.log('⚠️ No ID provided for fetchLead');
      return;
    }

    console.log('📥 Fetching lead data for ID:', id);
    setLoading(true); // Always set loading when fetching

    try {
      const response = await axios.get(`/api/leads/${id}`);
      console.log('✅ Lead data fetched:', response.data.name);

      setLead(response.data);
      setFormData(response.data);
      setError(''); // Clear any previous errors
    } catch (error) {
      console.error('❌ Error fetching lead:', error);
      setError('Failed to fetch lead details. Please try again.');
      setLead(null);
      setFormData({});
    } finally {
      setLoading(false);
      setNavigationLoading(false); // Reset navigation loading when done
    }
  }, [id]);

  const fetchSale = useCallback(async () => {
    if (!id) return;
    try {
      const response = await axios.get(`/api/sales/by-lead/${id}`);
      setSale(response.data);
    } catch (error) {
      // Handle 404 gracefully - it's normal for leads without sales
      if (error.response?.status === 404 || error.response?.status === 200) {
        setSale(null); // No sale found
      } else {
        console.warn('⚠️ Error fetching sale:', error.message);
        setSale(null);
      }
    }
  }, [id]);

  const fetchBookingHistory = useCallback(async () => {
    if (!id) return;
    try {
      setHistoryLoading(true);
      const response = await axios.get(`/api/leads/${id}/history`);
      console.log('📋 Booking history fetched:', response.data.bookingHistory);
      // Log entries that don't have performer name for debugging
      const entriesWithoutPerformer = (response.data.bookingHistory || []).filter(entry => 
        !entry.performedByName && !entry.performed_by_name && !entry.performedBy && !entry.performed_by
      );
      if (entriesWithoutPerformer.length > 0) {
        console.log('⚠️ Entries without performer name:', entriesWithoutPerformer);
      }
      setBookingHistory(response.data.bookingHistory || []);
    } catch (error) {
      console.error('Error fetching booking history:', error);
      setBookingHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  const fetchUpcomingCallbacks = useCallback(async () => {
    if (!id) return;
    try {
      const response = await axios.get(`/api/leads/${id}/callbacks`);
      setUpcomingCallbacks(response.data || []);
    } catch (error) {
      console.error('Error fetching upcoming callbacks:', error);
      setUpcomingCallbacks([]);
    }
  }, [id]);

  // Fetch photos for this lead with pagination
  const fetchPhotos = useCallback(async () => {
    if (!id) return;
    try {
      // Limit to 50 photos initially (can be increased if needed)
      const response = await axios.get('/api/photos', {
        params: { 
          leadId: id,
          limit: 50, // Reasonable limit for detail view
          fields: 'minimal' // Only fetch needed fields
        }
      });
      if (response.data.success) {
        setLeadPhotos(response.data.photos || []);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
      setLeadPhotos([]);
    }
  }, [id]);

  const fetchConversationHistory = useCallback(async () => {
    if (!lead || !messagesExpanded) return;
    
    try {
      setConversationLoading(true);
      
      // Get conversation history from booking history
      if (lead.booking_history) {
        const history = typeof lead.booking_history === 'string' 
          ? JSON.parse(lead.booking_history) 
          : lead.booking_history;
        
        // Filter communication entries and sort by timestamp
        const communications = history
          .filter(entry => ['SMS_SENT', 'SMS_RECEIVED', 'EMAIL_SENT', 'EMAIL_RECEIVED'].includes(entry.action))
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        setConversationHistory(communications);
      } else {
        setConversationHistory([]);
      }
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      setConversationHistory([]);
    } finally {
      setConversationLoading(false);
    }
  }, [lead, messagesExpanded]);

  // Initialize component and handle navigation
  // Use useRef to track if we've initialized to prevent re-initialization on navigation
  const initializedRef = useRef(false);
  const locationStateRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastFetchedIdRef = useRef(null);

  // Reset initialization when navigating to a different lead (must run first)
  useEffect(() => {
    initializedRef.current = false;
    locationStateRef.current = null;
    isMountedRef.current = true;
    // Don't reset lastFetchedIdRef here - let the fetch effect handle it
  }, [id]);

  // Cleanup image queue on unmount (prevents stale image loads)
  useEffect(() => {
    return () => {
      clearImageQueue();
    };
  }, []);

  // Preload adjacent lead images for instant navigation (Netflix technique)
  useEffect(() => {
    if (allLeads.length > 0 && currentIndex >= 0) {
      // Preload previous lead's image
      if (currentIndex > 0) {
        const prevLead = allLeads[currentIndex - 1];
        if (prevLead?.image_url) {
          loadImageWithPriority(prevLead.image_url, 5).catch(() => {});
        }
      }
      // Preload next lead's image
      if (currentIndex < allLeads.length - 1) {
        const nextLead = allLeads[currentIndex + 1];
        if (nextLead?.image_url) {
          loadImageWithPriority(nextLead.image_url, 5).catch(() => {});
        }
      }
    }
  }, [allLeads, currentIndex]);

  // Handle route changes including browser back button
  useEffect(() => {
    // Only run if we're actually on the lead detail route (exact match)
    const isOnLeadDetailRoute = location.pathname === `/leads/${id}`;

    if (!id || !isOnLeadDetailRoute) {
      // If we're not on the lead detail route, reset initialization flag
      // This allows re-initialization when navigating back
      if (!isOnLeadDetailRoute) {
        initializedRef.current = false;
        locationStateRef.current = null;
        // Reset last fetched ID so component can re-fetch if navigated back to
        lastFetchedIdRef.current = null;
      }
      return;
    }

    // Check if location.state actually changed
    const currentStateStr = JSON.stringify(location.state);
    const previousStateStr = JSON.stringify(locationStateRef.current);
    const stateChanged = currentStateStr !== previousStateStr;

    // Only initialize once per route, or if location.state actually changed
    if (!initializedRef.current || stateChanged) {
      console.log('🔍 LeadDetail: Component initialized', { id, hasState: !!location.state });

      // Always try to set up navigation context
      if (location.state) {
        const { statusFilter, searchTerm, filteredLeads, dateFilter, customDateStart, customDateEnd, assigned_at_start, assigned_at_end } = location.state;
        console.log('🔍 LeadDetail: Setting up navigation context', { statusFilter, searchTerm, hasFilteredLeads: !!filteredLeads?.length, dateFilter, assigned_at_start, assigned_at_end });

        setFilterContext({
          statusFilter: statusFilter || 'all',
          searchTerm: searchTerm || '',
          filteredLeads: filteredLeads || [],
          dateFilter: dateFilter || 'all',
          customDateStart: customDateStart || '',
          customDateEnd: customDateEnd || '',
          assigned_at_start: assigned_at_start || null,
          assigned_at_end: assigned_at_end || null
        });

        if (filteredLeads && filteredLeads.length > 0) {
          setAllLeads(filteredLeads);
          const index = filteredLeads.findIndex(lead => lead.id === id);
          setCurrentIndex(index !== -1 ? index : 0);
          console.log('📍 LeadDetail: Navigation context ready, index:', index);
        }
      }

      initializedRef.current = true;
      locationStateRef.current = location.state;
    }
  }, [id, location.pathname, location.state, allLeads.length, fetchAllLeads]);

  // Fetch all leads for navigation if not provided via location.state
  useEffect(() => {
    if (allLeads.length === 0 && id) {
      console.log('📥 LeadDetail: Fetching leads for navigation (no state provided)');
      fetchAllLeads();
    }
  }, [id, allLeads.length, fetchAllLeads]);

  // Handle browser back/forward navigation - ensure component responds to route changes
  useEffect(() => {
    const handlePopState = () => {
      // When browser back/forward is used, reset refs to allow proper re-initialization
      console.log('🔙 Browser navigation detected, resetting refs');
      initializedRef.current = false;
      locationStateRef.current = null;
      // Don't reset lastFetchedIdRef - let the fetch effect handle it based on ID change
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Separate effect for initial data fetching - runs when ID changes
  useEffect(() => {
    // Only fetch if we haven't fetched this ID yet or if lead is null (page refresh)
    if (id && lastFetchedIdRef.current !== id) {
      console.log('📥 LeadDetail: Fetching initial data for lead:', id);
      lastFetchedIdRef.current = id;
      // Reset photo-related state to prevent cross-lead data mixing
      setSelectedPhotoIds([]);
      setSelectedPhotos([]);
      setLeadPhotos([]);
      fetchLead();
      fetchTemplates();
      fetchSale();
      fetchBookingHistory();
      fetchUpcomingCallbacks();
      fetchPhotos();
    }
  }, [id, fetchLead, fetchTemplates, fetchSale, fetchBookingHistory, fetchUpcomingCallbacks, fetchPhotos]);

  // Listen for real-time card_saved events
  useEffect(() => {
    if (!socket || !id) return;
    const handleCardSaved = (data) => {
      if (data.leadId === id) {
        // Update lead state with card info without full refetch
        setLead(prev => prev ? {
          ...prev,
          stripe_payment_method_id: data.paymentMethodId,
          stripe_customer_id: data.stripeCustomerId
        } : prev);
      }
    };
    socket.on('card_saved', handleCardSaved);
    return () => socket.off('card_saved', handleCardSaved);
  }, [socket, id]);

  // Handle lead list updates (navigation arrows)
  useEffect(() => {
    if (id && allLeads.length > 0) {
      // Update current index if lead exists in our list
      const leadIndex = allLeads.findIndex(lead => lead.id === id);
      if (leadIndex !== -1 && leadIndex !== currentIndex) {
        setCurrentIndex(leadIndex);
        console.log('🔄 LeadDetail: Updated index for existing lead:', leadIndex);
      }
    }
  }, [id, allLeads, currentIndex]);

  // Preload adjacent images when leads or current index changes
  useEffect(() => {
    if (allLeads.length > 0) {
      preloadAdjacentImages();
    }
  }, [allLeads, currentIndex, preloadAdjacentImages]);

  // Fetch conversation history when messages section is expanded
  useEffect(() => {
    if (messagesExpanded && lead) {
      fetchConversationHistory();
    }
  }, [messagesExpanded, lead, fetchConversationHistory]);

  // Auto-resize textarea when reply changes or mode changes
  useEffect(() => {
    if (newReply && messagesExpanded) {
      setTimeout(() => {
        const textarea = document.querySelector('textarea[placeholder*="reply"]');
        autoResizeTextarea(textarea);
      }, 0);
    }
  }, [newReply, replyMode, messagesExpanded]);

  // All fetch functions moved above to useCallback before useEffect hooks

  const handleSave = async () => {
    try {
      const oldNotes = lead.notes || '';
      const newNotes = formData.notes || '';

      const response = await axios.put(`/api/leads/${id}`, formData);
      // Use the server response data instead of local formData to ensure accuracy
      const updatedLead = response.data.lead || response.data;
      setLead(updatedLead);
      setFormData(updatedLead); // Also update formData to match server state
      setEditing(false);

      // Add to booking history if notes changed
      if (oldNotes !== newNotes) {
        await addHistoryEntry('NOTES_UPDATED', {
          oldNotes: oldNotes,
          newNotes: newNotes
        });

        // Set refresh trigger for Calendar
        localStorage.setItem('calendarRefreshTrigger', 'true');
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      // Don't update local state on error - keep original data
      alert('Failed to save changes. Please try again.');
    }
  };

  // Separate handler for saving notes - uses dedicated PATCH route that allows ALL users to edit notes
  const handleSaveNotes = async () => {
    try {
      const oldNotes = lead.notes || '';
      const newNotes = formData.notes || '';

      // Use the dedicated notes endpoint that allows all authenticated users to edit notes
      const response = await axios.patch(`/api/leads/${id}/notes`, {
        notes: newNotes,
        oldNotes: oldNotes
      });
      
      // Use the server response data
      const updatedLead = response.data.lead || response.data;
      setLead(updatedLead);
      setFormData(prev => ({
        ...prev,
        notes: updatedLead.notes || ''
      }));
      setEditing(false);

      // Booking history is already added by the backend endpoint
      // Set refresh trigger for Calendar
      localStorage.setItem('calendarRefreshTrigger', 'true');
    } catch (error) {
      console.error('Error updating notes:', error);
      const errorMessage = error.response?.data?.message || 'Failed to save notes. Please try again.';
      alert(errorMessage);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBookAppointment = () => {
    // Store lead data in localStorage for the calendar to pick up
    localStorage.setItem('bookingLead', JSON.stringify({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      postcode: lead.postcode,
      notes: lead.notes,
      image_url: lead.image_url,
      currentStatus: lead.status // Include current status for context
    }));
    
    // Navigate to calendar
    navigate('/calendar');
  };

  const navigateToCalendar = (booking) => {
    // Store booking data for calendar highlighting
    localStorage.setItem('highlightBooking', JSON.stringify({
      leadId: lead.id,
      leadName: lead.name,
      date: booking.date,
      type: booking.type,
      status: booking.status
    }));
    
    // Navigate to calendar
    navigate('/calendar');
  };

  // Navigation Functions
  const handlePreviousLead = () => {
    if (currentIndex > 0 && allLeads.length > 0) {
      const previousLead = allLeads[currentIndex - 1];
      console.log('⬅️ Navigating to previous lead:', previousLead.name, 'ID:', previousLead.id);

      setNavigationLoading(true);
      setLead(null); // Clear current lead to trigger loading state

      navigate(`/leads/${previousLead.id}`, {
        replace: true,
        state: {
          statusFilter: filterContext.statusFilter,
          searchTerm: filterContext.searchTerm,
          dateFilter: filterContext.dateFilter,
          customDateStart: filterContext.customDateStart,
          customDateEnd: filterContext.customDateEnd,
          assigned_at_start: filterContext.assigned_at_start,
          assigned_at_end: filterContext.assigned_at_end,
          currentPage: location.state?.currentPage || 1, // Preserve page
          filteredLeads: allLeads
        }
      });
    }
  };

  const handleNextLead = () => {
    if (currentIndex < allLeads.length - 1 && allLeads.length > 0) {
      const nextLead = allLeads[currentIndex + 1];
      console.log('➡️ Navigating to next lead:', nextLead.name, 'ID:', nextLead.id);

      setNavigationLoading(true);
      setLead(null); // Clear current lead to trigger loading state

      navigate(`/leads/${nextLead.id}`, {
        replace: true,
        state: {
          statusFilter: filterContext.statusFilter,
          searchTerm: filterContext.searchTerm,
          dateFilter: filterContext.dateFilter,
          customDateStart: filterContext.customDateStart,
          customDateEnd: filterContext.customDateEnd,
          assigned_at_start: filterContext.assigned_at_start,
          assigned_at_end: filterContext.assigned_at_end,
          currentPage: location.state?.currentPage || 1, // Preserve page
          filteredLeads: allLeads
        }
      });
    }
  };

  const canNavigatePrevious = () => {
    return currentIndex > 0 && allLeads.length > 0;
  };

  const canNavigateNext = () => {
    return currentIndex < allLeads.length - 1 && allLeads.length > 0;
  };

  // Template placeholder replacement
  const replacePlaceholders = (message) => {
    const defaultDate = new Date(lead.dateBooked).toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    const defaultTime = new Date(lead.dateBooked).toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    return message
      .replace(/\[NAME\]/g, lead.name)
      .replace(/\[DATE\]/g, defaultDate)
      .replace(/\[TIME\]/g, defaultTime);
  };

  const addHistoryEntry = async (action, details) => {
    try {
      await axios.post(`/api/leads/${id}/history`, {
        action,
        details,
        timestamp: new Date().toISOString()
      });
      // Refresh booking history
      fetchBookingHistory();
    } catch (error) {
      console.error('Error adding history entry:', error);
    }
  };

  // fetchConversationHistory moved above to useCallback before useEffect

  const handleSendQuickReply = async () => {
    if (!newReply.trim()) {
      alert('Please enter a reply message.');
      return;
    }
    
    try {
      if (replyMode === 'sms') {
        if (!lead.phone) {
          alert('This lead does not have a phone number.');
          return;
        }
        
        const response = await axios.post(`/api/leads/${lead.id}/send-sms`, {
          message: newReply,
          type: 'custom'
        });
        
        if (response.data.success) {
          alert(`SMS sent successfully to ${lead.phone}!`);
          
          // Add to booking history
          await addHistoryEntry('SMS_SENT', {
            recipient: lead.phone,
            message: newReply,
            template: 'Quick reply'
          });
          
          setNewReply('');
          // Refresh conversation
          setTimeout(() => fetchConversationHistory(), 1000);
        } else {
          alert(`Failed to send SMS: ${response.data.message}`);
        }
      } else {
        // Email reply
        if (!lead.email) {
          alert('This lead does not have an email address.');
          return;
        }
        
        // Parse subject and body from newReply if email template was used
        let emailSubject = 'Reply';
        let emailBody = newReply;
        
        // If template contained subject (first line before double newline)
        if (newReply.includes('\n\n')) {
          const parts = newReply.split('\n\n');
          if (parts[0].length < 100) { // First part is likely subject if short
            emailSubject = parts[0];
            emailBody = parts.slice(1).join('\n\n');
          }
        }
        
        const response = await axios.post(`/api/leads/${lead.id}/send-email`, {
          subject: emailSubject,
          body: emailBody
        });
        
        if (response.data.success) {
          alert(`Email sent successfully to ${lead.email}!`);
          
          setNewReply('');
          // Refresh conversation
          setTimeout(() => fetchConversationHistory(), 1000);
        } else {
          alert(`Failed to send email: ${response.data.message}`);
        }
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      alert(`Error sending reply: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleQuickStatusChange = async (newStatus) => {
    if (!window.confirm(`Are you sure you want to change ${lead.name}'s status to "${newStatus}"?`)) {
      return;
    }

    const oldStatus = lead.status;

    try {
      const response = await axios.put(`/api/leads/${lead.id}`, {
        ...lead,
        status: newStatus,
        booking_status: null // Clear any previous booking status (like 'Arrived') when changing main status
      });

      if (response.data.success || response.data.lead) {
        const updatedLead = response.data.lead || response.data;
        setLead(updatedLead);
        setFormData(updatedLead);
        
        // Emit real-time update for diary synchronization
        try {
          // Update diary stats if this is a booking status change
          if (newStatus === 'Booked' || oldStatus === 'Booked' || 
              newStatus === 'Attended' || oldStatus === 'Attended' ||
              newStatus === 'Cancelled' || oldStatus === 'Cancelled') {
            
            // Emit diary update
            await axios.post('/api/stats/diary-update', {
              leadId: lead.id,
              leadName: lead.name,
              oldStatus: oldStatus,
              newStatus: newStatus,
              dateBooked: lead.dateBooked,
              timestamp: new Date().toISOString()
            });
          }
        } catch (diaryError) {
          console.warn('Diary update failed:', diaryError);
          // Don't block the main operation if diary update fails
        }
        
        // Add to booking history
        await addHistoryEntry('STATUS_CHANGED', {
          oldStatus: oldStatus,
          newStatus: newStatus,
          reason: 'Manual status update'
        });
        
        // Show success message with visual feedback
        const statusEmoji = {
          'Booked': '📅',
          'Attended': '✅', 
          'Cancelled': '❌',
          'New': '🆕'
        };
        
        alert(`${statusEmoji[newStatus] || '✅'} Successfully updated ${lead.name}'s status to "${newStatus}"`);
        
        // Refresh the lead data
        fetchLead();
      }
    } catch (error) {
      console.error('Error updating lead status:', error);
      alert('Failed to update status. Please try again.');
    }
  };

  // Removed unused functions: handleCancelAppointment, handleRescheduleAppointment, handleRescheduleSubmit, handleNoAnswerIncrement

  const getStatusBadgeClass = (status) => {
    if (!status) return 'status-badge status-new';
    
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'new':
        return 'status-badge status-new';
      case 'assigned':
        return 'status-badge status-assigned';
      case 'contacted':
        return 'status-badge status-contacted';
      case 'booked':
        return 'status-badge status-booked';
      case 'confirmed':
        return 'status-badge status-confirmed';
      case 'attended':
        return 'status-badge status-attended';
      case 'cancelled':
        return 'status-badge status-cancelled';
      case 'no answer':
      case 'noanswer':
        return 'status-badge status-no-answer';
      case 'not interested':
      case 'notinterested':
        return 'status-badge status-not-interested';
      case 'sale':
      case 'sales/converted - purchased':
        return 'status-badge status-sale';
      case 'rejected':
        return 'status-badge status-rejected';
      case 'call back':
      case 'callback':
        return 'status-badge status-call-back';
      case 'left message':
      case 'leftmessage':
        return 'status-badge status-left-message';
      case 'not qualified':
      case 'notqualified':
        return 'status-badge status-not-qualified';
      case 'reschedule':
        return 'status-badge status-reschedule';
      case 'no show':
      case 'noshow':
        return 'status-badge status-no-show';
      case 'wrong number':
      case 'wrongnumber':
        return 'status-badge status-wrong-number';
      default:
        return 'status-badge status-new';
    }
  };

  // Format status display for booker users
  const formatStatusDisplay = (status) => {
    // Status display formatting (no longer needed for "Wants Email" as it's been removed)
    return status;
  };

  // Booker Status Dropdown Component (inline for booker users)
  const BookerStatusDropdown = ({ leadId, lead, onStatusUpdate }) => {
    const [selectedStatus, setSelectedStatus] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [showCallbackModal, setShowCallbackModal] = useState(false);
    const [callbackTime, setCallbackTime] = useState('');
    const [callbackNote, setCallbackNote] = useState('');
    const [pendingStatus, setPendingStatus] = useState(null);
    const [showNoAnswerModal, setShowNoAnswerModal] = useState(false);
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

    // Fetch current call_status from lead
    useEffect(() => {
      if (lead) {
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
        // Also check if lead has call_status directly
        if (lead.call_status) {
          callStatus = lead.call_status;
        }
        // If status is "Wrong number" but no call_status, set it
        if (!callStatus && lead.status === 'Wrong number') {
          callStatus = 'Wrong number';
        }
        setSelectedStatus(callStatus || '');
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

          // Map call_status to sidebar filter status
          // This ensures the lead appears in the correct folder when navigating back
          const statusToFilterMap = {
            'No answer': 'No answer',
            'No Answer x2': 'No answer',
            'No Answer x3': 'No answer',
            'Left Message': 'Left Message',
            'Not interested': 'Not interested',
            'Call back': 'Call back',
            'Wrong number': 'Wrong Number',
            'Sales/converted - purchased': 'Sales/converted - purchased',
            'Not Qualified': 'Not Qualified',
            'In Progress': 'In Progress'
          };

          const filterStatus = statusToFilterMap[status] || 'all';

          // Show success message
          const option = statusOptions.find(opt => opt.value === status);
          if (option) {
            switch (option.trigger) {
              case 'email':
                alert('Status updated. An automatic email will be sent to the client. Redirecting to leads page...');
                break;
              case 'close':
                alert('Status updated. This lead will be closed. Redirecting to leads page...');
                break;
              case 'callback':
                if (callbackTime) {
                  alert(`Status updated. Callback scheduled for ${callbackTime}. You'll receive a reminder notification. Redirecting to leads page...`);
                }
                break;
            }
          }

          // Navigate back to leads page with the appropriate status filter and preserved page
          // This "moves" the lead to the correct folder
          setTimeout(() => {
            // Ensure page is saved to sessionStorage for browser back button
            const pageToRestore = location.state?.currentPage || 
                                 parseInt(sessionStorage.getItem('leadsPage') || '1', 10);
            sessionStorage.setItem('leadsPage', pageToRestore.toString());
            
            navigate('/leads', { 
              state: { 
                statusFilter: filterStatus,
                currentPage: pageToRestore
              },
              replace: false 
            });
          }, 500); // Small delay to allow alert to be seen
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
        setCallbackTime('');
        setCallbackNote('');
      }
    };

    const handleCallbackSubmit = () => {
      if (!callbackTime) {
        setError('Please select a callback time');
        return;
      }
      updateStatus(pendingStatus, callbackTime, callbackNote);
    };

    // Get current time in UK timezone for default value
    const getCurrentUKTimeString = () => {
      const ukTime = getCurrentUKTime();
      const hours = String(ukTime.getHours()).padStart(2, '0');
      const minutes = String(ukTime.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    // Initialize callback time with current UK time
    useEffect(() => {
      if (showCallbackModal && !callbackTime) {
        setCallbackTime(getCurrentUKTimeString());
      }
    }, [showCallbackModal]);

    const getStatusColor = (status) => {
      switch (status) {
        case 'No answer':
        case 'No Answer x2':
        case 'No Answer x3':
        case 'Left Message':
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
      <div className="mt-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200 shadow-sm">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <FiChevronDown className="h-5 w-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">Lead Status</h3>
            <p className="text-sm text-gray-600">Select the status after placing a call</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

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
                    Callback Time (UK Time)
                  </label>
                  <input
                    type="time"
                    value={callbackTime || getCurrentUKTimeString()}
                    onChange={(e) => setCallbackTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    You'll receive a notification at this time to call back
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
                    disabled={loading || !callbackTime}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <FiClock className="h-4 w-4" />
                    <span>Schedule Callback</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowCallbackModal(false);
                      setPendingStatus(null);
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

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Removed unused handleNoAnswerIncrement function

  if (loading || navigationLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {navigationLoading ? 'Loading next lead...' : 'Loading lead details...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => {
            setError('');
            fetchLead();
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Lead not found</p>
        <button
          onClick={() => navigate('/leads', {
            state: { 
              statusFilter: filterContext.statusFilter,
              searchTerm: filterContext.searchTerm,
              currentPage: location.state?.currentPage || 1 // Preserve page from navigation state
            }
          })}
          className="mt-4 btn-primary"
        >
          Back to Leads
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="relative min-h-screen bg-gray-50">
        {/* NEW: Sale amount at the top */}
        {sale && sale.saleAmount !== undefined && (
          <div className="w-full flex justify-center items-center py-4">
            <div className="bg-green-100 border border-green-300 rounded-lg px-6 py-3 shadow text-2xl font-bold text-green-800">
              Amount Spent: £{Number(sale.saleAmount).toFixed(2)}
            </div>
          </div>
        )}
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  // Ensure page is saved to sessionStorage for browser back button
                  const pageToRestore = location.state?.currentPage || 
                                       parseInt(sessionStorage.getItem('leadsPage') || '1', 10);
                  sessionStorage.setItem('leadsPage', pageToRestore.toString());
                  
                  navigate('/leads', {
                  state: { 
                    statusFilter: filterContext.statusFilter,
                      searchTerm: filterContext.searchTerm,
                      currentPage: pageToRestore
                  }
                  });
                }}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600"
              >
                <FiArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-2xl font-semibold text-gray-900">Lead Details</h1>
              
              {/* Navigation Counter */}
              {allLeads.length > 0 && (
                <span className="text-sm text-gray-500">
                  {currentIndex + 1} of {allLeads.length}
                  {/* Debug info */}
                  <span className="ml-2 text-xs text-gray-400">
                    (filter: {filterContext.statusFilter}, search: "{filterContext.searchTerm}")
                  </span>
                </span>
              )}
            </div>
            
            {/* Navigation Arrows */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviousLead}
                disabled={!canNavigatePrevious() || navigationLoading}
                className={`p-2 rounded-md transition-colors relative ${
                  canNavigatePrevious() && !navigationLoading
                    ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    : 'text-gray-300 cursor-not-allowed'
                }`}
                title={`Previous Lead ${canNavigatePrevious() ? `(${allLeads[currentIndex - 1]?.name})` : '(none)'}`}
              >
                {navigationLoading && currentIndex > 0 ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                ) : (
                  <FiChevronLeft className="h-5 w-5" />
                )}
              </button>

              <button
                onClick={handleNextLead}
                disabled={!canNavigateNext() || navigationLoading}
                className={`p-2 rounded-md transition-colors relative ${
                  canNavigateNext() && !navigationLoading
                    ? 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                    : 'text-gray-300 cursor-not-allowed'
                }`}
                title={`Next Lead ${canNavigateNext() ? `(${allLeads[currentIndex + 1]?.name})` : '(none)'}`}
              >
                {navigationLoading && currentIndex < allLeads.length - 1 ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                ) : (
                  <FiChevronRight className="h-5 w-5" />
                )}
              </button>
            </div>

            <div className="flex items-center space-x-3">
              {!editing && (
                <button
                  onClick={() => handleBookAppointment()}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <FiCalendar className="h-4 w-4" />
                  <span>
                    {lead.status?.toLowerCase() === 'booked' ? 'Reschedule' : 'Book Appointment'}
                  </span>
                </button>
              )}
              {editing ? (
                <>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setFormData(lead);
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button onClick={handleSave} className="btn-primary flex items-center space-x-2">
                    <FiSave className="h-4 w-4" />
                    <span>Save</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="btn-primary flex items-center space-x-2"
                >
                  <FiEdit className="h-4 w-4" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column - Lead Information */}
            <div className="lg:col-span-3 space-y-6">
              {/* Basic Information */}
              <div className="card">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Name */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                        <FiUser className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-600 uppercase tracking-wide">Full Name</p>
                        {editing ? (
                          <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg font-bold text-gray-900"
                          />
                        ) : (
                          <p className="text-lg font-bold text-gray-900 mt-1">{lead.name}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Age */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
                        <FiUser className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-600 uppercase tracking-wide">Age</p>
                        {editing ? (
                          <input
                            type="number"
                            name="age"
                            value={formData.age || ''}
                            onChange={handleInputChange}
                            min="1"
                            max="120"
                            placeholder="Enter age"
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-bold text-gray-900"
                          />
                        ) : (
                          <p className="text-lg font-bold text-gray-900 mt-1">{lead.age ? `${lead.age} years old` : 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Gender */}
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0">
                        <FiUser className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-indigo-600 uppercase tracking-wide">Gender</p>
                        {editing ? (
                          <select
                            name="gender"
                            value={formData.gender || ''}
                            onChange={handleInputChange}
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg font-bold text-gray-900"
                          >
                            <option value="">Select gender</option>
                            <option value="Female">Female</option>
                            <option value="Male">Male</option>
                          </select>
                        ) : (
                          <p className="text-lg font-bold text-gray-900 mt-1">{lead.gender || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Entry Date */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl p-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
                        <FiCalendar className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-600 uppercase tracking-wide">Entry Date</p>
                        <p className="text-lg font-bold text-gray-900 mt-1">
                          {lead.entry_date ? new Date(lead.entry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="card">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Information</h3>
                <div className="space-y-6">
                  {/* Phone */}
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0">
                        <FiPhone className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className={`flex ${(lead.parent_phone || editing) ? 'gap-6' : ''}`}>
                          {/* Main Phone */}
                          <div className="flex-1">
                            <p className="text-sm font-medium text-purple-600 uppercase tracking-wide">Phone Number</p>
                            {editing ? (
                              <input
                                type="tel"
                                name="phone"
                                value={formData.phone}
                                onChange={handleInputChange}
                                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg font-bold text-gray-900"
                              />
                            ) : (
                              <p className="text-lg font-bold text-gray-900 mt-1">{lead.phone}</p>
                            )}
                            {!editing && (
                              <a href={`tel:${lead.phone}`} className="text-sm text-purple-600 hover:text-purple-800 transition-colors">
                                Click to call →
                              </a>
                            )}
                          </div>
                          {/* Parent Phone - shown only if exists */}
                          {(lead.parent_phone || editing) && (
                            <div className="flex-1">
                              <p className="text-sm font-medium text-purple-600 uppercase tracking-wide">Parent Phone</p>
                              {editing ? (
                                <input
                                  type="tel"
                                  name="parent_phone"
                                  value={formData.parent_phone || ''}
                                  onChange={handleInputChange}
                                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-lg font-bold text-gray-900"
                                  placeholder="Optional"
                                />
                              ) : (
                                <p className="text-lg font-bold text-gray-900 mt-1">{lead.parent_phone}</p>
                              )}
                              {!editing && lead.parent_phone && (
                                <a href={`tel:${lead.parent_phone}`} className="text-sm text-purple-600 hover:text-purple-800 transition-colors">
                                  Click to call →
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-xl p-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-pink-500 flex items-center justify-center flex-shrink-0">
                        <FiMail className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-pink-600 uppercase tracking-wide">Email Address</p>
                        {editing ? (
                          <input
                            type="email"
                            name="email"
                            value={formData.email || ''}
                            onChange={handleInputChange}
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-lg font-bold text-gray-900"
                          />
                        ) : (
                          <p className="text-lg font-bold text-gray-900 mt-1 break-all">{lead.email || 'N/A'}</p>
                        )}
                        {!editing && lead.email && (
                          <a href={`mailto:${lead.email}`} className="text-sm text-pink-600 hover:text-pink-800 transition-colors">
                            Send email →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Postcode */}
                  <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4">
                    <div className="flex items-start space-x-4">
                      <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                        <FiMapPin className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-orange-600 uppercase tracking-wide">Postcode</p>
                        {editing ? (
                          <input
                            type="text"
                            name="postcode"
                            value={formData.postcode}
                            onChange={handleInputChange}
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-lg font-bold text-gray-900"
                          />
                        ) : (
                          <p className="text-lg font-bold text-gray-900 mt-1">{lead.postcode}</p>
                        )}
                        {!editing && (
                          <a href={`https://maps.google.com/maps?q=${lead.postcode}`} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-600 hover:text-orange-800 transition-colors">
                            View on map →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>



              {/* Lead Status Dropdown */}
              {!editing && (
                <LeadStatusDropdown 
                  leadId={lead.id}
                  lead={lead}
                  onStatusUpdate={(status, result) => {
                    // Update the lead state with new call status
                    let customFields = {};
                    try {
                      if (lead.custom_fields) {
                        customFields = typeof lead.custom_fields === 'string' 
                          ? JSON.parse(lead.custom_fields) 
                          : lead.custom_fields;
                      }
                    } catch (e) {
                      customFields = {};
                    }
                    customFields.call_status = status;
                    setLead({ 
                      ...lead, 
                      custom_fields: JSON.stringify(customFields),
                      call_status: status // Also set for easy access
                    });
                    
                    // Show notification if email was sent
                    if (result?.workflowResult?.emailSent) {
                      alert(`Status updated to "${status}". ${result.workflowResult.emailMessage || 'Automatic email sent to client.'}`);
                    } else if (result?.workflowResult?.emailMessage && !result.workflowResult.emailSent) {
                      console.warn('Email workflow:', result.workflowResult.emailMessage);
                    }
                  }}
                />
              )}

              {/* Removed Image Upload section */}

              {/* Notes */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Notes</h3>
                  {!editing && (
                    <button
                      onClick={() => {
                        // Ensure formData.notes is initialized with current lead notes when entering edit mode
                        setFormData(prev => ({
                          ...prev,
                          notes: lead?.notes || ''
                        }));
                        setEditing(true);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-1 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                    >
                      <FiEdit className="h-3 w-3" />
                      <span>Edit Notes</span>
                    </button>
                  )}
                </div>
                
                {editing ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <textarea
                        name="notes"
                        rows="6"
                        value={formData.notes || ''}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none break-words"
                        placeholder="Add detailed notes about this lead..."
                        autoFocus
                      />
                      <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                        {(formData.notes || '').length} characters
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        All users can edit notes • Changes appear in booking history
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSaveNotes}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center space-x-1"
                        >
                          <FiCheck className="h-3 w-3" />
                          <span>Save Notes</span>
                        </button>
                        <button
                          onClick={() => {
                            // Reset formData.notes to original lead notes when canceling
                            setFormData(prev => ({
                              ...prev,
                              notes: lead?.notes || ''
                            }));
                            setEditing(false);
                          }}
                          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {lead.notes ? (
                      <div>
                        <div className="max-h-96 overflow-y-auto">
                          <p className="text-gray-900 whitespace-pre-wrap leading-relaxed break-words">
                            {lead.notes}
                          </p>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Click "Edit Notes" to modify
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-gray-500 italic">No notes available</p>
                        <p className="text-xs text-gray-400 mt-1">Click "Edit Notes" to add notes</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 📨 Messages Conversation Section */}
              {!editing && (
                <div className="card">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setMessagesExpanded(!messagesExpanded)}
                      className="flex items-center space-x-2 flex-1 text-left hover:bg-gray-50 p-2 -m-2 rounded-md transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <FiMessageSquare className="h-5 w-5 text-indigo-500" />
                        <h3 className="text-lg font-medium text-gray-900">📨 Messages</h3>
                        {conversationHistory.length > 0 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            {conversationHistory.length} messages
                          </span>
                        )}
                      </div>
                      {messagesExpanded ? (
                        <FiChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <FiChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </button>

                    {/* Templates Management Link */}
                    <button
                      onClick={() => navigate('/bookers-templates')}
                      className="ml-3 px-3 py-2 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-md flex items-center space-x-1 transition-colors border border-indigo-200"
                      title="Manage Bookers Templates - Create & edit templates for Lead Details"
                    >
                      <FiSettings className="h-4 w-4" />
                      <span>Manage Templates</span>
                    </button>
                  </div>
                  
                  {messagesExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      {/* Conversation History */}
                      <div className="max-h-80 overflow-y-auto bg-gray-50 rounded-lg p-4 mb-4">
                        {conversationLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                            <span className="ml-2 text-gray-500">Loading conversation...</span>
                          </div>
                        ) : conversationHistory.length === 0 ? (
                          <div className="text-center py-8 text-gray-500">
                            <FiMessageSquare className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                            <p>No conversation history</p>
                            <p className="text-sm mt-1">Messages will appear here when sent or received</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {conversationHistory.map((message, index) => (
                              <div 
                                key={`${message.timestamp}-${index}`}
                                className={`flex ${(['SMS_SENT', 'EMAIL_SENT'].includes(message.action)) ? 'justify-end' : 'justify-start'}`}
                              >
                                <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg shadow-sm overflow-hidden ${
                                  (['SMS_SENT', 'EMAIL_SENT'].includes(message.action))
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-white border text-gray-900'
                                }`}>
                                  {/* Message content */}
                                  {message.action.includes('EMAIL') && message.details?.subject && (
                                    <p className={`text-sm font-semibold mb-1 ${(['SMS_SENT', 'EMAIL_SENT'].includes(message.action)) ? 'text-white' : 'text-gray-900'}`}>
                                      {message.details.subject}
                                    </p>
                                  )}
                                  
                                  {/* Email content - use GmailEmailRenderer for HTML emails */}
                                  {message.action.includes('EMAIL') && (message.details?.email_body || message.details?.html_content) ? (
                                    <div className={`max-h-64 overflow-y-auto ${(['SMS_SENT', 'EMAIL_SENT'].includes(message.action)) ? 'email-sent' : 'email-received'}`}>
                                      <GmailEmailRenderer
                                        htmlContent={message.details?.email_body || message.details?.html_content}
                                        textContent={message.details?.body || message.details?.message}
                                        attachments={message.details?.attachments || []}
                                        embeddedImages={message.details?.embedded_images || []}
                                      />
                                    </div>
                                  ) : (
                                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                      {message.details?.body || message.details?.message || 'No content available'}
                                    </p>
                                  )}
                                  
                                  {/* Message metadata */}
                                  <div className="flex items-center justify-between mt-1">
                                    <p className={`text-xs ${
                                      (['SMS_SENT', 'EMAIL_SENT'].includes(message.action)) ? 'text-blue-100' : 'text-gray-500'
                                    }`}>
                                      {(() => {
                                        try {
                                          const date = new Date(message.timestamp);
                                          if (isNaN(date.getTime())) return 'Unknown time';
                                          
                                          const now = new Date();
                                          const diffMs = now - date;
                                          const diffHours = diffMs / (1000 * 60 * 60);
                                          
                                          if (diffHours < 1) {
                                            const minutes = Math.floor(diffMs / (1000 * 60));
                                            return minutes <= 0 ? 'Just now' : `${minutes}m ago`;
                                          } else if (diffHours < 24) {
                                            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                                          } else {
                                            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                                          }
                                        } catch (error) {
                                          return 'Unknown time';
                                        }
                                      })()} • {message.action.includes('SMS') ? 'SMS' : 'Email'}
                                    </p>
                                    {(['SMS_SENT', 'EMAIL_SENT'].includes(message.action)) && (
                                      <FiCheck className="h-3 w-3 text-blue-100" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Quick Reply Section */}
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <label className="text-sm font-medium text-gray-700">Reply via:</label>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setReplyMode('sms')}
                              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                replyMode === 'sms' 
                                  ? 'bg-blue-500 text-white' 
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                            >
                              SMS
                            </button>
                            <button
                              onClick={() => setReplyMode('email')}
                              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                                replyMode === 'email' 
                                  ? 'bg-blue-500 text-white' 
                                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                              disabled={!lead.email}
                            >
                              Email
                            </button>
                          </div>
                        </div>

                        {/* Template Selection */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Choose Template (Optional)
                          </label>
                          <select
                            value={replyMode === 'sms' ? selectedTemplate : selectedEmailTemplate}
                            onChange={(e) => {
                              const templateId = e.target.value;
                              if (replyMode === 'sms') {
                                setSelectedTemplate(templateId);
                                if (templateId) {
                                  const template = smsTemplates.find(t => t._id === templateId);
                                  if (template) {
                                    const msg = template.smsBody || template.message || '';
                                    const processedMsg = replacePlaceholders(msg);
                                    setNewReply(processedMsg);
                                    // Auto-resize textarea after setting new content
                                    setTimeout(() => {
                                      const textarea = document.querySelector('textarea[placeholder*="reply"]');
                                      autoResizeTextarea(textarea);
                                    }, 0);
                                  }
                                }
                              } else {
                                setSelectedEmailTemplate(templateId);
                                if (templateId) {
                                  const template = emailTemplates.find(t => t._id === templateId);
                                  if (template) {
                                    const subj = template.subject || '';
                                    const msg = template.emailBody || template.message || '';
                                    const processedMsg = replacePlaceholders(subj) + '\n\n' + replacePlaceholders(msg);
                                    setNewReply(processedMsg);
                                    // Auto-resize textarea after setting new content
                                    setTimeout(() => {
                                      const textarea = document.querySelector('textarea[placeholder*="reply"]');
                                      autoResizeTextarea(textarea);
                                    }, 0);
                                  }
                                }
                              }
                            }}
                            className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            style={{ minHeight: '48px' }}
                          >
                            <option value="">Select a template...</option>
                            {replyMode === 'sms' ? (
                              Object.entries(categorizeTemplates(smsTemplates)).map(([cat, templates]) =>
                                templates.length > 0 && (
                                  <optgroup key={cat} label={cat}>
                                    {templates.map(template => (
                                      <option key={template._id} value={template._id}>
                                        {template.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                )
                              )
                            ) : (
                              Object.entries(categorizeTemplates(emailTemplates)).map(([cat, templates]) =>
                                templates.length > 0 && (
                                  <optgroup key={cat} label={cat}>
                                    {templates.map(template => (
                                      <option key={template._id} value={template._id}>
                                        {template.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                )
                              )
                            )}
                          </select>
                        </div>

                        {/* Invitation Email Quick Button - Only show in Email mode */}
                        {replyMode === 'email' && (() => {
                          const invitationTemplate = emailTemplates.find(t => t.type === 'invitation_email');
                          return invitationTemplate && (
                            <div className="flex justify-end mb-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const subj = invitationTemplate.subject || '';
                                  const msg = invitationTemplate.emailBody || invitationTemplate.message || '';
                                  const processedMsg = replacePlaceholders(subj) + '\n\n' + replacePlaceholders(msg);
                                  setNewReply(processedMsg);
                                  setSelectedEmailTemplate(invitationTemplate._id);
                                  // Auto-resize textarea
                                  setTimeout(() => {
                                    const textarea = document.querySelector('textarea[placeholder*="reply"]');
                                    autoResizeTextarea(textarea);
                                  }, 0);
                                }}
                                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center gap-2 shadow-md text-sm"
                              >
                                <FiMail className="h-4 w-4" />
                                Quick: Send Invitation Email
                              </button>
                            </div>
                          );
                        })()}

                        <div className="flex space-x-2">
                          <textarea
                            value={newReply}
                            onChange={(e) => {
                              setNewReply(e.target.value);
                              autoResizeTextarea(e.target);
                            }}
                            placeholder={`Type your ${replyMode === 'sms' ? 'SMS' : 'email'} reply...`}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none overflow-hidden"
                            style={{ minHeight: '60px' }}
                            maxLength={replyMode === 'sms' ? 160 : 5000}
                          />
                          <button
                            onClick={handleSendQuickReply}
                            disabled={!newReply.trim()}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                          >
                            <FiSend className="h-4 w-4" />
                            <span>Send</span>
                          </button>
                        </div>
                        
                        <p className="text-xs text-gray-500">
                          {replyMode === 'sms' 
                            ? `Send to: ${lead.phone} (${newReply.length}/160 characters)` 
                            : `Send to: ${lead.email || 'No email address'}`
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Upcoming Callbacks */}
              {upcomingCallbacks.length > 0 && (
                <div className="card border-l-4 border-purple-500">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900 flex items-center space-x-2">
                      <FiClock className="h-5 w-5 text-purple-600" />
                      <span>⏰ Upcoming Callbacks</span>
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {upcomingCallbacks.map((callback) => {
                      const callbackTime = new Date(callback.callback_time);
                      const now = new Date();
                      const isPast = callbackTime < now;
                      const isToday = callbackTime.toDateString() === now.toDateString();
                      
                      return (
                        <div 
                          key={callback.id} 
                          className={`p-4 rounded-lg border-2 ${
                            isPast 
                              ? 'bg-red-50 border-red-200' 
                              : isToday 
                              ? 'bg-yellow-50 border-yellow-200' 
                              : 'bg-purple-50 border-purple-200'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <FiClock className={`h-4 w-4 ${
                                  isPast ? 'text-red-600' : isToday ? 'text-yellow-600' : 'text-purple-600'
                                }`} />
                                <span className="font-semibold text-gray-900">
                                  {callbackTime.toLocaleString('en-GB', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: 'Europe/London'
                                  })}
                                </span>
                                {isPast && (
                                  <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                                    Overdue
                                  </span>
                                )}
                                {isToday && !isPast && (
                                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
                                    Today
                                  </span>
                                )}
                              </div>
                              {callback.callback_note && (
                                <p className="text-sm text-gray-700 mb-2">
                                  📝 {callback.callback_note}
                                </p>
                              )}
                              <div className="text-xs text-gray-500">
                                Status: <span className="font-medium capitalize">{callback.status}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Booking History */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">📋 Booking History</h3>
                  {historyLoading && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  )}
                </div>

                {(bookingHistory.length > 0 || upcomingCallbacks.length > 0) ? (
                  <div className="space-y-4">
                    {/* Add upcoming callbacks to history */}
                    {upcomingCallbacks
                      .filter(callback => callback.status === 'pending')
                      .map((callback) => {
                        const callbackTime = new Date(callback.callback_time);
                        return {
                          action: 'CALLBACK_SCHEDULED',
                          performedByName: 'System',
                          timestamp: callback.created_at,
                          details: {
                            callbackTime: callbackTime.toLocaleString('en-GB', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Europe/London'
                            }),
                            note: callback.callback_note || 'No note',
                            status: callback.status
                          },
                          isCallback: true
                        };
                      })
                      .concat(bookingHistory
                        // Filter out empty entries with no action, name, or timestamp
                        .filter(entry =>
                          entry.action &&
                          entry.action.trim() !== '' &&
                          (entry.performedByName || entry.performed_by_name || entry.performedBy || entry.performed_by || entry.timestamp)
                        )
                      )
                      .sort((a, b) => {
                        // Sort by timestamp, most recent first
                        const timeA = new Date(a.timestamp || 0).getTime();
                        const timeB = new Date(b.timestamp || 0).getTime();
                        return timeB - timeA;
                      })
                      .map((entry, index) => (
                      <div 
                        key={entry.isCallback ? `callback-${entry.details?.callbackTime}` : index} 
                        className={`border-l-4 pl-4 py-3 rounded-r-lg ${
                          entry.isCallback 
                            ? 'border-purple-500 bg-purple-50' 
                            : 'border-blue-500 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              {entry.isCallback && (
                                <FiClock className="h-4 w-4 text-purple-600" />
                              )}
                              <span className="font-semibold text-gray-900">
                                {entry.isCallback ? '📞 Callback Scheduled' : entry.action}
                              </span>
                              <span className="text-sm text-gray-500">
                                {entry.isCallback ? '' : (() => {
                                  // Try to find the performer name from various possible field locations
                                  const performerName = entry.performedByName || 
                                    entry.performed_by_name || 
                                    entry.performedBy || 
                                    entry.performed_by ||
                                    entry.details?.performedByName ||
                                    entry.details?.performed_by_name ||
                                    entry.details?.sent_by_name ||
                                    entry.details?.sentByName ||
                                    entry.leadSnapshot?.performedByName ||
                                    entry.leadSnapshot?.performed_by_name ||
                                    (entry.details?.updatedBy && entry.action?.includes('STATUS'));
                                  return performerName ? `by ${performerName}` : '';
                                })()}
                              </span>
                            </div>

                            {entry.details && Object.keys(entry.details).length > 0 && (
                              <div className="text-sm text-gray-600 mb-2">
                                {entry.isCallback ? (
                                  <div className="bg-purple-100 p-3 rounded-lg">
                                    <div className="font-medium text-purple-800 mb-1">
                                      Scheduled for: {entry.details.callbackTime}
                                    </div>
                                    <div className="text-sm text-purple-700">
                                      Note: {entry.details.note}
                                    </div>
                                    <div className="text-xs text-purple-600 mt-1">
                                      Status: {entry.details.status}
                                    </div>
                                  </div>
                                ) : entry.action === 'NOTES_UPDATED' ? (
                                  <div className="space-y-2">
                                    <div className="bg-blue-50 p-3 rounded-lg">
                                      <div className="font-medium text-blue-800 mb-1 flex items-center justify-between">
                                        <span>Notes {entry.details.changeType === 'added' ? 'Added' : 'Modified'}</span>
                                        <span className="text-xs font-normal text-blue-600">
                                          by {entry.details.updatedBy || entry.performedByName || entry.performed_by_name || entry.performedBy || entry.performed_by || 'Unknown'}
                                        </span>
                                      </div>
                                      {entry.details.oldNotes && (
                                        <div className="text-xs text-gray-600 mb-1">
                                          <span className="font-medium">Previous:</span> {entry.details.oldNotes}
                                        </div>
                                      )}
                                      <div className="text-sm text-gray-800">
                                        <span className="font-medium">New:</span> {entry.details.newNotes}
                                      </div>
                                      <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                                        <span>{entry.details.characterCount} characters</span>
                                        {entry.timestamp && (
                                          <span>{new Date(entry.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  Object.entries(entry.details).map(([key, value]) => (
                                    <div key={key} className="mb-1">
                                      <span className="font-medium">{key}:</span> {typeof value === 'object' && value !== null ? JSON.stringify(value) : value}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}

                            {entry.leadSnapshot && Object.keys(entry.leadSnapshot).length > 0 && (
                              <div className="text-xs text-gray-500 bg-white p-2 rounded border">
                                <div className="font-medium mb-1">Lead State:</div>
                                {Object.entries(entry.leadSnapshot).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="font-medium">{key}:</span> {typeof value === 'object' && value !== null ? JSON.stringify(value) : (value || 'N/A')}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="text-xs text-gray-400 ml-4">
                            {(() => {
                              try {
                                if (!entry.timestamp) return 'Unknown time';

                                let date;
                                if (typeof entry.timestamp === 'string') {
                                  date = new Date(entry.timestamp);
                                } else if (typeof entry.timestamp === 'number') {
                                  date = new Date(entry.timestamp > 1000000000000 ? entry.timestamp : entry.timestamp * 1000);
                                } else {
                                  date = new Date(entry.timestamp);
                                }

                                if (isNaN(date.getTime())) {
                                  return 'Invalid date';
                                }

                                const now = new Date();
                                const diffMs = now - date;
                                const diffHours = diffMs / (1000 * 60 * 60);
                                const diffDays = diffMs / (1000 * 60 * 60 * 24);

                                if (diffHours < 1) {
                                  const minutes = Math.floor(diffMs / (1000 * 60));
                                  return minutes <= 0 ? 'Just now' : `${minutes} min ago`;
                                } else if (diffHours < 24) {
                                  return date.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  });
                                } else if (diffDays < 7) {
                                  const days = Math.floor(diffDays);
                                  return `${days} day${days === 1 ? '' : 's'} ago`;
                                } else {
                                  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  });
                                }
                              } catch (error) {
                                console.error('Error formatting timestamp:', error, 'Timestamp:', entry.timestamp);
                                return 'Unknown time';
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📋</div>
                    <p>No booking history available</p>
                    <p className="text-sm">History will appear here when actions are taken on this lead</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Photo and Lead Details */}
            <div className="space-y-6">
              <div className="card">
                <div className="mb-4">
                  <div className="mx-auto w-full max-w-xs aspect-square bg-gray-300 flex items-center justify-center rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 relative">
                    {lead.image_url ? (
                      <>
                        {/* Check for unsupported formats first */}
                        {(lead.image_url.toLowerCase().includes('.heic') ||
                          lead.image_url.toLowerCase().includes('.heif')) ? (
                          <div
                            className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 cursor-pointer"
                            onClick={() => setPhotoModalOpen(true)}
                            title="HEIC format - click to try viewing"
                          >
                            <span className="text-4xl mb-2">📷</span>
                            <span className="text-xs text-gray-500">HEIC Format</span>
                          </div>
                        ) : (lead.image_url.toLowerCase().includes('.pdf')) ? (
                          <div
                            className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 cursor-pointer"
                            onClick={() => window.open(lead.image_url, '_blank')}
                            title="PDF file - click to open"
                          >
                            <span className="text-4xl mb-2">📄</span>
                            <span className="text-xs text-gray-500">PDF File</span>
                          </div>
                        ) : (lead.image_url.toLowerCase().includes('.mp4') ||
                          lead.image_url.toLowerCase().includes('.webm') ||
                          lead.image_url.toLowerCase().includes('.mov')) ? (
                          <video
                            src={lead.image_url}
                            className="w-full h-full object-cover cursor-pointer"
                            muted
                            loop
                            playsInline
                            autoPlay
                            preload="auto"
                            onClick={() => setPhotoModalOpen(true)}
                          />
                        ) : (
                      <LazyImage
                        src={lead.image_url}
                        alt={lead.name}
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                        lazy={false}
                        enableFadeIn={true}
                        showBlurPlaceholder={true}
                        onClick={() => setPhotoModalOpen(true)}
                      />
                        )}
                        {/* Media type badge */}
                        {(lead.image_url.toLowerCase().includes('.gif') ||
                          lead.image_url.toLowerCase().includes('.mp4') ||
                          lead.image_url.toLowerCase().includes('.webm')) && (
                          <span className="absolute top-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded uppercase font-medium">
                            {lead.image_url.toLowerCase().includes('.gif') ? 'GIF' : 'VIDEO'}
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
                        <span className="text-6xl font-medium text-gray-600">
                          {lead.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  {lead.image_url && (
                    <p className="text-xs text-gray-500 mt-2">
                      Click {lead.image_url.toLowerCase().includes('.mp4') || lead.image_url.toLowerCase().includes('.webm') ? 'video' : 'photo'} to view full screen
                    </p>
                  )}
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{lead.name}</h2>
                <div className="space-y-2 text-sm text-gray-600">
                  {lead.age && (
                    <div className="flex items-center justify-center space-x-2">
                      <FiUser className="h-4 w-4" />
                      <span>{lead.age} years old</span>
                    </div>
                  )}
                  {lead.gender && (
                    <div className="flex items-center justify-center space-x-2">
                      <FiUser className="h-4 w-4" />
                      <span>{lead.gender}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-center space-x-2">
                    <FiPhone className="h-4 w-4" />
                    <span>{lead.phone}</span>
                  </div>
                  {lead.email && (
                    <div className="flex items-center justify-center space-x-2">
                      <FiMail className="h-4 w-4" />
                      <span>{lead.email}</span>
                    </div>
                  )}
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Lead Information</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <span className={getStatusBadgeClass(lead.status)}>
                        {formatStatusDisplay(lead.status)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Assigned to:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {lead.booker?.name || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Date Added:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatDate(lead.created_at)}
                      </span>
                    </div>
                    {(() => {
                      const cf = lead.custom_fields
                        ? (typeof lead.custom_fields === 'string' ? JSON.parse(lead.custom_fields) : lead.custom_fields)
                        : null;
                      return cf?.lead_code ? (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Lead Code:</span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                            {cf.lead_code}
                          </span>
                        </div>
                      ) : null;
                    })()}
                    {lead.lead_source && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Lead Source:</span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
                          {lead.lead_source}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* SalesApe Integration - DISABLED */}

              {/* Images & Gallery Button - Admin only */}
              {!editing && user?.role === 'admin' && (
                <div className="mt-4 space-y-2">
                  {/* View Gallery Button - For browsing photos */}
                  <button
                    onClick={() => {
                      setImageSelectionMode(false);
                      setShowPresentationGallery(true);
                    }}
                    className="w-full flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md"
                  >
                    <Presentation className="w-4 h-4 mr-2" />
                    <span>View Gallery</span>
                    {leadPhotos.length > 0 && (
                      <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                        {leadPhotos.length}
                      </span>
                    )}
                  </button>

                  {/* Quick View Images Button (secondary) */}
                  <button
                    onClick={() => setShowImageGallery(true)}
                    className="w-full flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-sm"
                  >
                    <Image className="w-4 h-4 mr-2" />
                    <span>Quick View Images</span>
                  </button>

                </div>
              )}

              {/* Add Reject button in the details card (after notes section) */}
              {!editing && lead.status !== 'Rejected' && (
                <button
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  onClick={() => setShowRejectModal(true)}
                >
                  Reject Lead
                </button>
              )}
              
              {/* Lead Status Dropdown for Bookers - Using call-status endpoint */}
              {!editing && user?.role === 'booker' && (
                <BookerStatusDropdown 
                  leadId={lead.id}
                  lead={lead}
                  onStatusUpdate={(status, result) => {
                    // Update the lead state with new call status
                    let customFields = {};
                    try {
                      if (lead.custom_fields) {
                        customFields = typeof lead.custom_fields === 'string' 
                          ? JSON.parse(lead.custom_fields) 
                          : lead.custom_fields;
                      }
                    } catch (e) {
                      customFields = {};
                    }
                    customFields.call_status = status;
                    
                    // Update lead status based on call status mapping
                    let newLeadStatus = lead.status;
                    if (status === 'Wrong number') {
                      newLeadStatus = 'Rejected'; // Map to Rejected status (no longer using "Wants Email")
                    } else if (['Not interested', 'Not Qualified'].includes(status)) {
                      newLeadStatus = 'Rejected';
                    }
                    
                    setLead({ 
                      ...lead, 
                      custom_fields: JSON.stringify(customFields),
                      call_status: status,
                      status: newLeadStatus
                    });
                    
                    // Refresh lead data
                    fetchLead();
                  }}
                />
              )}
              
              {/* Card On File Status */}
              {lead.stripe_payment_method_id ? (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">Card On File</p>
                    <p className="text-[10px] text-emerald-600">Booking secured with card hold</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-700">No Card On File</p>
                    <p className="text-[10px] text-amber-600">Send booking link to capture card</p>
                  </div>
                </div>
              )}

              {/* Send Booking Link Buttons */}
              {!editing && (lead.phone || lead.email) && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Send Booking Link</p>
                  <div className="flex gap-2">
                    {lead.phone && (
                      <button
                        id="send-booking-sms-btn"
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                        onClick={async (e) => {
                          const btn = e.currentTarget;
                          btn.disabled = true;
                          btn.textContent = 'Sending...';
                          try {
                            const res = await axios.post(`/api/leads/${lead.id}/send-booking-link`, { channels: 'sms' });
                            if (res.data.success) {
                              alert(`Booking link SMS sent to ${lead.phone}!`);
                              setTimeout(() => fetchConversationHistory(), 1000);
                            } else {
                              alert(res.data.message || 'Failed to send SMS');
                            }
                          } catch (err) {
                            alert(`Error: ${err.response?.data?.message || err.message}`);
                          } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg> SMS';
                          }
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        SMS
                      </button>
                    )}
                    {lead.email && (
                      <button
                        id="send-booking-email-btn"
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                        onClick={async (e) => {
                          const btn = e.currentTarget;
                          btn.disabled = true;
                          btn.textContent = 'Sending...';
                          try {
                            const res = await axios.post(`/api/leads/${lead.id}/send-booking-link`, { channels: 'email' });
                            if (res.data.success) {
                              alert(`Booking link email sent to ${lead.email}!`);
                              setTimeout(() => fetchConversationHistory(), 1000);
                            } else {
                              alert(res.data.message || 'Failed to send email');
                            }
                          } catch (err) {
                            alert(`Error: ${err.response?.data?.message || err.message}`);
                          } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Email';
                          }
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Email
                      </button>
                    )}
                    {lead.phone && lead.email && (
                      <button
                        id="send-booking-both-btn"
                        className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                        onClick={async (e) => {
                          const btn = e.currentTarget;
                          btn.disabled = true;
                          btn.textContent = 'Sending...';
                          try {
                            const res = await axios.post(`/api/leads/${lead.id}/send-booking-link`, { channels: 'both' });
                            if (res.data.success) {
                              alert(`Booking link sent via ${res.data.channels.join(' & ')} to ${lead.name}!`);
                              setTimeout(() => fetchConversationHistory(), 1000);
                            } else {
                              alert(res.data.message || 'Failed to send');
                            }
                          } catch (err) {
                            alert(`Error: ${err.response?.data?.message || err.message}`);
                          } finally {
                            btn.disabled = false;
                            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> Both';
                          }
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Both
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Alex A.I Integration */}
              {!editing && (
                <ReplyDeskButton lead={lead} onSuccess={() => fetchLead()} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Photo Modal */}
      <PhotoModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        imageUrl={lead?.image_url ? getOptimizedImageUrl(lead.image_url, 'original') : null}
        leadName={lead?.name}
      />

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="text-lg font-bold mb-4">Reject Lead</h2>
            <p className="text-sm text-gray-600 mb-4">This lead will be rejected as <span className="font-semibold">Duplicated</span>.</p>
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                onClick={() => setShowRejectModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                disabled={rejecting}
                onClick={async () => {
                  setRejecting(true);
                  try {
                    await axios.patch(`/api/leads/${lead.id}/reject`, { reason: rejectReason });
                    setLead({ ...lead, status: 'Rejected', reject_reason: rejectReason });
                    setShowRejectModal(false);
                  } catch (err) {
                    alert('Failed to reject lead.');
                  }
                  setRejecting(false);
                }}
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Presentation Gallery - Fullscreen slideshow for viewer presentation */}
      <PresentationGallery
        isOpen={showPresentationGallery}
        onClose={() => setShowPresentationGallery(false)}
        photos={leadPhotos}
        leadId={lead?.id}
        leadName={lead?.name || 'Client'}
        initialSelectedIds={selectedPhotoIds}
        imageLimit={selectedPackage?.imageCount ?? selectedPackage?.image_count}
        selectionMode={imageSelectionMode}
        onProceedToPackage={(photoIds, photos) => {
          setSelectedPhotoIds(photoIds);
          setSelectedPhotos(photos);
          setShowPresentationGallery(false);
          setImageSelectionMode(false);
        }}
      />

      {/* Image Gallery Modal - Quick view for managing photos */}
      <ImageGalleryModal
        isOpen={showImageGallery}
        onClose={() => setShowImageGallery(false)}
        leadId={lead?.id}
        leadName={lead?.name}
        onSelectionComplete={(photos, photoIds) => {
          setLeadPhotos(photos);
          setSelectedPhotoIds(photoIds);
          setSelectedPhotos(photos);
          console.log('Selected photos:', photoIds);
        }}
      />

    </>
  );
};

export default LeadDetail; 