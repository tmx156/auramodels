import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheck, FiUser, FiMail, FiEdit2, FiCreditCard, FiLock, FiShield } from 'react-icons/fi';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Stripe Card Hold Form (saves card without charging)
const CardHoldForm = ({ clientSecret, leadId, onSuccess, processing, setProcessing }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setCardError(null);

    try {
      const { error, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: elements.getElement(CardElement) }
      });

      if (error) {
        setCardError(error.message);
        setProcessing(false);
        return;
      }

      if (setupIntent.status === 'succeeded') {
        // Confirm with backend and get card details
        const { data } = await axios.post('/api/stripe/confirm-setup', {
          setupIntentId: setupIntent.id,
          leadId
        });

        if (data.success) {
          onSuccess(data.paymentMethodId, data.card);
        } else {
          setCardError(data.message || 'Failed to save card. Please try again.');
        }
      } else {
        setCardError('Card verification was not completed. Please try again.');
      }
    } catch (err) {
      setCardError('Something went wrong. Please try again.');
    }
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-[#fafafa] rounded-xl p-4 sm:p-6 mb-4 sm:mb-6 border-2 border-[#1a1a1a]/10">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#1a1a1a',
                '::placeholder': { color: '#1a1a1a50' },
                fontFamily: 'system-ui, -apple-system, sans-serif'
              },
              invalid: { color: '#dc2626' }
            },
            hidePostalCode: true
          }}
        />
      </div>

      {cardError && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs sm:text-sm text-center"
        >
          {cardError}
        </motion.div>
      )}

      <motion.button
        type="submit"
        disabled={!stripe || processing}
        whileHover={!processing ? { scale: 1.02, y: -2 } : {}}
        whileTap={!processing ? { scale: 0.98 } : {}}
        className="w-full py-4 sm:py-5 bg-[#1a1a1a] text-white rounded-xl font-medium text-base sm:text-lg shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 transition-all disabled:opacity-50"
      >
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
            />
            Saving Card...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <FiLock className="w-4 h-4" />
            Save Card & Continue
          </span>
        )}
      </motion.button>
    </form>
  );
};

