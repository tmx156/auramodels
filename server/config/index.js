require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Centralized Configuration Module
 * Provides secure access to environment variables with fallbacks
 * This ensures credentials are not hardcoded in multiple places
 */

const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,

  // JWT Configuration - Maintain backward compatibility
  JWT_SECRET: process.env.JWT_SECRET || 'your-fallback-secret-key',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '30d',

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    // service_role key must come from the env var (never hardcode it — push protection + security)
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null
  },

  // SMS Configuration (The SMS Works) - Check credentials
  sms: {
    // Option 1: Pre-generated JWT token (if you have one)
    jwtToken: process.env.SMS_WORKS_JWT_TOKEN || null,
    // Option 2: API Key + Secret to generate JWT dynamically (preferred)
    apiKey: process.env.SMS_WORKS_API_KEY || null,
    apiSecret: process.env.SMS_WORKS_API_SECRET || null,
    senderId: process.env.SMS_WORKS_SENDER_ID || 'Auralndn', // placeholder: set SMS_WORKS_SENDER_ID to the new client's sender ID
  },

  // Email Configuration (Legacy SMTP - being phased out)
  email: {
    user: process.env.EMAIL_USER || null,
    password: process.env.EMAIL_PASSWORD || null,
    gmailUser: process.env.GMAIL_USER || null,
    gmailPass: process.env.GMAIL_PASS || null
  },

  // Gmail API Configuration (New - recommended)
  gmailApi: {
    email: process.env.GMAIL_EMAIL || 'hello@example.com',
    clientId: process.env.GMAIL_CLIENT_ID || null,
    clientSecret: process.env.GMAIL_CLIENT_SECRET || null,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || null,
    // Automatically detect redirect URI based on environment
    // Priority: 1. Explicit GMAIL_REDIRECT_URI, 2. Railway domain, 3. Localhost
    redirectUri: (() => {
      if (process.env.GMAIL_REDIRECT_URI) {
        return process.env.GMAIL_REDIRECT_URI;
      }
      // Check if we're on Railway (production)
      const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN || 
                           process.env.RAILWAY_STATIC_URL ||
                           (process.env.NODE_ENV === 'production' && process.env.RAILWAY_ENVIRONMENT ? 
                            `https://${process.env.RAILWAY_ENVIRONMENT}.up.railway.app` : null);
      if (railwayDomain) {
        // Remove protocol if present and add https
        const domain = railwayDomain.replace(/^https?:\/\//, '');
        return `https://${domain}/api/gmail/oauth2callback`;
      }
      // Fallback to localhost for development
      return 'http://localhost:5000/api/gmail/oauth2callback';
    })(),
    pollInterval: parseInt(process.env.GMAIL_POLL_INTERVAL_MS) || 600000 // 10 minutes - increased to prevent DB overload
  },

  // Client Configuration
  // IMPORTANT: Production URL must be set correctly for contract signing links
  CLIENT_URL: process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://crm.example.com' : 'http://localhost:3000'),
  FRONTEND_URL: process.env.FRONTEND_URL || process.env.CLIENT_URL || (process.env.NODE_ENV === 'production' ? 'https://crm.example.com' : 'http://localhost:3000'),

  // AWS S3 Configuration (for photo storage)
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || null,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || null,
    region: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: process.env.AWS_S3_BUCKET || 'your-photos-bucket'
  },

  // Redis (if needed)
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// Validation function
config.validate = function() {
  const required = ['JWT_SECRET'];

  const missing = required.filter(key => !this[key]);

  if (missing.length > 0) {
    console.warn(`⚠️ Missing required environment variables: ${missing.join(', ')}`);
    console.warn('Using fallback values - please set proper environment variables in production');
  }

  // Warn about hardcoded credentials (updated for new database)
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('⚠️ SUPABASE_URL / SUPABASE_ANON_KEY not set - Supabase calls will fail');
  }

  // Critical: Validate SERVICE_ROLE_KEY is set (required for backend operations)
  // Only warn, don't throw - allow server to start even if key is missing
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY is not set in environment variables!');
    console.warn('⚠️  Backend operations (email processing, lead creation) will fail!');
    console.warn('⚠️  Please set SUPABASE_SERVICE_ROLE_KEY in Railway environment variables.');
  } else {
    // Validate key format (legacy JWT "eyJ..." or new "sb_secret_...")
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !(key.startsWith('eyJ') || key.startsWith('sb_secret_'))) {
      console.warn('⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY does not look like a valid key!');
      console.warn('⚠️  Key should start with "eyJ" or "sb_secret_".');
    } else {
      console.log('✅ SUPABASE_SERVICE_ROLE_KEY is set and appears valid');
    }
  }

  return missing.length === 0;
};

// Initialize validation
config.validate();

module.exports = config;
