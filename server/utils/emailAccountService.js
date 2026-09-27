/**
 * Email Account Service
 * Manages email accounts stored in the database for user assignment
 */

const { getSupabaseClient } = require('../config/supabase-client');
const crypto = require('crypto');

// Encryption key from environment (must be 32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'crm-default-key-change-me-32by!!';
const IV_LENGTH = 16;

/**
 * Encrypt sensitive data (client_secret, refresh_token)
 */
function encrypt(text) {
  if (!text) {
    console.log('🔐 Encrypt: No text provided, returning null');
    return null;
  }
  try {
    // Ensure key is exactly 32 bytes
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const result = iv.toString('hex') + ':' + encrypted;
    console.log(`🔐 Encrypt: Success - input length: ${text.length}, output length: ${result.length}`);
    return result;
  } catch (error) {
    console.error('🔐 Encryption error:', error);
    return null;
  }
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedText) {
  if (!encryptedText) {
    console.log('🔓 Decrypt: No encrypted text provided, returning null');
    return null;
  }
  try {
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      console.log(`🔓 Decrypt: Invalid format (no colon separator), got ${parts.length} parts`);
      return null;
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    console.log(`🔓 Decrypt: Success - output length: ${decrypted.length}`);
    return decrypted;
  } catch (error) {
    console.error('🔓 Decryption error:', error);
    return null;
  }
}


/**
 * Drop the credential resolver's cache after any change to an account, so the
 * pollers pick up new credentials on their next cycle instead of serving a
 * stale copy. Required lazily: the resolver depends on this module.
 */
function invalidateCredentialCache() {
  try {
    require('./emailCredentialResolver').invalidateCache();
  } catch (err) {
    // Resolver not loaded (or mid-cycle) - the short TTL still covers us.
  }
}

class EmailAccountService {
  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Get all email accounts (for admin UI)
   * Does NOT return decrypted credentials
   */
  async getAllAccounts() {
    try {
      // Single query to get all fields including credential existence check
      const { data, error } = await this.supabase
        .from('email_accounts')
        .select('id, name, email, display_name, is_active, is_default, redirect_uri, created_at, updated_at, client_id, client_secret_encrypted, refresh_token_encrypted')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Map to add hasCredentials flags and remove sensitive data
      const accounts = (data || []).map(account => ({
        id: account.id,
        name: account.name,
        email: account.email,
        display_name: account.display_name,
        is_active: account.is_active,
        is_default: account.is_default,
        redirect_uri: account.redirect_uri,
        created_at: account.created_at,
        updated_at: account.updated_at,
        hasClientId: !!account.client_id,
        hasClientSecret: !!account.client_secret_encrypted,
        hasRefreshToken: !!account.refresh_token_encrypted
      }));

      return accounts;
    } catch (error) {
      console.error('Error getting email accounts:', error);
      throw error;
    }
  }