const PublicBooking = () => {
  const { leadId } = useParams();
  const [loading, setLoading] = useState(true);
  const [lead, setLead] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [stripePromise, setStripePromise] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  // paymentMethodId stored in handleCardSaved closure, not needed as state
  const [cardSaved, setCardSaved] = useState(false);
  const [cardDetails, setCardDetails] = useState(null);
  const [cardProcessing, setCardProcessing] = useState(false);
  const [stripeError, setStripeError] = useState(null);
  const [currentStep, setCurrentStep] = useState(1); // 1 = details, 2 = card, 3 = done
  const [saving, setSaving] = useState(false);

  // --- DISABLED: Calendar booking steps (kept for future use) ---
  // const [calendarData, setCalendarData] = useState([]);
  // const [blockedSlots, setBlockedSlots] = useState([]);
  // const [selectedDate, setSelectedDate] = useState(null);
  // const [selectedTime, setSelectedTime] = useState(null);
  // const [submitting, setSubmitting] = useState(false);
  // const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  // --- END DISABLED ---

  // Fetch lead data and init Stripe on mount
  const fetchLead = useCallback(async () => {
    try {
      setLoading(true);
      const leadResponse = await axios.get(`/api/public/booking/lead/${leadId}`);
      setLead(leadResponse.data);
      setName(leadResponse.data.name || '');
      setEmail(leadResponse.data.email || '');
      setLoading(false);
    } catch (err) {
      console.error('Error fetching lead:', err);
      setError('Unable to load page. Please check your link and try again.');
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  // Init Stripe once lead is loaded
  const initStripe = useCallback(async (forceRefresh = false) => {
    setStripeError(null);
    try {
      let stripe = forceRefresh ? null : stripePromise;
      if (!stripe) {
        const { data } = await axios.get('/api/stripe/config');
        if (data.publishableKey) {
          stripe = loadStripe(data.publishableKey);
          setStripePromise(stripe);
        } else {
          throw new Error('Stripe not configured');
        }
      }

      const secret = forceRefresh ? null : clientSecret;
      if (!secret) {
        const { data } = await axios.post('/api/stripe/create-setup-intent', {
          leadId: lead?.id || leadId,
          email,
          name
        });
        if (data.success) {
          setClientSecret(data.clientSecret);
          setStripeCustomerId(data.customerId);
        } else {
          throw new Error('Failed to create payment setup');
        }
      }
    } catch (err) {
      console.error('Stripe initialization failed:', err);
      setStripeError('Unable to load payment. Please try again.');
    }
  }, [stripePromise, clientSecret, lead, leadId, email, name]);

  useEffect(() => {
    if (lead && currentStep === 2 && (!stripePromise || !clientSecret)) {
      initStripe(false);
    }
  }, [lead, currentStep, stripePromise, clientSecret, initStripe]);

  // After card saved, persist to lead record
  const handleCardSaved = async (pmId, card) => {
    setCardDetails(card);
    setCardSaved(true);
    setSaving(true);

    try {
      await axios.post(`/api/public/booking/save-card/${leadId}`, {
        paymentMethodId: pmId,
        stripeCustomerId,
        name,
        email
      });
      setSaving(false);
      setSuccess(true);
    } catch (err) {
      console.error('Error saving card to lead:', err);
      setSaving(false);
      setSuccess(true); // Still show success — card IS saved in Stripe
    }
  };

  const handleContinueToCard = () => {
    if (!name || !name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!email || !email.trim()) {
      setError('Please enter your email address');
      return;
    }
    setError(null);
    setCurrentStep(2);
  };

  const stepVariants = {
    hidden: { opacity: 0, x: 50, scale: 0.95 },
    visible: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
    exit: { opacity: 0, x: -50, scale: 0.95, transition: { duration: 0.3 } }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }
  };

  // --- DISABLED: Calendar booking helper functions (kept for future use) ---
  // const getDaysInMonth = () => { ... };
  // const isDateBlocked = (date) => { ... };
  // const isDateInPast = (date) => { ... };
  // const getBookedTimes = (date) => { ... };
  // const getAvailableCount = (date) => { ... };
  // const handleDateSelect = (date) => { ... };
  // const handleTimeSelect = async (time) => { ... };
  // const handleSubmitBooking = async () => { ... };
  // --- END DISABLED ---

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-[#1a1a1a]/10 border-t-[#1e3a5f] rounded-full mx-auto mb-4 sm:mb-6" />
          <p className="text-[#1a1a1a]/60 text-base sm:text-lg tracking-wide">Loading...</p>
        </motion.div>
      </div>
    );
  }

  // Error State
  if (error && !lead) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center px-4">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">!</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-light text-[#1a1a1a] mb-4">Link Not Found</h1>
          <p className="text-[#1a1a1a]/60 mb-6">{error}</p>
          <p className="text-[#1a1a1a]/40 text-sm">Please check your link and try again, or contact support.</p>
        </motion.div>
      </div>
    );
  }

  // Success State — Card Saved
  if (success) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="max-w-lg w-full text-center px-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-2xl shadow-emerald-500/30">
            <FiCheck className="w-10 h-10 sm:w-12 sm:h-12 text-white" strokeWidth={3} />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-2xl sm:text-4xl font-light text-[#1a1a1a] mb-4 tracking-tight">
            Card Secured
          </motion.h1>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/5 border border-black/5">
            <p className="text-[#1a1a1a]/60 mb-3 sm:mb-4 text-sm sm:text-base">Your card has been securely saved</p>
            {cardDetails && (
              <p className="text-lg sm:text-2xl font-medium text-[#1a1a1a] mb-2">
                {cardDetails.brand.toUpperCase()} ****{cardDetails.last4}
              </p>
            )}
            <p className="text-[#1a1a1a]/40 text-sm mt-4">You will not be charged. Your card is held as a booking guarantee.</p>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="mt-6 sm:mt-8 text-[#1a1a1a]/40 text-xs sm:text-sm px-4">
            Thank you, {name}. You can now close this page.
          </motion.p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="fixed inset-0 bg-gradient-to-br from-white via-transparent to-[#f0f0f0] pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex justify-center sm:justify-start mb-4 sm:mb-0 sm:absolute sm:top-8 sm:left-6">
          <img src="/images/company-logo.svg" alt="Aura Models" className="h-12 sm:h-16 w-auto" />
        </motion.div>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6 sm:mb-12 pt-2 sm:pt-8">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extralight text-[#1a1a1a] tracking-tight mb-2 sm:mb-3">
            Secure Your Photo Assessment
          </h1>
          <p className="text-[#1a1a1a]/50 text-sm sm:text-lg">Save your card to confirm your appointment</p>
        </motion.div>

        {/* Progress Bar — 2 steps: Details → Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="flex justify-center mb-8 sm:mb-16 px-2">
          <div className="flex items-center gap-2 sm:gap-4">
            {[
              { num: 1, label: 'Details', color: 'from-[#1e3a5f] to-[#152a45]', shadow: 'shadow-blue-900/40' },
              { num: 2, label: 'Card', color: 'from-[#6B46C1] to-[#553C9A]', shadow: 'shadow-purple-500/40' }
            ].map((step, idx) => (
              <React.Fragment key={step.num}>
                <motion.button
                  onClick={() => step.num < currentStep && setCurrentStep(step.num)}
                  whileHover={step.num < currentStep ? { scale: 1.1 } : {}}
                  whileTap={step.num < currentStep ? { scale: 0.95 } : {}}
                  className={`flex flex-col items-center transition-all duration-500 ${step.num < currentStep ? 'cursor-pointer' : 'cursor-default'}`}>
                  <motion.div
                    animate={currentStep === step.num ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 0.5, repeat: currentStep === step.num ? Infinity : 0, repeatDelay: 2 }}
                    className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-sm sm:text-base font-semibold transition-all duration-500 ${
                      currentStep > step.num
                        ? `bg-gradient-to-br ${step.color} text-white shadow-lg ${step.shadow}`
                        : currentStep === step.num
                          ? `bg-gradient-to-br ${step.color} text-white shadow-xl ${step.shadow} scale-110 ring-2 sm:ring-4 ring-white ring-offset-2`
                          : 'bg-white text-[#1a1a1a]/30 border-2 border-[#1a1a1a]/10'
                    }`}>
                    {currentStep > step.num ? <FiCheck className="w-5 h-5" strokeWidth={3} /> : step.num}
                  </motion.div>
                  <span className={`text-xs mt-2 font-semibold tracking-wide transition-all duration-300 ${
                    currentStep > step.num ? 'text-[#1e3a5f]' : currentStep === step.num ? 'text-[#1a1a1a]' : 'text-[#1a1a1a]/30'
                  }`}>{step.label}</span>
                </motion.button>
                {idx < 1 && (
                  <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: currentStep > step.num ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={`w-12 sm:w-24 h-1 rounded-full origin-left transition-all duration-500 ${
                      currentStep > step.num ? `bg-gradient-to-r ${step.color}` : 'bg-[#1a1a1a]/10'
                    }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </motion.div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {/* Step 1: Confirm Details */}
          {currentStep === 1 && (
            <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="exit"
              className="max-w-xl mx-auto px-2 sm:px-0">
              <motion.div variants={containerVariants} initial="hidden" animate="visible"
                className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/5 border border-black/5">
                <motion.h2 variants={itemVariants} className="text-xl sm:text-2xl font-light text-[#1a1a1a] mb-6 sm:mb-8 text-center">
                  Confirm Your Details
                </motion.h2>

                {/* Name Field */}
                <motion.div variants={itemVariants} className="mb-4 sm:mb-6">
                  <label className="text-[10px] sm:text-xs font-medium text-[#1a1a1a]/40 uppercase tracking-wider mb-2 sm:mb-3 block">Your Name</label>
                  <div className="relative group">
                    <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-[#1a1a1a]/30"><FiUser className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                    {editingName ? (
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setEditingName(false)} autoFocus
                        className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 text-base sm:text-xl text-[#1a1a1a] bg-[#fafafa] rounded-xl border-2 border-[#1a1a1a] outline-none transition-all" />
                    ) : (
                      <div onClick={() => setEditingName(true)}
                        className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-3 sm:py-4 text-base sm:text-xl text-[#1a1a1a] bg-[#fafafa] rounded-xl border-2 border-transparent hover:border-[#1a1a1a]/20 cursor-pointer transition-all group">
                        {name || 'Enter your name'}
                        <FiEdit2 className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1a1a1a]/30 group-hover:text-[#1a1a1a]/60 transition-colors" />
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Email Field */}
                <motion.div variants={itemVariants} className="mb-6 sm:mb-10">
                  <label className="text-[10px] sm:text-xs font-medium text-[#1a1a1a]/40 uppercase tracking-wider mb-2 sm:mb-3 block">Email Address</label>
                  <div className="relative group">
                    <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-[#1a1a1a]/30"><FiMail className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                    {editingEmail ? (
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setEditingEmail(false)} autoFocus
                        className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 text-base sm:text-xl text-[#1a1a1a] bg-[#fafafa] rounded-xl border-2 border-[#1a1a1a] outline-none transition-all" />
                    ) : (
                      <div onClick={() => setEditingEmail(true)}
                        className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-3 sm:py-4 text-base sm:text-xl text-[#1a1a1a] bg-[#fafafa] rounded-xl border-2 border-transparent hover:border-[#1a1a1a]/20 cursor-pointer transition-all group truncate">
                        {email || 'Enter your email'}
                        <FiEdit2 className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1a1a1a]/30 group-hover:text-[#1a1a1a]/60 transition-colors" />
                      </div>
                    )}
                  </div>
                </motion.div>

                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs sm:text-sm text-center">{error}</motion.div>
                )}

                <motion.button variants={itemVariants} onClick={handleContinueToCard}
                  whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                  className="w-full py-4 sm:py-5 bg-[#1a1a1a] text-white rounded-xl font-medium text-base sm:text-lg shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 transition-all">
                  Continue
                </motion.button>
              </motion.div>
            </motion.div>
          )}

          {/* Step 2: Card Hold */}
          {currentStep === 2 && (
            <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="exit"
              className="max-w-xl mx-auto px-2 sm:px-0">
              <motion.div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/5 border border-black/5">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-[#6B46C1] to-[#553C9A] flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-2xl shadow-purple-500/30">
                  <FiCreditCard className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </motion.div>

                <h2 className="text-2xl sm:text-3xl font-light text-[#1a1a1a] text-center mb-2 sm:mb-3">
                  Secure Your Photo Assessment
                </h2>
                <p className="text-center text-[#1a1a1a]/60 text-sm sm:text-base mb-6 sm:mb-8">
                  We require a card on file to secure your Photo Assessment. <strong className="text-[#6B46C1] font-bold">You will not be charged.</strong>
                </p>

                {/* Trust badges */}
                <div className="flex items-center justify-center gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="flex items-center gap-1.5 text-[#1a1a1a]/40 text-xs sm:text-sm">
                    <FiLock className="w-3.5 h-3.5" /><span>SSL Encrypted</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#1a1a1a]/40 text-xs sm:text-sm">
                    <FiShield className="w-3.5 h-3.5" /><span>£0 Charge</span>
                  </div>
                </div>

                {/* No-show policy */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 mb-6 sm:mb-8">
                  <p className="text-amber-800 text-xs sm:text-sm text-center">
                    A <strong>£50 no-show fee</strong> applies if you miss your appointment without giving 24 hours notice.
                  </p>
                </div>

                {cardSaved ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FiCheck className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-600" strokeWidth={3} />
                    </div>
                    <p className="text-lg font-medium text-[#1a1a1a] mb-1">Card Saved</p>
                    {cardDetails && (
                      <p className="text-[#1a1a1a]/50 text-sm mb-4">{cardDetails.brand.toUpperCase()} ending in {cardDetails.last4}</p>
                    )}
                    {saving && <p className="text-[#1a1a1a]/40 text-sm">Saving...</p>}
                  </motion.div>
                ) : stripeError ? (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-red-500 text-2xl">!</span>
                    </div>
                    <p className="text-red-600 text-sm mb-4">{stripeError}</p>
                    <motion.button onClick={() => initStripe(true)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      className="px-6 py-2.5 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium">
                      Retry
                    </motion.button>
                  </div>
                ) : stripePromise && clientSecret ? (
                  <Elements stripe={stripePromise} options={{ appearance: { theme: 'stripe', variables: { colorPrimary: '#1a1a1a', borderRadius: '12px' } } }}>
                    <CardHoldForm
                      clientSecret={clientSecret}
                      leadId={lead?.id || leadId}
                      onSuccess={handleCardSaved}
                      processing={cardProcessing}
                      setProcessing={setCardProcessing}
                    />
                  </Elements>
                ) : (
                  <div className="text-center py-8">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                      className="w-8 h-8 border-2 border-[#1a1a1a]/10 border-t-[#6B46C1] rounded-full mx-auto mb-3" />
                    <p className="text-[#1a1a1a]/50 text-sm">Loading secure payment...</p>
                  </div>
                )}

                <motion.button onClick={() => setCurrentStep(1)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="mt-4 w-full py-3 sm:py-4 border-2 border-[#1a1a1a]/20 text-[#1a1a1a]/60 rounded-xl font-medium hover:border-[#1a1a1a]/40 hover:text-[#1a1a1a] transition-colors">
                  Back to Details
                </motion.button>
              </motion.div>
            </motion.div>
          )}

          {/*
          --- DISABLED: Old calendar booking steps (kept for future use) ---
          Steps 2 (Calendar), 3 (Time), 4 (Old Card Hold), 5 (Confirm Booking)
          were removed from the active render. The booking flow now only captures
          card details. To re-enable calendar booking, restore these steps and
          update currentStep logic. Original code preserved in git history.
          */}
          {/* End of active steps */}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PublicBooking;

// --- DISABLED: Old calendar booking steps ---
// Steps 2 (Calendar), 3 (Time), 4 (Old Card Hold), 5 (Confirm Booking)
// were removed from the active render. The booking flow now only captures
// card details. To re-enable, check git history for the full step code.

