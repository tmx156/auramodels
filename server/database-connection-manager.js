const { createClient } = require('@supabase/supabase-js');

// Import centralized configuration
const config = require('./config');

// Fetch with timeout wrapper
// Node.js 20+ has fetch and AbortController globally
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

class DatabaseConnectionManager {
  constructor() {
    this.client = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.initializeClient();
  }

  initializeClient() {
    try {
      // Use SERVICE ROLE KEY for backend operations to bypass RLS policies
      // This is critical for admin operations like deleting leads
      const url = config.supabase.url;
      const key = config.supabase.serviceRoleKey;

      // Validate key exists and looks valid
      if (!key || (key.length < 100 && !/^sb_(secret|publishable)_/.test(key))) {
        console.warn('⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY is missing or too short. Expected a long JWT token.');
        console.warn('⚠️  Server will start in LIMITED MODE without database access.');
        console.warn('⚠️  Please set SUPABASE_SERVICE_ROLE_KEY in Railway environment variables.');
        this.client = null;
        return; // Exit gracefully without throwing
      }

      if (!key.startsWith('eyJ') && !key.startsWith('sb_secret_')) {
        console.warn('⚠️  WARNING: SUPABASE_SERVICE_ROLE_KEY does not start with "eyJ" - may be invalid');
      }

      // Create Supabase client with connection options and timeout
      this.client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            'x-client-info': 'crm-backend',
          },
          fetch: fetchWithTimeout,
        },
      });

      // Log key preview (first 20 chars) for debugging
      const keyPreview = key.substring(0, 20);
      console.log(`✅ Supabase client initialized with SERVICE ROLE KEY (RLS bypassed)`);
      console.log(`   URL: ${url}`);
      console.log(`   Key preview: ${keyPreview}...`);
    } catch (error) {
      console.error('❌ Failed to initialize Supabase client:', error.message);
      // Fallback to direct initialization if config fails
      try {
        const fallbackUrl = process.env.SUPABASE_URL || config.supabase.url;
        const fallbackKey = process.env.SUPABASE_SERVICE_ROLE_KEY || config.supabase.serviceRoleKey;

        if (!fallbackKey || (fallbackKey.length < 100 && !/^sb_(secret|publishable)_/.test(fallbackKey))) {
          console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY is missing or invalid in environment variables');
          console.warn('⚠️  Server will start in LIMITED MODE without database access.');
          this.client = null;
          return; // Exit gracefully without throwing
        }

        this.client = createClient(fallbackUrl, fallbackKey);
        console.log('✅ Supabase client initialized with fallback SERVICE ROLE credentials');
      } catch (fallbackError) {
        console.error('❌ Fallback initialization also failed:', fallbackError.message);
        console.error('❌ CRITICAL: Cannot connect to database. Please check SUPABASE_SERVICE_ROLE_KEY in Railway.');
        console.warn('⚠️  Server will start in LIMITED MODE without database access.');
        this.client = null; // Set to null instead of crashing
      }
    }
  }

  async query(table, options = {}) {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    try {
      let query = this.client.from(table);

      // Apply select
      if (options.select) {
        query = query.select(options.select);
      }

      // Apply filters
      if (options.eq) {
        Object.entries(options.eq).forEach(([column, value]) => {
          query = query.eq(column, value);
        });
      }

      if (options.neq) {
        Object.entries(options.neq).forEach(([column, value]) => {
          query = query.neq(column, value);
        });
      }

      if (options.gt) {
        Object.entries(options.gt).forEach(([column, value]) => {
          query = query.gt(column, value);
        });
      }

      if (options.lt) {
        Object.entries(options.lt).forEach(([column, value]) => {
          query = query.lt(column, value);
        });
      }

      if (options.gte) {
        Object.entries(options.gte).forEach(([column, value]) => {
          query = query.gte(column, value);
        });
      }

      if (options.lte) {
        Object.entries(options.lte).forEach(([column, value]) => {
          query = query.lte(column, value);
        });
      }

      if (options.like) {
        Object.entries(options.like).forEach(([column, value]) => {
          query = query.like(column, value);
        });
      }

      if (options.ilike) {
        Object.entries(options.ilike).forEach(([column, value]) => {
          query = query.ilike(column, value);
        });
      }

      if (options.in) {
        Object.entries(options.in).forEach(([column, value]) => {
          query = query.in(column, value);
        });
      }

      if (options.is) {
        Object.entries(options.is).forEach(([column, value]) => {
          query = query.is(column, value);
        });
      }

      // Apply ordering
      if (options.order) {
        Object.entries(options.order).forEach(([column, direction]) => {
          query = query.order(column, { ascending: direction === 'asc' });
        });
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.range) {
        query = query.range(options.range.from, options.range.to);
      }

      // Execute query
      const result = await query;

      if (result.error) {
        throw result.error;
      }

      return result.data;

    } catch (error) {
      console.error('Supabase query error:', error);

      // Retry mechanism
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`Retrying query (Attempt ${this.retryCount})...`);
        await this.wait(1000 * this.retryCount); // Exponential backoff
        return this.query(table, options);
      }

      // Reset retry count
      this.retryCount = 0;
      throw error;
    }
  }

  async insert(table, data) {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    try {
      const result = await this.client
        .from(table)
        .insert(data)
        .select();

      if (result.error) {
        throw result.error;
      }

      return result.data;
    } catch (error) {
      console.error('Supabase insert error:', error);
      throw error;
    }
  }

  async update(table, data, filters) {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    try {
      let query = this.client.from(table).update(data);

      // Apply filters
      if (filters) {
        Object.entries(filters).forEach(([column, value]) => {
          query = query.eq(column, value);
        });
      }

      const result = await query.select();

      if (result.error) {
        throw result.error;
      }

      return result.data;
    } catch (error) {
      console.error('Supabase update error:', error);
      throw error;
    }
  }

  async delete(table, filters) {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    try {
      let query = this.client.from(table).delete();

      // Apply filters
      if (filters) {
        // Handle different filter types
        if (filters.eq) {
          Object.entries(filters.eq).forEach(([column, value]) => {
            query = query.eq(column, value);
          });
        }
        
        if (filters.neq) {
          Object.entries(filters.neq).forEach(([column, value]) => {
            query = query.neq(column, value);
          });
        }
        
        if (filters.in) {
          Object.entries(filters.in).forEach(([column, value]) => {
            query = query.in(column, value);
          });
        }
        
        if (filters.gt) {
          Object.entries(filters.gt).forEach(([column, value]) => {
            query = query.gt(column, value);
          });
        }
        
        if (filters.lt) {
          Object.entries(filters.lt).forEach(([column, value]) => {
            query = query.lt(column, value);
          });
        }
        
        if (filters.gte) {
          Object.entries(filters.gte).forEach(([column, value]) => {
            query = query.gte(column, value);
          });
        }
        
        if (filters.lte) {
          Object.entries(filters.lte).forEach(([column, value]) => {
            query = query.lte(column, value);
          });
        }
      }

      // .select() returns the deleted rows; without it data is null and
      // callers checking the result treat a successful delete as a failure.
      const result = await query.select();

      if (result.error) {
        throw result.error;
      }

      return result.data;
    } catch (error) {
      console.error('Supabase delete error:', error);
      throw error;
    }
  }

  async upsert(table, data, options = {}) {
    if (!this.client) {
      throw new Error('Supabase client not initialized');
    }

    try {
      let query = this.client.from(table).upsert(data, options);

      const result = await query.select();

      if (result.error) {
        throw result.error;
      }

      return result.data;
    } catch (error) {
      console.error('Supabase upsert error:', error);
      throw error;
    }
  }

  async reconnect() {
    try {
      // Reinitialize the client
      this.initializeClient();
    } catch (error) {
      console.error('Reconnection failed:', error);
    }
  }

  // Utility method for adding delay
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Graceful shutdown
  async shutdown() {
    // Supabase client doesn't need explicit shutdown
    console.log('Shutting down Supabase client');
  }
}

// Singleton instance
const dbManager = new DatabaseConnectionManager();

// Graceful shutdown on process exit
process.on('SIGINT', async () => {
  await dbManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await dbManager.shutdown();
  process.exit(0);
});

module.exports = dbManager;
