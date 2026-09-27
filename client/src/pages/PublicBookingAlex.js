import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheck, FiChevronLeft, FiChevronRight, FiUser, FiMail, FiCalendar, FiClock, FiEdit2 } from 'react-icons/fi';

const PublicBookingAlex = () => {
  const { leadId } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lead, setLead] = useState(null);
  const [calendarData, setCalendarData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [currentStep, setCurrentStep] = useState(1);
  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxBookingDate = new Date(today);
  maxBookingDate.setDate(today.getDate() + 21);

  const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxMonth = new Date(maxBookingDate.getFullYear(), maxBookingDate.getMonth(), 1);
  const isAtMinMonth = currentMonth.getFullYear() === minMonth.getFullYear() && currentMonth.getMonth() === minMonth.getMonth();
  const isAtMaxMonth = currentMonth.getFullYear() === maxMonth.getFullYear() && currentMonth.getMonth() === maxMonth.getMonth();

  const isDateTooFar = (date) => {
    if (!date) return true;
    return date > maxBookingDate;
  };

  const timeSlots = [
    '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
    '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30'
  ];

  const formatLocalDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      const startStr = formatLocalDate(startDate);
      const endStr = formatLocalDate(endDate);

      const [leadResponse, availabilityResponse] = await Promise.all([
        axios.get(`/api/public/booking-alex/lead/${leadId}`),
        axios.get(`/api/public/booking-alex/availability?start=${startStr}&end=${endStr}`)
      ]);

      setLead(leadResponse.data);
      setName(leadResponse.data.name || '');
      setEmail(leadResponse.data.email || '');
      setCalendarData(availabilityResponse.data || []);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Unable to load booking page. Please try again later.');
      setLoading(false);
    }
  }, [leadId, currentMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;

    const days = [];
    for (let i = 0; i < adjustedStartDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
    return days;
  };

  const isDateBlocked = (date) => {
    if (!date) return true;
    const dateStr = formatLocalDate(date);
    const dayData = calendarData.find(d => d.date === dateStr);
    return dayData && !dayData.available;
  };

  const isDateInPast = (date) => {
    if (!date) return true;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return date < now;
  };

  const getBookedTimes = (date) => {
    if (!date) return [];
    const dateStr = formatLocalDate(date);
    const dayData = calendarData.find(d => d.date === dateStr);
    if (!dayData) return [];
    return dayData.bookedTimes || [];
  };

  const getAvailableCount = (date) => {
    if (!date || isDateBlocked(date) || isDateInPast(date) || isDateTooFar(date)) return 0;
    const bookedTimes = getBookedTimes(date);
    return timeSlots.filter(t => {
      const bookedCount = bookedTimes.filter(bt => bt === t).length;
      return bookedCount < 4;
    }).length;
  };

  const handleDateSelect = (date) => {
    if (!date || isDateBlocked(date) || isDateInPast(date) || getAvailableCount(date) === 0) return;
    setSelectedDate(date);
    setSelectedTime(null);
    setCurrentStep(3);
  };

  const handleTimeSelect = (time) => {
    setSelectedTime(time);
    setCurrentStep(4);
  };

  const handleSubmitBooking = async () => {
    if (!selectedDate || !selectedTime) return;
    try {
      setSubmitting(true);
      setError(null);
      const response = await axios.post(`/api/public/booking-alex/book/${leadId}`, {
        date: formatLocalDate(selectedDate),
        time: selectedTime,
        name: name,
        email: email
      });
      if (response.data.success) setSuccess(true);
      else setError(response.data.message || 'Failed to book appointment');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to book. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const days = getDaysInMonth();
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weekDaysFull = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-[#1a1a1a]/10 border-t-[#1e3a5f] rounded-full mx-auto mb-4 sm:mb-6" />
          <p className="text-[#1a1a1a]/60 text-base sm:text-lg tracking-wide">Loading your booking...</p>
        </motion.div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="max-w-lg w-full text-center px-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-2xl shadow-emerald-500/30">
            <FiCheck className="w-10 h-10 sm:w-12 sm:h-12 text-white" strokeWidth={3} />
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-2xl sm:text-4xl font-light text-[#1a1a1a] mb-4 tracking-tight">
            Booking Confirmed
          </motion.h1>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/5 border border-black/5">
            <p className="text-[#1a1a1a]/60 mb-3 sm:mb-4 text-sm sm:text-base">Your appointment is scheduled for</p>
            <p className="text-lg sm:text-2xl font-medium text-[#1a1a1a] mb-2">
              {selectedDate?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <p className="text-2xl sm:text-3xl font-light text-[#1a1a1a]">{selectedTime}</p>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="mt-6 sm:mt-8 text-[#1a1a1a]/40 text-xs sm:text-sm px-4">
            A confirmation has been sent to {email}
          </motion.p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="fixed inset-0 bg-gradient-to-br from-white via-transparent to-[#f0f0f0] pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex justify-center sm:justify-start mb-4 sm:mb-0 sm:absolute sm:top-8 sm:left-6">
          <img src="/images/company-logo.svg" alt="Aura Models" className="h-12 sm:h-16 w-auto" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6 sm:mb-12 pt-2 sm:pt-8">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extralight text-[#1a1a1a] tracking-tight mb-2 sm:mb-3">Book Your Session</h1>
          <p className="text-[#1a1a1a]/50 text-sm sm:text-lg">Select your preferred date and time</p>
        </motion.div>

        {/* Progress Bar */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex justify-center mb-8 sm:mb-16 px-2">
          <div className="flex items-center gap-1 sm:gap-3">
            {[
              { num: 1, label: 'Details', color: 'from-[#1e3a5f] to-[#152a45]', shadow: 'shadow-blue-900/40' },
              { num: 2, label: 'Date', color: 'from-[#D4145A] to-[#B8124E]', shadow: 'shadow-pink-500/40' },
              { num: 3, label: 'Time', color: 'from-[#9B2335] to-[#7A1C2A]', shadow: 'shadow-rose-600/40' },
              { num: 4, label: 'Confirm', color: 'from-[#C9A227] to-[#A88B1F]', shadow: 'shadow-amber-500/40' }
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
                    className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold transition-all duration-500 ${
                      currentStep > step.num
                        ? `bg-gradient-to-br ${step.color} text-white shadow-lg ${step.shadow}`
                        : currentStep === step.num
                          ? `bg-gradient-to-br ${step.color} text-white shadow-xl ${step.shadow} scale-105 sm:scale-110 ring-2 sm:ring-4 ring-white ring-offset-1 sm:ring-offset-2`
                          : 'bg-white text-[#1a1a1a]/30 border-2 border-[#1a1a1a]/10'
                    }`}>
                    {currentStep > step.num ? <FiCheck className="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={3} /> : step.num}
                  </motion.div>
                  <span className={`text-[10px] sm:text-xs mt-1 sm:mt-2 font-semibold tracking-wide transition-all duration-300 hidden sm:block ${
                    currentStep > step.num ? step.num === 1 ? 'text-[#1e3a5f]' : 'text-[#C41230]' : currentStep === step.num ? 'text-[#1a1a1a]' : 'text-[#1a1a1a]/30'
                  }`}>{step.label}</span>
                </motion.button>
                {idx < 3 && (
                  <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: currentStep > step.num ? 1 : 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={`w-6 sm:w-16 h-0.5 sm:h-1 rounded-full origin-left transition-all duration-500 ${
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
            <motion.div key="step1" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="max-w-xl mx-auto px-2 sm:px-0">
              <motion.div variants={containerVariants} initial="hidden" animate="visible"
                className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/5 border border-black/5">
                <motion.h2 variants={itemVariants} className="text-xl sm:text-2xl font-light text-[#1a1a1a] mb-6 sm:mb-8 text-center">
                  Confirm Your Details
                </motion.h2>
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
                <motion.button variants={itemVariants} onClick={() => setCurrentStep(2)}
                  whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                  className="w-full py-4 sm:py-5 bg-[#1a1a1a] text-white rounded-xl font-medium text-base sm:text-lg shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 transition-all">
                  Continue to Calendar
                </motion.button>
              </motion.div>
            </motion.div>
          )}

          {/* Step 2: Calendar */}
          {currentStep === 2 && (
            <motion.div key="step2" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="px-2 sm:px-0">
              <motion.div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 lg:p-12 shadow-2xl shadow-black/5 border border-black/5">
                <div className="flex items-center justify-between mb-6 sm:mb-10">
                  <motion.button onClick={() => !isAtMinMonth && setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                    whileHover={!isAtMinMonth ? { scale: 1.1, x: -3 } : {}} whileTap={!isAtMinMonth ? { scale: 0.9 } : {}}
                    disabled={isAtMinMonth}
                    className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${isAtMinMonth ? 'bg-[#fafafa]/50 cursor-not-allowed' : 'bg-[#fafafa] hover:bg-[#f0f0f0]'}`}>
                    <FiChevronLeft className={`w-5 h-5 sm:w-6 sm:h-6 ${isAtMinMonth ? 'text-[#1a1a1a]/20' : 'text-[#1a1a1a]'}`} />
                  </motion.button>
                  <motion.h2 key={currentMonth.toString()} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="text-lg sm:text-2xl lg:text-3xl font-light text-[#1a1a1a] tracking-tight">
                    {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                  </motion.h2>
                  <motion.button onClick={() => !isAtMaxMonth && setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                    whileHover={!isAtMaxMonth ? { scale: 1.1, x: 3 } : {}} whileTap={!isAtMaxMonth ? { scale: 0.9 } : {}}
                    disabled={isAtMaxMonth}
                    className={`w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors ${isAtMaxMonth ? 'bg-[#fafafa]/50 cursor-not-allowed' : 'bg-[#fafafa] hover:bg-[#f0f0f0]'}`}>
                    <FiChevronRight className={`w-5 h-5 sm:w-6 sm:h-6 ${isAtMaxMonth ? 'text-[#1a1a1a]/20' : 'text-[#1a1a1a]'}`} />
                  </motion.button>
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 sm:mb-4">
                  {weekDays.map((day, idx) => (
                    <div key={day + idx} className="text-center py-2 sm:py-3 text-xs sm:text-sm font-medium text-[#1a1a1a]/40 uppercase tracking-wider">
                      <span className="sm:hidden">{day}</span>
                      <span className="hidden sm:inline">{weekDaysFull[idx]}</span>
                    </div>
                  ))}
                </div>

                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-7 gap-1 sm:gap-2">
                  {days.map((date, idx) => {
                    const isBlocked = date && isDateBlocked(date);
                    const isPast = date && isDateInPast(date);
                    const tooFar = date && isDateTooFar(date);
                    const available = date ? getAvailableCount(date) : 0;
                    const isUnavailable = !date || isBlocked || isPast || tooFar || available === 0;

                    return (
                      <motion.button key={idx} variants={itemVariants}
                        onClick={() => handleDateSelect(date)} disabled={isUnavailable}
                        whileHover={!isUnavailable ? { scale: 1.05, y: -2 } : {}} whileTap={!isUnavailable ? { scale: 0.95 } : {}}
                        className={`aspect-square rounded-lg sm:rounded-2xl flex flex-col items-center justify-center transition-all duration-300 min-h-[40px] sm:min-h-[60px] ${
                          !date ? '' :
                          isUnavailable
                            ? 'text-[#1a1a1a]/20 cursor-not-allowed'
                            : 'bg-[#fafafa] hover:bg-[#1a1a1a] hover:text-white cursor-pointer shadow-sm hover:shadow-xl hover:shadow-black/20 group'
                        }`}>
                        {date && (
                          <>
                            <span className="text-sm sm:text-xl font-medium">{date.getDate()}</span>
                            {!isUnavailable && available > 0 && (
                              <span className="text-[8px] sm:text-[10px] text-[#1a1a1a]/40 group-hover:text-white/60 font-medium hidden sm:block">
                                {available} slots
                              </span>
                            )}
                          </>
                        )}
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {/* Step 3: Time Selection */}
          {currentStep === 3 && selectedDate && (
            <motion.div key="step3" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="max-w-3xl mx-auto px-2 sm:px-0">
              <motion.div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 lg:p-12 shadow-2xl shadow-black/5 border border-black/5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-10 gap-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                      <FiClock className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-sm text-[#1a1a1a]/40 font-medium uppercase tracking-wider">Selected Date</p>
                      <p className="text-base sm:text-2xl font-light text-[#1a1a1a]">
                        {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                  </div>
                  <motion.button onClick={() => setCurrentStep(2)} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    className="text-[#1a1a1a]/50 hover:text-[#1a1a1a] font-medium transition-colors text-sm sm:text-base self-end sm:self-auto">
                    Change
                  </motion.button>
                </div>

                <h3 className="text-base sm:text-lg font-medium text-[#1a1a1a]/60 mb-4 sm:mb-6">Available Times</h3>

                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
                  {timeSlots.map((time, idx) => {
                    const bookedTimes = getBookedTimes(selectedDate);
                    const bookedCount = bookedTimes.filter(t => t === time).length;
                    const isBooked = bookedCount >= 4;
                    return (
                      <motion.button key={time} variants={itemVariants} custom={idx}
                        onClick={() => !isBooked && handleTimeSelect(time)} disabled={isBooked}
                        whileHover={!isBooked ? { scale: 1.05, y: -3 } : {}} whileTap={!isBooked ? { scale: 0.95 } : {}}
                        className={`py-3 sm:py-5 rounded-lg sm:rounded-xl font-medium text-sm sm:text-lg transition-all duration-300 ${
                          isBooked
                            ? 'bg-[#fafafa] text-[#1a1a1a]/20 cursor-not-allowed'
                            : 'bg-[#fafafa] hover:bg-[#1a1a1a] hover:text-white hover:shadow-xl hover:shadow-black/20'
                        }`}>
                        {time}
                      </motion.button>
                    );
                  })}
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {/* Step 4: Confirmation */}
          {currentStep === 4 && selectedDate && selectedTime && (
            <motion.div key="step4" variants={stepVariants} initial="hidden" animate="visible" exit="exit" className="max-w-xl mx-auto px-2 sm:px-0">
              <motion.div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-10 shadow-2xl shadow-black/5 border border-black/5">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#1a1a1a] flex items-center justify-center mx-auto mb-6 sm:mb-8">
                  <FiCalendar className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </motion.div>

                <h2 className="text-2xl sm:text-3xl font-light text-[#1a1a1a] text-center mb-6 sm:mb-10">Confirm Your Booking</h2>

                <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-10">
                  {[
                    { label: 'Name', value: name, delay: 0.2 },
                    { label: 'Email', value: email, delay: 0.3 },
                    { label: 'Date', value: selectedDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), delay: 0.4 },
                  ].map((item, idx) => (
                    <motion.div key={item.label} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: item.delay }}
                      className={`flex items-center justify-between py-3 sm:py-4 ${idx < 2 ? 'border-b border-[#1a1a1a]/10' : ''}`}>
                      <span className="text-[#1a1a1a]/50 text-sm sm:text-base">{item.label}</span>
                      <span className="font-medium text-[#1a1a1a] text-sm sm:text-base text-right truncate max-w-[180px] sm:max-w-none">{item.value}</span>
                    </motion.div>
                  ))}
                  <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
                    className="flex items-center justify-between py-3 sm:py-4">
                    <span className="text-[#1a1a1a]/50 text-sm sm:text-base">Time</span>
                    <span className="text-xl sm:text-2xl font-light text-[#1a1a1a]">{selectedTime}</span>
                  </motion.div>
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs sm:text-sm text-center">
                    {error}
                  </motion.div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <motion.button onClick={() => setCurrentStep(3)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="w-full sm:flex-1 py-4 sm:py-5 border-2 border-[#1a1a1a]/20 text-[#1a1a1a] rounded-xl font-medium hover:border-[#1a1a1a]/40 transition-colors order-2 sm:order-1">
                    Back
                  </motion.button>
                  <motion.button onClick={handleSubmitBooking} disabled={submitting}
                    whileHover={!submitting ? { scale: 1.02, y: -2 } : {}} whileTap={!submitting ? { scale: 0.98 } : {}}
                    className="w-full sm:flex-1 py-4 sm:py-5 bg-[#1a1a1a] text-white rounded-xl font-medium shadow-xl shadow-black/20 hover:shadow-2xl hover:shadow-black/30 transition-all disabled:opacity-50 order-1 sm:order-2">
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                        Booking...
                      </span>
                    ) : 'Confirm Booking'}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default PublicBookingAlex;
