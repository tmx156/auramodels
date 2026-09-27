/**
 * API Configuration
 * Centralized API configuration for the CRM frontend
 */

// Get API Base URL dynamically
// - If REACT_APP_API_URL is set, use it
// - In development (localhost:3000), use localhost:5000 for the server
// - In production (crm.example.com), use same origin
const getBaseUrl = () => {
  // If explicitly set via environment variable, use it
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // Check if we're in a browser
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const port = window.location.port;

    // In development (localhost on port 3000), use localhost:5000 for the server
    if (hostname === 'localhost' && port === '3000') {
      return 'http://localhost:5000';
    }

    // In production (crm.example.com or any non-localhost), use same origin
    // This handles Railway and any custom domain
    return '';
  }

  // Default for SSR or non-browser environments
  return '';
};

// For backwards compatibility, evaluate once at load time
// But getApiUrl will re-evaluate if needed
const API_BASE_URL = getBaseUrl();

// API endpoints
export const API_ENDPOINTS = {
  // Health check
  HEALTH: `${API_BASE_URL}/api/health`,
  
  // Authentication
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  REGISTER: `${API_BASE_URL}/api/auth/register`,
  REFRESH: `${API_BASE_URL}/api/auth/refresh`,
  
  // Leads
  LEADS: `${API_BASE_URL}/api/leads`,
  LEADS_UPLOAD: `${API_BASE_URL}/api/leads/upload`,
  
  // Sales
  SALES: `${API_BASE_URL}/api/sales`,
  
  // Users
  USERS: `${API_BASE_URL}/api/users`,
  
  // Messages
  MESSAGES: `${API_BASE_URL}/api/messages`,
  
  // Templates
  TEMPLATES: `${API_BASE_URL}/api/templates`,
  
  // Stats
  STATS: `${API_BASE_URL}/api/stats`,
  
  // SMS
  SMS: `${API_BASE_URL}/api/sms`,
  
  // Finance
  FINANCE: `${API_BASE_URL}/api/finance`,
  
  // Upload
  UPLOAD: `${API_BASE_URL}/api/upload`
};

// Cache-busting helper
export const addCacheBuster = (url) => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_t=${Date.now()}`;
};

// Helper function to get full API URL
// Uses getBaseUrl() dynamically to handle dev/production properly
export const getApiUrl = (endpoint, bustCache = false) => {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  return bustCache ? addCacheBuster(url) : url;
};

// Default export
export default {
  API_BASE_URL,
  API_ENDPOINTS,
  getApiUrl,
  addCacheBuster
};
