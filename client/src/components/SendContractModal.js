import React, { useState, useEffect } from 'react';
import { X, Send, FileText, Mail, Copy, Check, Loader, AlertTriangle, ExternalLink, Clock, CheckCircle, Edit2, Eye, ChevronRight, ChevronLeft, User, MapPin, Phone, CreditCard, Package, PoundSterling, Image, ArrowLeft, RefreshCw, Download, Save, Link, Calendar, DollarSign } from 'lucide-react';
import { toLocalDateStr } from '../utils/timeUtils';
import { useAuth } from '../context/AuthContext';

/**
 * SendContractModal - Modal for creating and sending contracts to customers
 * Includes pre-screen form to edit all contract details before sending
 */
const SendContractModal = ({
  isOpen,
  onClose,
  lead,
  packageData,
  invoiceData,
  selectedPhotoIds = [],
  onContractSent,
  // Back navigation callbacks
  onBackToPackages,
  onBackToPhotos
}) => {
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [contract, setContract] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSentTime, setEmailSentTime] = useState(null);
  const [copied, setCopied] = useState(false);
  const [contractStatus, setContractStatus] = useState('draft'); // 'draft' | 'sent' | 'signed'
  const [checkingStatus, setCheckingStatus] = useState(false);

  // New state for Step 3 redesign
  const [deliveryEmailSent, setDeliveryEmailSent] = useState(null); // null = unknown, true = sent, false = failed
  const [deliveryEmailTime, setDeliveryEmailTime] = useState(null);
  const [deliveryEmailTo, setDeliveryEmailTo] = useState('');
  const [deliveryEmailError, setDeliveryEmailError] = useState(null);
  const [deliveryAttachmentCount, setDeliveryAttachmentCount] = useState(0);
  const [deliveryPhotoCount, setDeliveryPhotoCount] = useState(0);
  const [selectedPhotoCount, setSelectedPhotoCount] = useState(0);
  const [resendingDelivery, setResendingDelivery] = useState(false);
  const [savingAuthCode, setSavingAuthCode] = useState(false);
  const [authCodeSaved, setAuthCodeSaved] = useState(false);
  const [localAuthCode, setLocalAuthCode] = useState('');

  // Resume/discard state
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedStateData, setSavedStateData] = useState(null);

  // Postcode lookup state
  const [postcodeLoading, setPostcodeLoading] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);

  // Current step: 'edit' | 'review' | 'send'
  const [step, setStep] = useState('edit');

  // LocalStorage key for saving contract state
  const getStorageKey = (leadId) => `contract_draft_${leadId}`;

  // Save current state to localStorage
  const saveStateToStorage = (leadId, state) => {
    if (!leadId) return;
    const dataToSave = {
      contractDetails: state.contractDetails,
      step: state.step,
      contract: state.contract,
      emailSent: state.emailSent,
      contractStatus: state.contractStatus,
      timestamp: Date.now(),
      leadId: leadId
    };
    localStorage.setItem(getStorageKey(leadId), JSON.stringify(dataToSave));
    console.log(`💾 Contract state saved for lead ${leadId}`);
  };

  // Load saved state from localStorage
  const loadStateFromStorage = (leadId) => {
    if (!leadId) return null;
    try {
      const saved = localStorage.getItem(getStorageKey(leadId));
      if (saved) {
        const data = JSON.parse(saved);
        // Check if saved data is less than 24 hours old
        const hoursSinceSave = (Date.now() - data.timestamp) / (1000 * 60 * 60);
        if (hoursSinceSave < 24) {
          return data;
        } else {
          // Clear expired data
          localStorage.removeItem(getStorageKey(leadId));
        }
      }
    } catch (err) {
      console.error('Error loading saved contract state:', err);
    }
    return null;
  };

  // Clear saved state from localStorage
  const clearSavedState = (leadId) => {
    if (!leadId) return;
    localStorage.removeItem(getStorageKey(leadId));
    console.log(`🗑️ Cleared saved contract state for lead ${leadId}`);
  };

  // Handle resume - restore saved state
  const handleResume = () => {
    if (savedStateData) {
      setContractDetails(savedStateData.contractDetails);
      setStep(savedStateData.step);
      if (savedStateData.contract) {
        setContract(savedStateData.contract);
      }
      if (savedStateData.emailSent) {
        setEmailSent(savedStateData.emailSent);
      }
      if (savedStateData.contractStatus) {
        setContractStatus(savedStateData.contractStatus);
      }
      console.log(`✅ Resumed contract state from step: ${savedStateData.step}`);
    }
    setShowResumePrompt(false);
    setSavedStateData(null);
  };

  // Handle discard - clear saved state and start fresh
  const handleDiscard = () => {
    if (lead?.id) {
      clearSavedState(lead.id);
    }
    setShowResumePrompt(false);
    setSavedStateData(null);
    // The useEffect will initialize fresh state
  };

  // Handle close - reset resume state
  const handleClose = () => {
    setShowResumePrompt(false);
    setSavedStateData(null);
    onClose();
  };

  // Editable contract details
  const [contractDetails, setContractDetails] = useState({
    // Customer details
    customerName: '',
    clientNameIfDifferent: '',
    address: '',
    postcode: '',
    phone: '',
    email: '',
    isVip: false,

    // Studio info
    studioNumber: '',
    photographer: '',
    invoiceNumber: '',

    // Order details
    digitalImages: true,
    digitalImagesQty: '',
    digitalZCard: false,
    efolio: false,
    efolioUrl: '',
    projectInfluencer: false,
    influencerLogin: '',
    influencerPassword: '',

    // Permissions
    allowImageUse: true,

    // Notes
    notes: '',

    // Payment
    subtotal: 0,
    vatAmount: 0,
    total: 0,
    paymentMethod: 'card',
    authCode: '',
    // Finance-specific fields (invoice flow)
    depositAmount: 0,
    financeAmount: 0,
    // Finance agreement configuration (for auto-creating finance agreements)
    financeFrequency: 'monthly',
    financeStartDate: '',
    financeDueDay: 1,
    financeDuration: 12,  // Number of payments (months by default)

    // Finance contract fields (new finance agreement form)
    dateOfBirth: '',
    yearsAtAddress: '',
    monthlyIncome: 0,
    priorityOutgoings: 0,
    otherOutgoings: 0,
    agreedInstalment: 0,
    cashPrice: 0,
    deposit: 0,
    adminFee: 0,
    interestRate: 0,
    apr: 0,
    numberOfInstalments: 12,
    duration: 12,
    repaymentFrequency: 'monthly',
    commencingFrom: '',
    creditorName: '',
    creditorDate: '',
    // Card Pay Details (admin fills in for finance)
    cardFullName: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: ''
  });

  // Initialize contract details from lead and package data
  useEffect(() => {
    if (isOpen && lead) {
      // Check for saved state first
      const savedState = loadStateFromStorage(lead.id);
      if (savedState && !showResumePrompt) {
        // Show resume prompt
        setSavedStateData(savedState);
        setShowResumePrompt(true);
        return; // Don't initialize until user decides
      }

      // If resume prompt is showing, don't reinitialize
      if (showResumePrompt) return;

      const price = packageData?.price || 0;
      const vatRate = packageData?.vatRate || 20;
      let subtotal, vatAmount, total;
      if (invoiceData?.subtotal !== undefined) {
        subtotal = invoiceData.subtotal;
        vatAmount = invoiceData.vatAmount || 0;
        total = invoiceData.total || subtotal + vatAmount;
      } else if (packageData?.vatInclusive) {
        // Price already includes VAT - extract net amount
        const vatMultiplier = vatRate / 100;
        subtotal = price / (1 + vatMultiplier);
        vatAmount = price - subtotal;
        total = price;
      } else {
        // Price excludes VAT - add it
        subtotal = price;
        vatAmount = price * (vatRate / 100);
        total = price + vatAmount;
      }

      // Fetch next invoice number from API
      const fetchNextInvoiceNumber = async () => {
        try {
          const response = await fetch('/api/contracts/next-invoice-number', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.invoiceNumber) {
              setContractDetails(prev => ({
                ...prev,
                invoiceNumber: data.invoiceNumber
              }));
              console.log(`📋 Invoice number set: ${data.invoiceNumber}`);
            }
          }
        } catch (err) {
          console.error('Error fetching invoice number:', err);
        }
      };

      const initPaymentMethod = invoiceData?.paymentMethod || 'card';

      setContractDetails({
        // Customer details from lead
        customerName: lead.name || '',
        clientNameIfDifferent: lead.parent_name || '',
        address: lead.address || '',
        postcode: lead.postcode || '',
        phone: lead.phone || '',
        email: lead.email || '',
        isVip: lead.is_vip || false,

        // Studio info
        studioNumber: invoiceData?.studioNumber || '',
        photographer: invoiceData?.photographer || '',
        invoiceNumber: '', // Will be set by fetchNextInvoiceNumber

        // Order details - detect from package
        // For individual items, use explicit flags; for main packages, check includes array
        digitalImages: true,
        digitalImagesQty: packageData?.imageCount || packageData?.image_count || 'All',
        digitalZCard: packageData?.hasZCard !== undefined
          ? packageData.hasZCard
          : (packageData?.includes?.some(i => i.toLowerCase().includes('z-card')) || false),
        efolio: packageData?.hasEfolio !== undefined
          ? packageData.hasEfolio
          : (packageData?.includes?.some(i => i.toLowerCase().includes('efolio') || i.toLowerCase().includes('e-folio')) || false),
        efolioUrl: '',
        projectInfluencer: packageData?.hasProjectInfluencer !== undefined
          ? packageData.hasProjectInfluencer
          : (packageData?.includes?.some(i => i.toLowerCase().includes('influencer')) || false),
        influencerLogin: '',
        influencerPassword: '',
        threeLanceCastings: packageData?.has3Lance !== undefined
          ? packageData.has3Lance
          : (packageData?.includes?.some(i => i.toLowerCase().includes('3lance') || i.toLowerCase().includes('casting')) || false),
        recommendedAgencyList: packageData?.hasAgencyList !== undefined
          ? packageData.hasAgencyList
          : (packageData?.includes?.some(i => i.toLowerCase().includes('agency')) || false),

        // Permissions
        allowImageUse: true,

        // Notes
        notes: `Package: ${packageData?.name || 'Standard Package'}`,

        // Payment
        subtotal: subtotal,
        vatRate: packageData?.vatRate || 20,
        vatAmount: vatAmount,
        total: total,
        paymentMethod: initPaymentMethod,
        authCode: invoiceData?.authCode || '',
        // Finance agreement configuration (default if Ideal4Finance selected - old flow)
        financeFrequency: initPaymentMethod === 'ideal4finance'
          ? (invoiceData?.financeFrequency || 'monthly')
          : 'monthly',
        financeStartDate: initPaymentMethod === 'ideal4finance'
          ? (invoiceData?.financeStartDate || toLocalDateStr(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)))
          : '',
        financeDueDay: initPaymentMethod === 'ideal4finance'
          ? (invoiceData?.financeDueDay || 1)
          : 1,
        financeDuration: initPaymentMethod === 'ideal4finance'
          ? (invoiceData?.financeDuration || 12)
          : 12,

        // Finance contract fields (new finance agreement)
        dateOfBirth: '',
        yearsAtAddress: '',
        monthlyIncome: 0,
        priorityOutgoings: 0,
        otherOutgoings: 0,
        agreedInstalment: 0,
        cashPrice: initPaymentMethod === 'finance' ? total : 0,
        deposit: 0,
        adminFee: 0,
        interestRate: 0,
        apr: 0,
        numberOfInstalments: 12,
        duration: 12,
        repaymentFrequency: 'monthly',
        commencingFrom: initPaymentMethod === 'finance'
          ? toLocalDateStr(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
          : '',
        creditorName: authUser?.name || '',
        creditorDate: toLocalDateStr(new Date())
      });

      // Fetch invoice number after setting initial state
      fetchNextInvoiceNumber();

      setContract(null);
      setEmailSent(false);
      setError(null);
      setCopied(false);
      setStep('edit');
    }
  }, [isOpen, lead, packageData, invoiceData, showResumePrompt]);

  // Auto-save state when contractDetails or step changes
  useEffect(() => {
    if (isOpen && lead?.id && !showResumePrompt && contractDetails.customerName) {
      // Don't save if contract is signed (completed)
      if (contractStatus === 'signed') {
        clearSavedState(lead.id);
        return;
      }
      saveStateToStorage(lead.id, {
        contractDetails,
        step,
        contract,
        emailSent,
        contractStatus
      });
    }
  }, [contractDetails, step, contract, emailSent, contractStatus, isOpen, lead?.id, showResumePrompt]);

  // Update a single field
  const updateField = (field, value) => {
    setContractDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Recalculate totals when subtotal changes
  const updateSubtotal = (value) => {
    const subtotal = parseFloat(value) || 0;
    const vatRate = packageData?.vatRate || 20;
    const vatAmount = subtotal * (vatRate / 100);
    const total = subtotal + vatAmount;
    setContractDetails(prev => ({
      ...prev,
      subtotal,
      vatAmount,
      total
    }));
  };

  // Lookup addresses from postcode using OS Places API
  const lookupPostcode = async (postcode) => {
    if (!postcode || postcode.length < 5) return;

    // Clean up postcode - remove extra spaces, uppercase
    const cleanPostcode = postcode.trim().toUpperCase().replace(/\s+/g, '');

    // Basic UK postcode validation pattern
    const postcodePattern = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
    if (!postcodePattern.test(cleanPostcode)) return;

    setPostcodeLoading(true);
    setAddressSuggestions([]);
    setShowAddressDropdown(false);

    try {
      // Call backend proxy to avoid CSP issues
      const response = await fetch(`/api/postcode/lookup/${encodeURIComponent(cleanPostcode)}`);
      const data = await response.json();

      if (data.addresses && data.addresses.length > 0) {
        setAddressSuggestions(data.addresses);
        setShowAddressDropdown(true);
      }
    } catch (err) {
      console.error('Postcode lookup failed:', err);
    } finally {
      setPostcodeLoading(false);
    }
  };

  // Handle address selection from dropdown
  const selectAddress = (address) => {
    updateField('address', address.full || address.display);
    setShowAddressDropdown(false);
    setAddressSuggestions([]);
  };

  // Create contract with edited details
  const createContract = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/contracts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          leadId: lead.id,
          packageId: packageData?.id,
          packageData: packageData,
          invoiceData: {
            ...invoiceData,
            ...contractDetails
          },
          contractDetails: contractDetails,
          selectedPhotoIds: selectedPhotoIds
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Contract creation error:', data);
        throw new Error(data.message || data.error || 'Failed to create contract');
      }

      // Handle both response formats: { contract: {...} } or { success: true, contract: {...} }
      const contractData = data.contract || (data.success && data.contract);
      
      console.log('Contract creation response:', { data, contractData });
      
      if (!contractData) {
        console.error('No contract returned from API:', data);
        throw new Error('Contract was not created - no contract data returned. Check console for details.');
      }

      if (!contractData.id || !contractData.signingUrl) {
        console.error('Contract data missing required fields:', contractData);
        throw new Error('Contract created but missing required fields (id or signingUrl)');
      }

      setContract(contractData);
      setStep('send');
      console.log('Contract created successfully, moving to send step');
    } catch (err) {
      console.error('Error creating contract:', err);
      setError(err.message || 'Failed to create contract. Please check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  // Send contract via email
  const sendContractEmail = async () => {
    if (!contract || !contractDetails.email) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/send/${contract.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          email: contractDetails.email
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send contract');
      }

      setEmailSent(true);
      setEmailSentTime(new Date().toISOString());
      setContractStatus('sent');
      onContractSent?.(contract);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  // Check contract status (to see if it has been signed)
  const checkContractStatus = async () => {
    if (!contract?.id) return;

    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/contracts/${contract.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const status = data.contract?.status || data.status || 'draft';
        setContractStatus(status);

        // Update contract data if signed
        if (data.contract) {
          setContract(prev => ({
            ...prev,
            ...data.contract
          }));

          // Update delivery email info from response (backend extracts from contract_data)
          // Use top-level fields first (set by backend), fall back to contract_data
          const contractData = data.contract.data || {};

          // Check for delivery email status - use top-level fields from backend
          if (data.contract.deliveryEmailSent !== undefined) {
            setDeliveryEmailSent(data.contract.deliveryEmailSent);
            setDeliveryEmailTime(data.contract.deliveryEmailTime);
            setDeliveryEmailTo(data.contract.deliveryEmailTo || contractData.email);
            setDeliveryEmailError(data.contract.deliveryEmailError || null);
            setDeliveryAttachmentCount(data.contract.deliveryAttachmentCount || 0);
            setDeliveryPhotoCount(data.contract.deliveryPhotoCount || 0);
          } else if (contractData.delivery_email_sent !== undefined) {
            // Fallback to contract_data fields
            setDeliveryEmailSent(contractData.delivery_email_sent);
            setDeliveryEmailTime(contractData.delivery_email_time);
            setDeliveryEmailTo(contractData.delivery_email_to || contractData.email);
            setDeliveryEmailError(contractData.delivery_email_error || null);
            setDeliveryAttachmentCount(contractData.delivery_attachment_count || 0);
            setDeliveryPhotoCount(contractData.delivery_photo_count || 0);
          }

          if (data.contract.selectedPhotoCount) {
            setSelectedPhotoCount(data.contract.selectedPhotoCount);
          }
          if (data.contract.authCode || contractData.authCode) {
            setLocalAuthCode(data.contract.authCode || contractData.authCode);
            setAuthCodeSaved(true);
          }
        }
      }
    } catch (err) {
      console.error('Error checking contract status:', err);
    } finally {
      setCheckingStatus(false);
    }
  };

  // Auto-refresh contract status every second when waiting for signature or delivery email status
  useEffect(() => {
    if (!contract?.id || step !== 'send') return;

    // Stop polling only when contract is signed AND delivery email status is known (sent or failed)
    // deliveryEmailSent === null means still processing, true/false means we have a result
    if (contractStatus === 'signed' && deliveryEmailSent !== null) return;

    const interval = setInterval(() => {
      checkContractStatus();
    }, 1000); // Every 1 second

    return () => clearInterval(interval);
  }, [contract?.id, contractStatus, step, deliveryEmailSent]);

  // Resend delivery email
  const resendDeliveryEmail = async () => {
    if (!contract?.id) return;

    setResendingDelivery(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contract.id}/resend-delivery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          email: contractDetails.email
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to resend delivery email');
      }

      setDeliveryEmailSent(true);
      setDeliveryEmailTime(new Date().toISOString());
      setDeliveryEmailTo(data.sentTo);
      setDeliveryEmailError(null); // Clear any previous error
      setDeliveryAttachmentCount(data.attachments || 0);
      setDeliveryPhotoCount(data.photoCount || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setResendingDelivery(false);
    }
  };

  // Save auth code
  const saveAuthCode = async () => {
    if (!contract?.id || !localAuthCode.trim()) return;

    setSavingAuthCode(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contract.id}/auth-code`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          authCode: localAuthCode.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save auth code');
      }

      setAuthCodeSaved(true);
      setTimeout(() => setAuthCodeSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAuthCode(false);
    }
  };

  // Copy signing link to clipboard
  const copySigningLink = async () => {
    if (!contract?.signingUrl) return;

    try {
      await navigator.clipboard.writeText(contract.signingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = contract.signingUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `£${parseFloat(amount || 0).toFixed(2)}`;
  };

  // Check if this is a finance contract (uses completely separate form)
  const isFinanceContract = contractDetails.paymentMethod === 'finance';

  // Calculate finance contract derived fields
  const financeCalc = (() => {
    if (!isFinanceContract) return {};
    const cashPrice = parseFloat(contractDetails.cashPrice) || 0;
    const deposit = parseFloat(contractDetails.deposit) || 0;
    const interestRate = parseFloat(contractDetails.interestRate) || 0;
    const adminFee = parseFloat(contractDetails.adminFee) || 0;
    const numberOfInstalments = parseInt(contractDetails.numberOfInstalments) || 12;
    const duration = parseInt(contractDetails.duration) || 12;
    const monthlyIncome = parseFloat(contractDetails.monthlyIncome) || 0;
    const priorityOutgoings = parseFloat(contractDetails.priorityOutgoings) || 0;
    const otherOutgoings = parseFloat(contractDetails.otherOutgoings) || 0;

    const amountOfCredit = cashPrice - deposit;
    const interest = amountOfCredit * (interestRate / 100) * (duration / 12);
    const totalChargeForCredit = interest + adminFee;
    const totalAmountPayable = amountOfCredit + totalChargeForCredit;
    const monthlyRepayment = numberOfInstalments > 0 ? totalAmountPayable / numberOfInstalments : 0;
    const dailyRateOfInterest = interestRate / 365;
    const disposableBalance = monthlyIncome - priorityOutgoings - otherOutgoings;
    const totalExpenditure = priorityOutgoings + otherOutgoings;
    const apr = amountOfCredit > 0 && duration > 0
      ? (totalChargeForCredit / amountOfCredit) * (12 / duration) * 100
      : 0;

    return { amountOfCredit, interest, totalChargeForCredit, totalAmountPayable, monthlyRepayment, dailyRateOfInterest, disposableBalance, totalExpenditure, apr };
  })();

  if (!isOpen) return null;

  // Resume prompt modal
  if (showResumePrompt && savedStateData) {
    const savedStep = savedStateData.step;
    const savedTime = new Date(savedStateData.timestamp);
    const timeAgo = Math.round((Date.now() - savedStateData.timestamp) / (1000 * 60));
    const timeAgoText = timeAgo < 60 ? `${timeAgo} minutes ago` : `${Math.round(timeAgo / 60)} hours ago`;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b bg-gradient-to-r from-amber-500 to-orange-500">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                <RefreshCw className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-white">Resume Contract?</h2>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-gray-700 mb-4">
              You have an unfinished contract for <strong>{savedStateData.contractDetails?.customerName || lead?.name}</strong>.
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-500">Saved:</span>
                <span className="text-gray-700">{timeAgoText}</span>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-500">Step:</span>
                <span className="text-gray-700 capitalize">{savedStep === 'edit' ? 'Edit Details' : savedStep === 'review' ? 'Review' : 'Send'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Invoice:</span>
                <span className="text-gray-700 font-mono">{savedStateData.contractDetails?.invoiceNumber || '-'}</span>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleDiscard}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Start New
              </button>
              <button
                onClick={handleResume}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-600 to-indigo-600 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {step === 'edit' && (isFinanceContract ? 'Edit Invoice & Finance Details' : 'Edit Invoice Details')}
                {step === 'review' && (isFinanceContract ? 'Review Invoice & Finance Agreement' : 'Review Invoice')}
                {step === 'send' && (isFinanceContract ? 'Send Contracts' : 'Send Invoice')}
              </h2>
              <p className="text-blue-100 text-sm">
                {lead?.name || 'Customer'} • {packageData?.name || 'Package'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 bg-gray-50 border-b flex items-center justify-center space-x-4 flex-shrink-0">
          <div className={`flex items-center space-x-2 ${step === 'edit' ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>1</div>
            <span className="text-sm">Edit Details</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center space-x-2 ${step === 'review' ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>2</div>
            <span className="text-sm">Review</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center space-x-2 ${step === 'send' ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step === 'send' ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'}`}>3</div>
            <span className="text-sm">Send</span>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error display */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 font-medium">Error</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Step 1: Edit Form */}
          {step === 'edit' && (
            <div className="space-y-6">
              {/* Back Navigation */}
              {(onBackToPackages || onBackToPhotos) && (
                <div className="flex items-center space-x-2 pb-4 border-b border-gray-200">
                  <ArrowLeft className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Go back to:</span>
                  {onBackToPhotos && (
                    <button
                      onClick={onBackToPhotos}
                      className="px-3 py-1.5 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors flex items-center space-x-1"
                    >
                      <Image className="w-4 h-4" />
                      <span>Photo Selection</span>
                    </button>
                  )}
                  {onBackToPackages && (
                    <button
                      onClick={onBackToPackages}
                      className="px-3 py-1.5 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors flex items-center space-x-1"
                    >
                      <Package className="w-4 h-4" />
                      <span>Package Selection</span>
                    </button>
                  )}
                </div>
              )}

              {/* Customer Details Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <User className="w-4 h-4 mr-2 text-blue-500" />
                  CUSTOMER DETAILS
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name (as in diary)</label>
                    <input
                      type="text"
                      value={contractDetails.customerName}
                      onChange={(e) => updateField('customerName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Client Name (if different)</label>
                    <input
                      type="text"
                      value={contractDetails.clientNameIfDifferent}
                      onChange={(e) => updateField('clientNameIfDifferent', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Postcode</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={contractDetails.postcode}
                        onChange={(e) => updateField('postcode', e.target.value)}
                        onBlur={(e) => lookupPostcode(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g. SW1A 1AA"
                      />
                      {postcodeLoading && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <Loader className="w-4 h-4 animate-spin text-blue-500" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Select Address</label>
                    <div className="relative">
                      <select
                        value=""
                        onChange={(e) => {
                          const selected = addressSuggestions.find(a => a.full === e.target.value || a.display === e.target.value);
                          if (selected) selectAddress(selected);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={addressSuggestions.length === 0}
                      >
                        <option value="">
                          {addressSuggestions.length === 0 ? 'Enter postcode first' : `Select from ${addressSuggestions.length} addresses`}
                        </option>
                        {addressSuggestions.map((addr, idx) => (
                          <option key={idx} value={addr.full || addr.display}>
                            {addr.display}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Full Address</label>
                    <input
                      type="text"
                      value={contractDetails.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Select address from dropdown above"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone / Mobile</label>
                    <input
                      type="tel"
                      value={contractDetails.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={contractDetails.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2 flex items-center">
                    <input
                      type="checkbox"
                      id="isVip"
                      checked={contractDetails.isVip}
                      onChange={(e) => updateField('isVip', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isVip" className="ml-2 text-sm text-gray-700">VIP Customer</label>
                  </div>
                </div>
              </div>

              {/* Finance-only: Date of Birth & Years at Address */}
              {isFinanceContract && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-orange-500" />
                    ADDITIONAL CUSTOMER INFO
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={contractDetails.dateOfBirth}
                        onChange={(e) => updateField('dateOfBirth', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Years at Address</label>
                      <input
                        type="number"
                        min="0"
                        value={contractDetails.yearsAtAddress}
                        onChange={(e) => updateField('yearsAtAddress', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g. 3"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Studio Info Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <MapPin className="w-4 h-4 mr-2 text-purple-500" />
                  STUDIO INFO
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Studio No.</label>
                    <input
                      type="text"
                      value={contractDetails.studioNumber}
                      onChange={(e) => updateField('studioNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Photographer</label>
                    <input
                      type="text"
                      value={contractDetails.photographer}
                      onChange={(e) => updateField('photographer', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Invoice No.</label>
                    <input
                      type="text"
                      value={contractDetails.invoiceNumber}
                      onChange={(e) => updateField('invoiceNumber', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Order Details Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <Package className="w-4 h-4 mr-2 text-green-500" />
                  ORDER DETAILS
                </h3>
                <div className="space-y-3">
                  {/* Digital Images */}
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="digitalImages"
                        checked={contractDetails.digitalImages}
                        onChange={(e) => updateField('digitalImages', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="digitalImages" className="ml-2 text-sm text-gray-700">Digital Images</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="text-xs text-gray-500">Qty:</label>
                      <input
                        type="text"
                        value={contractDetails.digitalImagesQty}
                        onChange={(e) => updateField('digitalImagesQty', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="All"
                      />
                    </div>
                  </div>

                  {/* Digital Z-Card */}
                  <div className="flex items-center bg-gray-50 p-3 rounded-lg">
                    <input
                      type="checkbox"
                      id="digitalZCard"
                      checked={contractDetails.digitalZCard}
                      onChange={(e) => updateField('digitalZCard', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="digitalZCard" className="ml-2 text-sm text-gray-700">Digital Z-Card</label>
                  </div>

                  {/* E-Folio */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        id="efolio"
                        checked={contractDetails.efolio}
                        onChange={(e) => updateField('efolio', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="efolio" className="ml-2 text-sm text-gray-700">E-Folio</label>
                    </div>
                    {contractDetails.efolio && (
                      <input
                        type="text"
                        value={contractDetails.efolioUrl}
                        onChange={(e) => updateField('efolioUrl', e.target.value)}
                        placeholder="E-Folio URL"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    )}
                  </div>

                  {/* Project Influencer */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        id="projectInfluencer"
                        checked={contractDetails.projectInfluencer}
                        onChange={(e) => updateField('projectInfluencer', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="projectInfluencer" className="ml-2 text-sm text-gray-700">Project Influencer</label>
                    </div>
                    {contractDetails.projectInfluencer && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={contractDetails.influencerLogin}
                          onChange={(e) => updateField('influencerLogin', e.target.value)}
                          placeholder="Login"
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <input
                          type="text"
                          value={contractDetails.influencerPassword}
                          onChange={(e) => updateField('influencerPassword', e.target.value)}
                          placeholder="Password"
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* Permission */}
                  <div className="flex items-center bg-gray-50 p-3 rounded-lg">
                    <input
                      type="checkbox"
                      id="allowImageUse"
                      checked={contractDetails.allowImageUse}
                      onChange={(e) => updateField('allowImageUse', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="allowImageUse" className="ml-2 text-sm text-gray-700">Allow image use for marketing</label>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea
                  value={contractDetails.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Additional notes for the contract..."
                />
              </div>

              {/* Payment Section */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                  <PoundSterling className="w-4 h-4 mr-2 text-yellow-500" />
                  PAYMENT DETAILS
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  {/* Subtotal/VAT/Total */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Subtotal (excl VAT)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
                        <input
                          type="number"
                          step="0.01"
                          value={contractDetails.subtotal}
                          onChange={(e) => updateSubtotal(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">VAT ({contractDetails.vatRate || 20}%)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
                        <input
                          type="text"
                          value={contractDetails.vatAmount.toFixed(2)}
                          readOnly
                          className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Total</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
                        <input
                          type="text"
                          value={contractDetails.total.toFixed(2)}
                          readOnly
                          className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 font-semibold text-gray-800"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                      <select
                        value={contractDetails.paymentMethod}
                        onChange={(e) => {
                          const newMethod = e.target.value;
                          updateField('paymentMethod', newMethod);

                          // When switching TO finance, set finance contract defaults
                          if (newMethod === 'finance') {
                            const defaultStartDate = new Date();
                            defaultStartDate.setDate(defaultStartDate.getDate() + 30);
                            setContractDetails(prev => ({
                              ...prev,
                              paymentMethod: newMethod,
                              cashPrice: prev.total || 0,
                              deposit: 0,
                              commencingFrom: toLocalDateStr(defaultStartDate),
                              repaymentFrequency: 'monthly',
                              numberOfInstalments: 12,
                              duration: 12,
                              creditorName: authUser?.name || '',
                              creditorDate: toLocalDateStr(new Date())
                            }));
                          }

                          // When switching TO Ideal4Finance, set its flow defaults
                          if (newMethod === 'ideal4finance' && contractDetails.paymentMethod !== 'ideal4finance') {
                            const defaultStartDate = new Date();
                            defaultStartDate.setDate(defaultStartDate.getDate() + 30);
                            updateField('financeStartDate', toLocalDateStr(defaultStartDate));
                            updateField('financeFrequency', 'monthly');
                            updateField('financeDueDay', 1);
                            updateField('financeDuration', 12);
                          }

                          // Reset finance fields when switching away from finance/Ideal4Finance
                          if (newMethod !== 'finance' && newMethod !== 'ideal4finance') {
                            updateField('depositAmount', 0);
                            updateField('financeAmount', 0);
                            updateField('financeStartDate', '');
                            updateField('financeFrequency', 'monthly');
                            updateField('financeDueDay', 1);
                            updateField('financeDuration', 12);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="card">Card</option>
                        <option value="cash">Cash</option>
                        <option value="finance">Finance</option>
                        <option value="ideal4finance">Ideal4Finance</option>
                      </select>
                    </div>
                    {/* Show Auth Code for card/cash, hide for finance/Ideal4Finance */}
                    {contractDetails.paymentMethod !== 'finance' && contractDetails.paymentMethod !== 'ideal4finance' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Auth Code (if applicable)</label>
                        <input
                          type="text"
                          value={contractDetails.authCode}
                          onChange={(e) => updateField('authCode', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Card auth code"
                        />
                      </div>
                    )}
                  </div>

                  {/* FINANCE CONTRACT: Full finance agreement form */}
                  {isFinanceContract && (
                    <div className="mt-3 space-y-4">
                      {/* Affordability Assessment */}
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="text-xs font-semibold text-blue-800 mb-3 flex items-center">
                          <DollarSign className="w-3 h-3 mr-1" />
                          AFFORDABILITY ASSESSMENT
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-blue-700 mb-1">Monthly Household Income</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600">£</span>
                              <input type="number" step="0.01" min="0" value={contractDetails.monthlyIncome || ''}
                                onChange={(e) => updateField('monthlyIncome', parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-3 py-2 border border-blue-300 rounded-lg text-sm bg-white" placeholder="0.00" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-blue-700 mb-1">Priority Outgoings (Rent/Bills)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600">£</span>
                              <input type="number" step="0.01" min="0" value={contractDetails.priorityOutgoings || ''}
                                onChange={(e) => updateField('priorityOutgoings', parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-3 py-2 border border-blue-300 rounded-lg text-sm bg-white" placeholder="0.00" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-blue-700 mb-1">Other Outgoings (Lifestyle)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600">£</span>
                              <input type="number" step="0.01" min="0" value={contractDetails.otherOutgoings || ''}
                                onChange={(e) => updateField('otherOutgoings', parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-3 py-2 border border-blue-300 rounded-lg text-sm bg-white" placeholder="0.00" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-blue-700 mb-1">Disposable Balance</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600">£</span>
                              <input type="text" value={formatCurrency(financeCalc.disposableBalance).replace('£','')} readOnly
                                className="w-full pl-7 pr-3 py-2 border border-blue-200 rounded-lg text-sm bg-blue-100 text-blue-800 font-semibold" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-blue-700 mb-1">Total Expenditure</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600">£</span>
                              <input type="text" value={formatCurrency(financeCalc.totalExpenditure).replace('£','')} readOnly
                                className="w-full pl-7 pr-3 py-2 border border-blue-200 rounded-lg text-sm bg-blue-100 text-blue-800 font-semibold" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-blue-700 mb-1">Agreed Instalment Value</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600">£</span>
                              <input type="number" step="0.01" min="0" value={contractDetails.agreedInstalment || ''}
                                onChange={(e) => updateField('agreedInstalment', parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-3 py-2 border border-blue-300 rounded-lg text-sm bg-white" placeholder="0.00" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Loan & Repayment Terms */}
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <h4 className="text-xs font-semibold text-amber-800 mb-3 flex items-center">
                          <PoundSterling className="w-3 h-3 mr-1" />
                          LOAN & REPAYMENT TERMS
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Cash Price of Goods</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600">£</span>
                              <input type="number" step="0.01" min="0" value={contractDetails.cashPrice || ''}
                                onChange={(e) => updateField('cashPrice', parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-3 py-2 border border-amber-300 rounded-lg text-sm bg-white" placeholder="0.00" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Deposit</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600">£</span>
                              <input type="number" step="0.01" min="0" value={contractDetails.deposit || ''}
                                onChange={(e) => updateField('deposit', parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-3 py-2 border border-amber-300 rounded-lg text-sm bg-white" placeholder="0.00" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Amount of Credit</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600">£</span>
                              <input type="text" value={formatCurrency(financeCalc.amountOfCredit).replace('£','')} readOnly
                                className="w-full pl-7 pr-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-100 text-amber-800 font-semibold" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Admin Fee</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600">£</span>
                              <input type="number" step="0.01" min="0" value={contractDetails.adminFee || ''}
                                onChange={(e) => updateField('adminFee', parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-3 py-2 border border-amber-300 rounded-lg text-sm bg-white" placeholder="0.00" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Interest Rate (Annual %)</label>
                            <input type="number" step="0.1" min="0" value={contractDetails.interestRate || ''}
                              onChange={(e) => updateField('interestRate', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white" placeholder="0.0" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">APR (%)</label>
                            <div className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-100 text-amber-800 font-semibold">
                              {(financeCalc.apr || 0).toFixed(1)}%
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Number of Instalments</label>
                            <input type="number" min="1" max="60" value={contractDetails.numberOfInstalments || 12}
                              onChange={(e) => updateField('numberOfInstalments', parseInt(e.target.value) || 12)}
                              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Duration (months)</label>
                            <input type="number" min="1" max="60" value={contractDetails.duration || 12}
                              onChange={(e) => updateField('duration', parseInt(e.target.value) || 12)}
                              className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white" />
                          </div>
                        </div>

                        {/* Calculated summary */}
                        <div className="mt-3 pt-3 border-t border-amber-200 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Interest Amount</label>
                            <div className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-100 text-amber-800 font-semibold">
                              {formatCurrency(financeCalc.interest)}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-amber-700 mb-1">Total Charge for Credit</label>
                            <div className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-100 text-amber-800 font-semibold">
                              {formatCurrency(financeCalc.totalChargeForCredit)}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-amber-700 mb-1">Total Amount Payable</label>
                            <div className="px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-200 text-amber-900 font-bold text-base">
                              {formatCurrency(financeCalc.totalAmountPayable)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Repayment Schedule */}
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <h4 className="text-xs font-semibold text-green-800 mb-3 flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          REPAYMENT SCHEDULE
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-green-700 mb-1">Repayment Frequency</label>
                            <select value={contractDetails.repaymentFrequency || 'monthly'}
                              onChange={(e) => updateField('repaymentFrequency', e.target.value)}
                              className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white">
                              <option value="weekly">Weekly</option>
                              <option value="bi-weekly">Bi-weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-green-700 mb-1">Commencing From</label>
                            <input type="date" value={contractDetails.commencingFrom || ''}
                              onChange={(e) => updateField('commencingFrom', e.target.value)}
                              className="w-full px-3 py-2 border border-green-300 rounded-lg text-sm bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-green-700 mb-1">Monthly Repayment</label>
                            <div className="px-3 py-2 border border-green-200 rounded-lg text-sm bg-green-100 text-green-800 font-semibold">
                              {formatCurrency(financeCalc.monthlyRepayment)}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-green-700 mb-1">Daily Rate of Interest</label>
                            <div className="px-3 py-2 border border-green-200 rounded-lg text-sm bg-green-100 text-green-800 font-semibold">
                              {(financeCalc.dailyRateOfInterest || 0).toFixed(4)}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Creditor Info (auto-populated) */}
                      <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg">
                        <h4 className="text-xs font-semibold text-gray-700 mb-2">CREDITOR (Auto-populated)</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-gray-500 text-xs">Creditor Name:</span>
                            <p className="font-medium">{contractDetails.creditorName || authUser?.name || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-gray-500 text-xs">Date:</span>
                            <p className="font-medium">{contractDetails.creditorDate ? new Date(contractDetails.creditorDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}</p>
                          </div>
                        </div>
                      </div>

                      {/* Card Payment Details */}
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <h4 className="text-xs font-semibold text-red-800 mb-3 flex items-center">
                          <CreditCard className="w-3 h-3 mr-1" />
                          CARD PAYMENT DETAILS
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-xs font-medium text-red-700 mb-1">Full Name on Card</label>
                            <input type="text" value={contractDetails.cardFullName || ''}
                              onChange={(e) => updateField('cardFullName', e.target.value)}
                              className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm bg-white" placeholder="Name as it appears on card" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-red-700 mb-1">Card Number</label>
                            <input type="text" value={contractDetails.cardNumber || ''}
                              onChange={(e) => updateField('cardNumber', e.target.value)}
                              className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm bg-white font-mono" placeholder="____ ____ ____ ____" maxLength={19} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-red-700 mb-1">Expiry Date</label>
                            <input type="text" value={contractDetails.cardExpiry || ''}
                              onChange={(e) => updateField('cardExpiry', e.target.value)}
                              className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm bg-white font-mono" placeholder="MM/YY" maxLength={5} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-red-700 mb-1">Security PIN (CVV)</label>
                            <input type="text" value={contractDetails.cardCvv || ''}
                              onChange={(e) => updateField('cardCvv', e.target.value)}
                              className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm bg-white font-mono" placeholder="___" maxLength={4} />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-red-700 mb-1">Number of Payments</label>
                            <div className="px-3 py-2 border border-red-200 rounded-lg text-sm bg-red-100 text-red-800 font-semibold">
                              {contractDetails.numberOfInstalments || 12}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-red-700 mb-1">Payment Amount</label>
                            <div className="px-3 py-2 border border-red-200 rounded-lg text-sm bg-red-100 text-red-800 font-semibold">
                              {formatCurrency(financeCalc.monthlyRepayment || 0)}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-red-700 mb-1">Total Amount of Payments</label>
                            <div className="px-3 py-2 border border-red-200 rounded-lg text-sm bg-red-100 text-red-800 font-semibold">
                              {formatCurrency(financeCalc.totalAmountPayable || 0)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ideal4Finance Fields - Only shown when Ideal4Finance is selected (old invoice flow) */}
                  {contractDetails.paymentMethod === 'ideal4finance' && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <h4 className="text-xs font-semibold text-amber-800 mb-3 flex items-center">
                        <PoundSterling className="w-3 h-3 mr-1" />
                        IDEAL4FINANCE BREAKDOWN
                      </h4>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-xs font-medium text-amber-700 mb-1">Deposit Amount</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600">£</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={contractDetails.depositAmount || ''}
                              onChange={(e) => {
                                const deposit = parseFloat(e.target.value) || 0;
                                updateField('depositAmount', deposit);
                                const financeAmt = Math.max(0, contractDetails.total - deposit);
                                updateField('financeAmount', financeAmt);
                              }}
                              className="w-full pl-7 pr-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-amber-700 mb-1">Ideal4Finance Amount (Remaining)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600">£</span>
                            <input
                              type="text"
                              value={(contractDetails.financeAmount || 0).toFixed(2)}
                              readOnly
                              className="w-full pl-7 pr-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-100 text-amber-800 font-semibold"
                            />
                          </div>
                          <p className="text-xs text-amber-600 mt-1">Auto-calculated: Total - Deposit</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-center space-x-2 text-blue-700 mb-2">
                  <Eye className="w-5 h-5" />
                  <span className="font-medium">Review {isFinanceContract ? 'Invoice & Finance Agreement' : 'Contract'} Details</span>
                </div>
                <p className="text-sm text-blue-600">
                  Please review the details below before creating. Once created, these will be embedded in the {isFinanceContract ? 'contract documents' : 'contract'} PDF.
                </p>
              </div>

              {/* Customer Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                  <User className="w-4 h-4 mr-2" />
                  Customer Details
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Name:</span> <span className="font-medium">{contractDetails.customerName}</span></div>
                  {contractDetails.clientNameIfDifferent && (
                    <div><span className="text-gray-500">Client:</span> <span className="font-medium">{contractDetails.clientNameIfDifferent}</span></div>
                  )}
                  <div className="col-span-2"><span className="text-gray-500">Address:</span> <span className="font-medium">{contractDetails.address}</span></div>
                  <div><span className="text-gray-500">Postcode:</span> <span className="font-medium">{contractDetails.postcode}</span></div>
                  <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{contractDetails.phone}</span></div>
                  <div className="col-span-2"><span className="text-gray-500">Email:</span> <span className="font-medium">{contractDetails.email}</span></div>
                  {isFinanceContract && contractDetails.dateOfBirth && (
                    <div><span className="text-gray-500">DOB:</span> <span className="font-medium">{new Date(contractDetails.dateOfBirth).toLocaleDateString('en-GB')}</span></div>
                  )}
                  {isFinanceContract && contractDetails.yearsAtAddress && (
                    <div><span className="text-gray-500">Years at Address:</span> <span className="font-medium">{contractDetails.yearsAtAddress}</span></div>
                  )}
                  {contractDetails.isVip && <div className="col-span-2"><span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs">VIP</span></div>}
                </div>
              </div>

              {/* Finance: Affordability Assessment */}
              {isFinanceContract && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-blue-700 mb-2">Affordability Assessment</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-blue-600">Monthly Income:</span><span className="font-medium">{formatCurrency(contractDetails.monthlyIncome)}</span></div>
                    <div className="flex justify-between"><span className="text-blue-600">Priority Outgoings:</span><span className="font-medium">{formatCurrency(contractDetails.priorityOutgoings)}</span></div>
                    <div className="flex justify-between"><span className="text-blue-600">Other Outgoings:</span><span className="font-medium">{formatCurrency(contractDetails.otherOutgoings)}</span></div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Disposable Balance:</span><span>{formatCurrency(financeCalc.disposableBalance)}</span></div>
                    <div className="flex justify-between"><span className="text-blue-600">Agreed Instalment:</span><span className="font-semibold">{formatCurrency(contractDetails.agreedInstalment)}</span></div>
                  </div>
                </div>
              )}

              {/* Finance: Loan Terms */}
              {isFinanceContract && (
                <div className="bg-amber-50 rounded-lg p-4">
                  <h4 className="font-medium text-amber-700 mb-2">Loan & Repayment Terms</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-amber-600">Cash Price:</span><span className="font-medium">{formatCurrency(contractDetails.cashPrice)}</span></div>
                    <div className="flex justify-between"><span className="text-amber-600">Deposit:</span><span className="font-medium">{formatCurrency(contractDetails.deposit)}</span></div>
                    <div className="flex justify-between font-semibold"><span>Amount of Credit:</span><span>{formatCurrency(financeCalc.amountOfCredit)}</span></div>
                    <div className="flex justify-between"><span className="text-amber-600">Interest ({contractDetails.interestRate || 0}%):</span><span className="font-medium">{formatCurrency(financeCalc.interest)}</span></div>
                    <div className="flex justify-between"><span className="text-amber-600">Admin Fee:</span><span className="font-medium">{formatCurrency(contractDetails.adminFee)}</span></div>
                    <div className="flex justify-between font-semibold"><span>Total Charge for Credit:</span><span>{formatCurrency(financeCalc.totalChargeForCredit)}</span></div>
                    <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>Total Amount Payable:</span><span>{formatCurrency(financeCalc.totalAmountPayable)}</span></div>
                    <div className="flex justify-between mt-2"><span className="text-amber-600">{contractDetails.numberOfInstalments} instalments over {contractDetails.duration} months</span><span className="font-medium">{formatCurrency(financeCalc.monthlyRepayment)}/month</span></div>
                    <div className="flex justify-between"><span className="text-amber-600">APR:</span><span className="font-medium">{(financeCalc.apr || 0).toFixed(1)}%</span></div>
                  </div>
                </div>
              )}

              {/* Finance: Repayment & Creditor */}
              {isFinanceContract && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-medium text-green-700 mb-2">Repayment Schedule</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-green-600">Frequency:</span><span className="font-medium capitalize">{contractDetails.repaymentFrequency}</span></div>
                    <div className="flex justify-between"><span className="text-green-600">Commencing From:</span><span className="font-medium">{contractDetails.commencingFrom ? new Date(contractDetails.commencingFrom).toLocaleDateString('en-GB') : 'Not set'}</span></div>
                    <div className="flex justify-between"><span className="text-green-600">Monthly Repayment:</span><span className="font-semibold">{formatCurrency(financeCalc.monthlyRepayment)}</span></div>
                    <div className="flex justify-between"><span className="text-green-600">Daily Rate of Interest:</span><span className="font-medium">{(financeCalc.dailyRateOfInterest || 0).toFixed(4)}%</span></div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-green-200">
                    <h4 className="font-medium text-gray-700 mb-1">Creditor</h4>
                    <div className="text-sm">
                      <span className="text-gray-500">Signed by:</span> <span className="font-medium">{contractDetails.creditorName || authUser?.name}</span>
                      <span className="text-gray-400 ml-3">({contractDetails.creditorDate ? new Date(contractDetails.creditorDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')})</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Card Payment Details Review */}
              {isFinanceContract && contractDetails.cardNumber && (
                <div className="bg-red-50 rounded-lg p-4">
                  <h4 className="font-medium text-red-700 mb-2 flex items-center">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Card Payment Details
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-red-600">Name on Card:</span><span className="font-medium">{contractDetails.cardFullName}</span></div>
                    <div className="flex justify-between"><span className="text-red-600">Card Number:</span><span className="font-medium font-mono">{contractDetails.cardNumber}</span></div>
                    <div className="flex justify-between"><span className="text-red-600">Expiry:</span><span className="font-medium font-mono">{contractDetails.cardExpiry}</span></div>
                    <div className="flex justify-between"><span className="text-red-600">Payments:</span><span className="font-medium">{contractDetails.numberOfInstalments} × {formatCurrency(financeCalc.monthlyRepayment)}</span></div>
                    <div className="flex justify-between font-semibold border-t pt-1 mt-1"><span>Total:</span><span>{formatCurrency(financeCalc.totalAmountPayable)}</span></div>
                  </div>
                </div>
              )}

              {/* Order Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                  <Package className="w-4 h-4 mr-2" />
                  Order Details
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex items-center space-x-2">
                    {contractDetails.digitalImages ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    <span>Digital Images: {contractDetails.digitalImagesQty}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {contractDetails.digitalZCard ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    <span>Digital Z-Card</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {contractDetails.efolio ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    <span>E-Folio {contractDetails.efolioUrl && `(${contractDetails.efolioUrl})`}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {contractDetails.projectInfluencer ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    <span>Project Influencer</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {contractDetails.allowImageUse ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-300" />}
                    <span>Permission for image use</span>
                  </div>
                </div>
                {contractDetails.notes && (
                  <div className="mt-2 pt-2 border-t text-sm">
                    <span className="text-gray-500">Notes:</span> <span>{contractDetails.notes}</span>
                  </div>
                )}
              </div>

              {/* Payment Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2 flex items-center">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Payment Details
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Subtotal:</span>
                    <span>{formatCurrency(contractDetails.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">VAT ({contractDetails.vatRate || 20}%):</span>
                    <span>{formatCurrency(contractDetails.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-base border-t pt-1 mt-1">
                    <span>Total:</span>
                    <span>{formatCurrency(contractDetails.total)}</span>
                  </div>
                  <div className="pt-2">
                    <span className="text-gray-500">Payment Method:</span>{' '}
                    <span className="capitalize">{contractDetails.paymentMethod}</span>
                    {contractDetails.authCode && <span className="text-gray-400 ml-2">(Auth: {contractDetails.authCode})</span>}
                  </div>
                  {/* DYNAMIC: Ideal4Finance breakdown in review */}
                  {contractDetails.paymentMethod === 'ideal4finance' && (
                    <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-700">Deposit Paid:</span>
                        <span className="font-medium text-amber-800">{formatCurrency(contractDetails.depositAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-amber-700">Ideal4Finance Amount:</span>
                        <span className="font-semibold text-amber-800">{formatCurrency(contractDetails.financeAmount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Send & Track - Two Column Layout */}
          {step === 'send' && (
            <div>
              {!contract ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 text-yellow-700 mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Contract Data Missing</span>
                  </div>
                  <p className="text-sm text-yellow-600">
                    The contract was created but data is missing. Please check the console for details.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* LEFT COLUMN */}
                  <div className="space-y-4">
                    {/* Send Contract Card */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <Mail className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold text-gray-800">Send Contract</h3>
                      </div>

                      {/* Email input */}
                      <div className="mb-3">
                        <input
                          type="email"
                          value={contractDetails.email}
                          onChange={(e) => updateField('email', e.target.value)}
                          placeholder="customer@email.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* Send button */}
                      {!emailSent ? (
                        <button
                          onClick={sendContractEmail}
                          disabled={sending || !contractDetails.email}
                          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 text-sm font-medium"
                        >
                          {sending ? (
                            <>
                              <Loader className="w-4 h-4 animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4" />
                              <span>Send Email</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="flex items-center space-x-2 text-green-600 bg-green-50 rounded-lg px-3 py-2">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-sm">
                            Sent {emailSentTime && new Date(emailSentTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}

                      {/* Copy link & Preview */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={copySigningLink}
                            className="flex-1 py-2 px-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-1 text-sm"
                          >
                            {copied ? (
                              <>
                                <Check className="w-4 h-4 text-green-600" />
                                <span className="text-green-600">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Link className="w-4 h-4" />
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>
                          <a
                            href={contract?.signingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 px-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-1 text-sm"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Preview</span>
                          </a>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Link expires in 7 days</span>
                        </p>
                      </div>
                    </div>

                    {/* Auth Code Card - Only show after contract is signed */}
                    {contractStatus === 'signed' && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <CreditCard className="w-5 h-5 text-purple-600" />
                          <h3 className="font-semibold text-gray-800">Auth Code</h3>
                          <span className="text-xs text-gray-400">(internal)</span>
                        </div>

                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={localAuthCode}
                            onChange={(e) => {
                              setLocalAuthCode(e.target.value);
                              setAuthCodeSaved(false);
                            }}
                            placeholder="Enter auth code"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                          />
                          <button
                            onClick={saveAuthCode}
                            disabled={savingAuthCode || !localAuthCode.trim()}
                            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center space-x-1 transition-colors ${
                              authCodeSaved
                                ? 'bg-green-100 text-green-700'
                                : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50'
                            }`}
                          >
                            {savingAuthCode ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : authCodeSaved ? (
                              <>
                                <Check className="w-4 h-4" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" />
                                <span>Save</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="space-y-4">
                    {/* Status Card */}
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full ${contractStatus === 'signed' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}></div>
                          <h3 className="font-semibold text-gray-800">Status</h3>
                        </div>
                        {contractStatus !== 'signed' && (
                          <span className="text-xs text-gray-400 flex items-center space-x-1">
                            <RefreshCw className={`w-3 h-3 ${checkingStatus ? 'animate-spin' : ''}`} />
                            <span>Live</span>
                          </span>
                        )}
                      </div>

                      {contractStatus === 'signed' ? (
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <CheckCircle className="w-7 h-7 text-green-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-green-800">Signed</p>
                              <p className="text-sm text-green-600">
                                {contract?.signedAt && new Date(contract.signedAt).toLocaleString('en-GB', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                          {(contract?.signed_pdf_url || contract?.pdfUrl) && (
                            <a
                              href={contract.signed_pdf_url || contract.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 text-sm font-medium"
                            >
                              <Download className="w-4 h-4" />
                              <span>Download PDF</span>
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="bg-amber-50 rounded-lg p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <Clock className="w-7 h-7 text-amber-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-amber-800">Awaiting Signature</p>
                              <p className="text-sm text-amber-600">
                                {emailSentTime
                                  ? `Sent ${Math.floor((Date.now() - new Date(emailSentTime).getTime()) / 60000)} mins ago`
                                  : 'Waiting for customer'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Delivery Email Card - Only show after signing */}
                    {contractStatus === 'signed' && (
                      <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <Mail className={`w-5 h-5 ${deliveryEmailError ? 'text-red-600' : deliveryEmailSent ? 'text-green-600' : 'text-gray-400'}`} />
                          <h3 className="font-semibold text-gray-800">Delivery Email</h3>
                        </div>

                        {/* Successfully sent */}
                        {deliveryEmailSent === true && !deliveryEmailError ? (
                          <div className="space-y-3">
                            <div className="bg-green-50 rounded-lg p-3">
                              <div className="flex items-center space-x-2 text-green-700">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-sm font-medium">Sent Successfully</span>
                              </div>
                              <p className="text-sm text-green-600 mt-1">
                                To: {deliveryEmailTo}
                              </p>
                              <p className="text-xs text-green-500 mt-1">
                                {deliveryEmailTime && new Date(deliveryEmailTime).toLocaleString('en-GB', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                              <p className="text-xs text-green-500 mt-1">
                                PDF + {deliveryPhotoCount || selectedPhotoCount || selectedPhotoIds?.length || 0} images attached
                              </p>
                            </div>

                            <button
                              onClick={resendDeliveryEmail}
                              disabled={resendingDelivery}
                              className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2 text-sm"
                            >
                              {resendingDelivery ? (
                                <>
                                  <Loader className="w-4 h-4 animate-spin" />
                                  <span>Resending...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-4 h-4" />
                                  <span>Resend Delivery</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : deliveryEmailError ? (
                          /* Has actual error - show error and resend button */
                          <div className="space-y-3">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="flex items-center space-x-2 text-red-700">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-sm font-medium">Failed to Send</span>
                              </div>
                              <p className="text-sm text-red-600 mt-1">
                                {deliveryEmailError}
                              </p>
                              {deliveryEmailTime && (
                                <p className="text-xs text-red-400 mt-1">
                                  Attempted: {new Date(deliveryEmailTime).toLocaleString('en-GB', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                              )}
                            </div>

                            <button
                              onClick={resendDeliveryEmail}
                              disabled={resendingDelivery}
                              className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2 text-sm font-medium"
                            >
                              {resendingDelivery ? (
                                <>
                                  <Loader className="w-4 h-4 animate-spin" />
                                  <span>Retrying...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-4 h-4" />
                                  <span>Retry Sending</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          /* Status pending/unknown - show loading or send option */
                          <div className="space-y-3">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <div className="flex items-center space-x-2 text-blue-700">
                                <Loader className="w-4 h-4 animate-spin" />
                                <span className="text-sm font-medium">Processing...</span>
                              </div>
                              <p className="text-sm text-blue-600 mt-1">
                                Delivery email is being sent automatically. This may take a moment.
                              </p>
                            </div>

                            <button
                              onClick={resendDeliveryEmail}
                              disabled={resendingDelivery}
                              className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2 text-sm"
                            >
                              {resendingDelivery ? (
                                <>
                                  <Loader className="w-4 h-4 animate-spin" />
                                  <span>Sending...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-4 h-4" />
                                  <span>Send Manually</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-between flex-shrink-0">
          <div>
            {step !== 'edit' && step !== 'send' && (
              <button
                onClick={() => setStep(step === 'review' ? 'edit' : 'review')}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
            {step === 'send' && !emailSent && (
              <button
                onClick={() => setStep('edit')}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-1"
              >
                <Edit2 className="w-4 h-4" />
                <span>Edit Details</span>
              </button>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {emailSent ? 'Done' : 'Cancel'}
            </button>

            {step === 'edit' && (
              <button
                onClick={() => setStep('review')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-1"
              >
                <span>Review</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {step === 'review' && (
              <button
                onClick={createContract}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Create Contract</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SendContractModal;
