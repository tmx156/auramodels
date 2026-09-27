import { toZonedTime, format, fromZonedTime } from 'date-fns-tz';

// Centralized timezone for the entire CRM
export const CRM_TIMEZONE = 'Europe/London';

/**
 * Get current UK time as a Date object
 */
export const getCurrentUKTime = () => {
  const now = new Date();
  return toZonedTime(now, CRM_TIMEZONE);
};

/**
 * Get current UK date in YYYY-MM-DD format
 */
export const getTodayUK = () => {
  const ukNow = getCurrentUKTime();
  return format(ukNow, 'yyyy-MM-dd', { timeZone: CRM_TIMEZONE });
};

/**
 * Get current UK hour (0-23)
 */
export const getCurrentUKHour = () => {
  const ukNow = getCurrentUKTime();
  return ukNow.getHours();
};

/**
 * Get time-based greeting
 */
export const getGreeting = (userName) => {
  const hour = getCurrentUKHour();
  let greeting = '';
  
  if (hour >= 5 && hour < 12) {
    greeting = 'Good Morning';
  } else if (hour >= 12 && hour < 17) {
    greeting = 'Good Afternoon';
  } else {
    greeting = 'Good Evening';
  }
  
  return `${greeting}, ${userName}`;
};

/**
 * Convert any date to UK timezone
 */
export const toUKTime = (date) => {
  return toZonedTime(date, CRM_TIMEZONE);
};

/**
 * Format a date in UK timezone
 */
export const formatUKTime = (date, formatString = 'yyyy-MM-dd HH:mm:ss') => {
  const ukDate = toUKTime(date);
  return format(ukDate, formatString, { timeZone: CRM_TIMEZONE });
};

/**
 * Get UK time string for display (HH:mm:ss)
 */
export const getUKTimeString = (date = new Date()) => {
  return formatUKTime(date, 'HH:mm:ss');
};

/**
 * Get UK date string for display (DD/MM/YYYY)
 */
export const getUKDateString = (date = new Date()) => {
  return formatUKTime(date, 'dd/MM/yyyy');
};

/**
 * Get UK datetime string for display (DD/MM/YYYY HH:mm)
 */
export const getUKDateTimeString = (date = new Date()) => {
  return formatUKTime(date, 'dd/MM/yyyy HH:mm');
};

/**
 * Convert UK time to UTC for database storage
 */
export const ukTimeToUTC = (ukDate) => {
  return fromZonedTime(ukDate, CRM_TIMEZONE);
};

/**
 * Check if a date is today in UK timezone
 */
export const isToday = (date) => {
  const ukDate = toUKTime(date);
  const today = getCurrentUKTime();
  
  return ukDate.getDate() === today.getDate() &&
         ukDate.getMonth() === today.getMonth() &&
         ukDate.getFullYear() === today.getFullYear();
};

/**
 * Get start of day in UK timezone
 */
export const getStartOfDayUK = (date = new Date()) => {
  const ukDate = toUKTime(date);
  ukDate.setHours(0, 0, 0, 0);
  return ukDate;
};

/**
 * Get end of day in UK timezone
 */
export const getEndOfDayUK = (date = new Date()) => {
  const ukDate = toUKTime(date);
  ukDate.setHours(23, 59, 59, 999);
  return ukDate;
};

/**
 * Extract YYYY-MM-DD from a Date using LOCAL time (not UTC).
 * Replaces the broken .toISOString().split('T')[0] pattern which
 * converts to UTC first and shifts dates during BST.
 */
export const toLocalDateStr = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};






























