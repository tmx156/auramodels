const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Initialize Supabase client with service role key for storage operations
const supabase = createClient(
  config.supabase.url, 
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

class SupabaseStorageService {
  constructor() {
    this.bucketName = 'template-attachments';
    this.initialized = false;
    this.initializationPromise = null;
    this.maxRetries = 3;
    this.initializationStarted = false;
    
      // DELAYED INITIALIZATION - Wait 5 seconds after server startup
    // This prevents blocking server startup and allows Supabase services to stabilize
    // Note: Supabase recently restored projects can take up to 5 minutes to become operational
    setTimeout(() => {
      this.initializeBucketWithRetry().catch(() => {
        // Silently fail - storage initialization is optional
        // Errors are already logged in initializeBucketWithRetry
      });
    }, 5000); // Increased to 5 seconds to allow Supabase services to stabilize
  }

  async initializeBucketWithRetry() {
    // Prevent multiple simultaneous initializations
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          if (attempt > 1) {
            console.log(`🔄 Retrying storage initialization (attempt ${attempt}/${this.maxRetries})...`);
          }
          
          const result = await this.initializeBucket(attempt);
          
          if (result.success) {
            return; // Success - exit
          }
          
          // If it's not a timeout error, don't retry
          if (!result.isTimeout && attempt < this.maxRetries) {
            // Wait before retrying non-timeout errors too
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          // Wait before retrying (exponential backoff for timeouts)
          if (result.isTimeout && attempt < this.maxRetries) {
            const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        } catch (error) {
          const isTimeout = error.message?.includes('timeout') || error.status === 544 || error.statusCode === '544';
          console.warn(`⚠️ Storage initialization attempt ${attempt} failed:`, error.message || error);
          
          if (attempt < this.maxRetries && isTimeout) {
            const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          break;
        }
      }
      
      console.warn('⚠️ Storage initialization failed after all retries');
      console.warn('   This may be due to Supabase services being unhealthy. Check your Supabase dashboard.');
      console.warn('   Storage features will be unavailable until Supabase services recover. This is non-critical.');
      this.initialized = false;
      this.initializationPromise = null; // Clear promise after all retries
    })();

    return this.initializationPromise;
  }

  async initializeBucket(attempt = 1) {
    try {
      // Use longer timeout: 15s for first attempt, 10s for retries
      const timeoutMs = attempt === 1 ? 15000 : 10000;
      
      // Check if bucket exists with timeout
      const listBucketsPromise = supabase.storage.listBuckets();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
      });
      
      let listBucketsResult;
      try {
        listBucketsResult = await Promise.race([listBucketsPromise, timeoutPromise]);
      } catch (raceError) {
        // Handle timeout specifically
        if (raceError.message === 'TIMEOUT') {
          return { success: false, isTimeout: true, error: 'Connection timeout' };
        }
        throw raceError;
      }
      
      const { data: buckets, error } = listBucketsResult;

      if (error) {
        // Handle specific error types
        const isTimeout = error.status === 544 || error.statusCode === '544' || 
                         error.message?.includes('timeout') || error.message?.includes('timed out');
        
        if (isTimeout) {
          return { success: false, isTimeout: true, error: error.message };
        }
        
        if (error.message && !error.message.includes('JWS')) {
          console.warn('⚠️ Storage API error:', error.message);
        }
        return { success: false, isTimeout: false, error: error.message };
      }

      const bucketExists = buckets?.some(bucket => bucket.name === this.bucketName);
      
      if (!bucketExists) {
        console.log(`📦 Creating bucket: ${this.bucketName}`);
        const { data, error: createError } = await supabase.storage.createBucket(this.bucketName, {
          public: true,
          fileSizeLimit: 50 * 1024 * 1024, // 50MB limit
          allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'text/plain',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            // Audio formats
            'audio/wav',
            'audio/vnd.wave',
            'audio/x-wav',
            'audio/mpeg',
            'audio/mp3',
            'audio/mp4',
            'audio/aac',
            'audio/ogg',
            'audio/webm',
            'audio/flac',
            'audio/x-m4a'
          ]
        });

        if (createError) {
          // Don't treat "already exists" as an error
          if (createError.message?.includes('already exists') || createError.message?.includes('duplicate')) {
            console.log('✅ Bucket already exists (creation skipped)');
            this.initialized = true;
            return { success: true };
          }
          console.warn('⚠️ Could not create bucket:', createError.message);
          return { success: false, isTimeout: false, error: createError.message };
        } else {
          console.log('✅ Bucket created successfully');
          this.initialized = true;
          return { success: true };
        }
      } else {
        console.log('✅ Storage initialized successfully - bucket exists');
        // Update bucket to ensure all MIME types are allowed (including audio)
        try {
          await supabase.storage.updateBucket(this.bucketName, {
            public: true,
            fileSizeLimit: 50 * 1024 * 1024, // 50MB limit
            allowedMimeTypes: [
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'image/jpeg',
              'image/png',
              'image/gif',
              'image/webp',
              'text/plain',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              // Audio formats
              'audio/wav',
              'audio/vnd.wave',
              'audio/x-wav',
              'audio/mpeg',
              'audio/mp3',
              'audio/mp4',
              'audio/aac',
              'audio/ogg',
              'audio/webm',
              'audio/flac',
              'audio/x-m4a'
            ]
          });
          console.log('✅ Updated bucket allowed MIME types to include audio formats');
        } catch (updateError) {
          console.warn('⚠️ Could not update bucket MIME types:', updateError.message);
          // Non-critical - continue even if update fails
        }
        this.initialized = true;
        return { success: true };
      }
    } catch (error) {
      // Handle timeout and connection errors
      const isTimeout = error.message === 'TIMEOUT' || error.message?.includes('timeout') || 
                       error.status === 544 || error.statusCode === '544' || 
                       error.code === 'ECONNABORTED';
      return { 
        success: false, 
        isTimeout: isTimeout, 
        error: error.message || error.toString() 
      };
    }
  }

  /**
   * Upload a file to Supabase Storage
   * @param {string} filePath - Local file path
   * @param {string} fileName - Desired file name in storage
   * @param {string} contentType - MIME type
   * @returns {Promise<{success: boolean, url?: string, error?: string}>}
   */
  async uploadFile(filePath, fileName, contentType) {
    try {
      console.log(`📤 Uploading file to Supabase Storage: ${fileName}`);
      
      // Read file from local filesystem
      const fileBuffer = fs.readFileSync(filePath);
      
      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(fileName, fileBuffer, {
          contentType: contentType,
          upsert: true // Overwrite if exists
        });

      if (error) {
        console.error('❌ Upload error:', error);
        return { success: false, error: error.message };
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      console.log('✅ File uploaded successfully:', urlData.publicUrl);
      
      return {
        success: true,
        url: urlData.publicUrl,
        path: data.path
      };

    } catch (error) {
      console.error('❌ Upload error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Download a file from Supabase Storage
   * @param {string} fileName - File name in storage
   * @returns {Promise<{success: boolean, buffer?: Buffer, error?: string}>}
   */
  async downloadFile(fileName) {
    try {
      console.log(`📥 Downloading file from Supabase Storage: ${fileName}`);
      
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .download(fileName);

      if (error) {
        console.error('❌ Download error:', error);
        return { success: false, error: error.message };
      }

      // Convert blob to buffer
      const buffer = Buffer.from(await data.arrayBuffer());
      
      console.log('✅ File downloaded successfully');
      
      return {
        success: true,
        buffer: buffer
      };

    } catch (error) {
      console.error('❌ Download error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a file from Supabase Storage
   * @param {string} fileName - File name in storage
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteFile(fileName) {
    try {
      console.log(`🗑️ Deleting file from Supabase Storage: ${fileName}`);
      
      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([fileName]);

      if (error) {
        console.error('❌ Delete error:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ File deleted successfully');
      
      return { success: true };

    } catch (error) {
      console.error('❌ Delete error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get public URL for a file
   * @param {string} fileName - File name in storage
   * @returns {string} Public URL
   */
  getPublicUrl(fileName) {
    const { data } = supabase.storage
      .from(this.bucketName)
      .getPublicUrl(fileName);
    
    return data.publicUrl;
  }

  /**
   * List all files in the bucket
   * @returns {Promise<{success: boolean, files?: Array, error?: string}>}
   */
  async listFiles() {
    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .list();

      if (error) {
        console.error('❌ List error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, files: data };

    } catch (error) {
      console.error('❌ List error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Create singleton instance - LAZY INITIALIZATION
// Don't initialize immediately to avoid blocking server startup
let storageService = null;

function getStorageService() {
  if (!storageService) {
    storageService = new SupabaseStorageService();
  }
  return storageService;
}

// Export getter function instead of instance
// This allows modules to require the file without triggering initialization
module.exports = new Proxy({}, {
  get(target, prop) {
    const service = getStorageService();
    if (typeof service[prop] === 'function') {
      return service[prop].bind(service);
    }
    return service[prop];
  },
  set(target, prop, value) {
    const service = getStorageService();
    service[prop] = value;
    return true;
  }
});
