const { createClient } = require('@supabase/supabase-js');
const config = require('./index');

/**
 * Singleton Supabase Client
 *
 * This ensures only ONE Supabase client instance is created and reused
 * across the entire application, preventing connection leaks and
 * database overload.
 *
 * IMPORTANT: Use this instead of calling createClient() directly!
 */

// Fetch with timeout wrapper (Node.js 20+ has fetch and AbortController globally)
const fetchWithTimeout = async (url, options = {}) => {
  const timeoutMs = 30000; // 30 seconds
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      const errorMsg = `Request timeout after ${timeoutMs}ms: ${url}`;
      console.error('⏱️', errorMsg);
      throw new Error(errorMsg);
    }
    // Provide more detailed error information for network errors
    if (error.message && (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND'))) {
      const errorMsg = `Network error connecting to Supabase: ${url}\n` +
        `Possible causes:\n` +
        `  - Internet connectivity issues\n` +
        `  - Supabase service is temporarily unavailable\n` +
        `  - Firewall/proxy blocking the connection\n` +
        `  - DNS resolution problems\n` +
        `  - Incorrect Supabase URL\n` +
        `Original error: ${error.message}`;
      console.error('🌐', errorMsg);
      throw new Error(errorMsg);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

let supabaseInstance = null;

function getSupabaseClient() {
  if (!supabaseInstance) {
    const supabaseUrl = config.supabase.url;
    const supabaseKey = config.supabase.serviceRoleKey || config.supabase.anonKey;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and Service Role Key must be configured');
    }

    console.log('🔧 Initializing singleton Supabase client...');
    console.log(`   URL: ${supabaseUrl}`);
    console.log(`   Key: ${supabaseKey.substring(0, 20)}...`);

    supabaseInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'x-application-name': 'crm'
        },
        fetch: fetchWithTimeout,
      }
    });

    console.log('✅ Singleton Supabase client initialized with timeout protection');
  }

  return supabaseInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
function resetSupabaseClient() {
  supabaseInstance = null;
}

module.exports = {
  getSupabaseClient,
  resetSupabaseClient
};