  /**
   * Get account by ID with decrypted credentials (for internal use only)
   */
  async getAccountById(id) {
    try {
      const { data, error } = await this.supabase
        .from('email_accounts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return null;

      // Decrypt sensitive fields
      return {
        ...data,
        client_secret: decrypt(data.client_secret_encrypted),
        refresh_token: decrypt(data.refresh_token_encrypted),
        // Don't expose encrypted values
        client_secret_encrypted: undefined,
        refresh_token_encrypted: undefined
      };
    } catch (error) {
      console.error('Error getting email account by ID:', error);
      throw error;
    }
  }

  /**
   * Get the default email account (fallback when no specific account is assigned)
   */
  async getDefaultAccount() {
    try {
      const { data, error } = await this.supabase
        .from('email_accounts')
        .select('*')
        .eq('is_default', true)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      if (!data) return null;

      // Decrypt sensitive fields
      return {
        ...data,
        client_secret: decrypt(data.client_secret_encrypted),
        refresh_token: decrypt(data.refresh_token_encrypted),
        client_secret_encrypted: undefined,
        refresh_token_encrypted: undefined
      };
    } catch (error) {
      console.error('Error getting default email account:', error);
      throw error;
    }
  }

  /**
   * Get the email account assigned to a specific user (returns null if no assignment)
   * Note: This does NOT fall back to default - that's handled by resolveEmailAccount
   * Returns: { type: 'env', accountKey: 'primary'|'secondary' } for env var accounts
   *          { type: 'database', account: {...} } for database accounts
   *          null if no assignment
   */
  async getAccountForUser(userId) {
    try {
      if (!userId) {
        return null; // No user = no assignment
      }

      // Get user's assigned email account
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('assigned_email_account_id')
        .eq('id', userId)
        .single();

      // If user not found (PGRST116), return null - no assignment
      if (userError) {
        if (userError.code !== 'PGRST116') {
          console.error('Error fetching user for email account:', userError);
        }
        return null;
      }

      // Check if user has an assigned account
      if (user && user.assigned_email_account_id) {
        const assignedId = user.assigned_email_account_id;

        // Check if it's an env var account ('primary', 'secondary', 'tertiary', 'quaternary', 'quinary')
        if (['primary', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary', 'septenary'].includes(assignedId)) {
          console.log(`📧 User has env var email account assigned: ${assignedId}`);
          return { type: 'env', accountKey: assignedId };
        }

        // Otherwise it's a database account UUID
        const account = await this.getAccountById(assignedId);
        if (account && account.is_active) {
          return { type: 'database', account };
        }
        // Account exists but is inactive - log and return null
        console.log(`📧 User's assigned email account is inactive, will use default`);
      }

      // No assignment - return null (let resolveEmailAccount handle fallback)
      return null;
    } catch (error) {
      console.error('Error getting account for user:', error);
      return null;
    }
  }

  /**
   * Create a new email account
   */
  async createAccount(data) {
    try {
      const { name, email, client_id, client_secret, refresh_token, redirect_uri, display_name, is_default } = data;

      console.log('📧 Creating email account:', {
        name,
        email,
        hasClientId: !!client_id,
        clientIdLength: client_id?.length || 0,
        hasClientSecret: !!client_secret,
        clientSecretLength: client_secret?.length || 0,
        hasRefreshToken: !!refresh_token,
        refreshTokenLength: refresh_token?.length || 0,
        redirect_uri,
        display_name,
        is_default
      });

      // Validate required fields
      if (!name || !email) {
        throw new Error('Name and email are required');
      }

      // Check if email already exists
      const { data: existing, error: checkError } = await this.supabase
        .from('email_accounts')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (existing) {
        throw new Error('An email account with this email already exists');
      }

      // If setting as default, unset other defaults first
      if (is_default) {
        await this.supabase
          .from('email_accounts')
          .update({ is_default: false })
          .eq('is_default', true);
      }

      // Create the account
      const insertData = {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        client_id: client_id || null,
        client_secret_encrypted: client_secret ? encrypt(client_secret) : null,
        refresh_token_encrypted: refresh_token ? encrypt(refresh_token) : null,
        redirect_uri: redirect_uri || null,
        display_name: display_name || 'Auralndn',
        is_active: true,
        is_default: is_default || false
      };

      const { data: newAccount, error } = await this.supabase
        .from('email_accounts')
        .insert(insertData)
        .select('id, name, email, display_name, is_active, is_default, redirect_uri, created_at')
        .single();

      if (error) throw error;

      invalidateCredentialCache();

      return {
        ...newAccount,
        hasClientId: !!client_id,
        hasClientSecret: !!client_secret,
        hasRefreshToken: !!refresh_token
      };
    } catch (error) {
      console.error('Error creating email account:', error);
      throw error;
    }
  }

  /**
   * Update an email account
   */
  async updateAccount(id, data) {
    try {
      const { name, email, client_id, client_secret, refresh_token, redirect_uri, display_name, is_active, is_default } = data;

      // Check if account exists and get current state
      const { data: existing, error: checkError } = await this.supabase
        .from('email_accounts')
        .select('id, is_default')
        .eq('id', id)
        .single();

      if (checkError || !existing) {
        throw new Error('Email account not found');
      }

      // Prevent deactivating the default account
      if (is_active === false && existing.is_default) {
        throw new Error('Cannot deactivate the default email account. Please set another account as default first.');
      }

      // If email is changing, check for duplicates
      if (email) {
        const { data: emailCheck } = await this.supabase
          .from('email_accounts')
          .select('id')
          .eq('email', email.toLowerCase().trim())
          .neq('id', id)
          .single();

        if (emailCheck) {
          throw new Error('An email account with this email already exists');
        }
      }

      // If setting as default, unset other defaults first
      if (is_default) {
        await this.supabase
          .from('email_accounts')
          .update({ is_default: false })
          .eq('is_default', true)
          .neq('id', id);
      }

      // Build update object (only include provided fields)
      // For credentials, only update if a non-empty value is provided (empty string = keep existing)
      const updateData = { updated_at: new Date().toISOString() };

      if (name !== undefined && name !== '') updateData.name = name.trim();
      if (email !== undefined && email !== '') updateData.email = email.toLowerCase().trim();
      // Only update credentials if a non-empty value is provided
      if (client_id !== undefined && client_id !== '') updateData.client_id = client_id;
      if (client_secret !== undefined && client_secret !== '') updateData.client_secret_encrypted = encrypt(client_secret);
      if (refresh_token !== undefined && refresh_token !== '') updateData.refresh_token_encrypted = encrypt(refresh_token);
      if (redirect_uri !== undefined && redirect_uri !== '') updateData.redirect_uri = redirect_uri;
      if (display_name !== undefined && display_name !== '') updateData.display_name = display_name;
      if (is_active !== undefined) updateData.is_active = is_active;
      if (is_default !== undefined) updateData.is_default = is_default;

      const { data: updatedAccount, error } = await this.supabase
        .from('email_accounts')
        .update(updateData)
        .eq('id', id)
        .select('id, name, email, display_name, is_active, is_default, redirect_uri, updated_at')
        .single();

      if (error) throw error;

      invalidateCredentialCache();

      return {
        ...updatedAccount,
        hasClientId: client_id !== undefined ? !!client_id : undefined,
        hasClientSecret: client_secret !== undefined ? !!client_secret : undefined,
        hasRefreshToken: refresh_token !== undefined ? !!refresh_token : undefined
      };
    } catch (error) {
      console.error('Error updating email account:', error);
      throw error;
    }
  }

  /**
   * Delete an email account (hard delete)
   */
  async deleteAccount(id) {
    try {
      // Check if account exists
      const { data: existing, error: checkError } = await this.supabase
        .from('email_accounts')
        .select('id, is_default')
        .eq('id', id)
        .single();

      if (checkError || !existing) {
        throw new Error('Email account not found');
      }

      if (existing.is_default) {
        throw new Error('Cannot delete the default email account. Please set another account as default first.');
      }

      // Clear any user assignments to this account
      await this.supabase
        .from('users')
        .update({ assigned_email_account_id: null })
        .eq('assigned_email_account_id', id);

      // Clear any template assignments to this account
      // Templates use email_account field (TEXT) which stores the UUID as string
      await this.supabase
        .from('templates')
        .update({ email_account: null })
        .eq('email_account', id);

      // Also clear email_account_id if it exists (for future compatibility)
      await this.supabase
        .from('templates')
        .update({ email_account_id: null })
        .eq('email_account_id', id);

      // Hard delete - actually remove from database
      const { error } = await this.supabase
        .from('email_accounts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      invalidateCredentialCache();

      return { success: true, message: 'Email account deleted successfully' };
    } catch (error) {
      console.error('Error deleting email account:', error);
      throw error;
    }
  }

  /**
   * Test an email account's OAuth connection
   */
  async testAccount(id) {
    try {
      console.log(`🧪 Testing email account: ${id}`);
      const account = await this.getAccountById(id);

      if (!account) {
        throw new Error('Email account not found');
      }

      console.log('🧪 Account retrieved:', {
        id: account.id,
        email: account.email,
        hasClientId: !!account.client_id,
        clientIdLength: account.client_id?.length || 0,
        hasClientSecret: !!account.client_secret,
        clientSecretLength: account.client_secret?.length || 0,
        hasRefreshToken: !!account.refresh_token,
        refreshTokenLength: account.refresh_token?.length || 0
      });

      if (!account.client_id || !account.client_secret || !account.refresh_token) {
        console.log('🧪 Missing credentials:', {
          client_id: !!account.client_id,
          client_secret: !!account.client_secret,
          refresh_token: !!account.refresh_token
        });
        return {
          success: false,
          error: 'Missing OAuth credentials (client_id, client_secret, or refresh_token)'
        };
      }

      // Test the connection using Gmail API
      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        account.client_id,
        account.client_secret,
        account.redirect_uri
      );
      oauth2Client.setCredentials({ refresh_token: account.refresh_token });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      try {
        const response = await gmail.users.getProfile({ userId: 'me' });

        return {
          success: true,
          email: response.data.emailAddress,
          messagesTotal: response.data.messagesTotal,
          message: `Successfully connected to ${response.data.emailAddress}`
        };
      } catch (apiError) {
        // Check for invalid_grant error
        if (apiError.code === 400 &&
            (apiError.message?.includes('invalid_grant') ||
             apiError.response?.data?.error === 'invalid_grant')) {
          return {
            success: false,
            error: 'OAuth token expired or revoked. Please re-authenticate.',
            needsReauth: true
          };
        }
        throw apiError;
      }
    } catch (error) {
      console.error('Error testing email account:', error);
      return {
        success: false,
        error: error.message || 'Failed to test connection'
      };
    }
  }

  /**
   * Resolve which email account to use based on priority:
   * Template > User Assignment > Default > Environment Variables
   */
  async resolveEmailAccount(options = {}) {
    const { templateId, userId, emailAccountId } = options;

    try {
      // Priority 1: Direct email account ID passed
      if (emailAccountId) {
        // Check if it's an env var account
        if (['primary', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary', 'septenary'].includes(emailAccountId)) {
          console.log(`📧 Using directly specified env var account: ${emailAccountId}`);
          return { type: 'env', accountKey: emailAccountId };
        }
        // Otherwise it's a database UUID
        const account = await this.getAccountById(emailAccountId);
        if (account && account.is_active) {
          console.log(`📧 Using directly specified email account: ${account.email}`);
          return { type: 'database', account };
        }
      }

      // Priority 2: Template-specific account
      if (templateId) {
        const { data: template } = await this.supabase
          .from('templates')
          .select('email_account, email_account_id')
          .eq('id', templateId)
          .single();

        // Check email_account field (stores UUID string, 'primary', 'secondary', or null)
        const templateEmailAccount = template?.email_account || template?.email_account_id;

        if (templateEmailAccount) {
          // If it's a legacy key ('primary', 'secondary', 'tertiary', 'quaternary', 'quinary'), use env vars
          if (['primary', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary', 'septenary'].includes(templateEmailAccount)) {
            console.log(`📧 Using template-specified legacy account: ${templateEmailAccount}`);
            return { type: 'env', accountKey: templateEmailAccount };
          }

          // Otherwise it's a UUID, look up the database account
          const account = await this.getAccountById(templateEmailAccount);
          if (account && account.is_active) {
            console.log(`📧 Using template-assigned email account: ${account.email}`);
            return { type: 'database', account };
          }
        }
        // If template email_account is null/empty, continue to user assignment
      }

      // Priority 3: User-assigned account
      if (userId) {
        const userAssignment = await this.getAccountForUser(userId);
        if (userAssignment) {
          // getAccountForUser now returns { type: 'env'|'database', ... }
          if (userAssignment.type === 'env') {
            console.log(`📧 Using user-assigned env var account: ${userAssignment.accountKey}`);
            return userAssignment;
          } else if (userAssignment.type === 'database' && userAssignment.account) {
            console.log(`📧 Using user-assigned database account: ${userAssignment.account.email}`);
            return userAssignment;
          }
        }
      }

      // Priority 4: Default database account
      const defaultAccount = await this.getDefaultAccount();
      if (defaultAccount) {
        console.log(`📧 Using default email account: ${defaultAccount.email}`);
        return { type: 'database', account: defaultAccount };
      }

      // Priority 5: Fall back to environment variables (legacy support)
      console.log(`📧 Falling back to environment variable configuration`);
      return { type: 'env', accountKey: 'primary' };
    } catch (error) {
      console.error('Error resolving email account:', error);
      // Fall back to env vars on any error
      return { type: 'env', accountKey: 'primary' };
    }
  }
}

// Export singleton instance
module.exports = new EmailAccountService();
