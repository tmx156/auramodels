/**
 * Booking Code Generator
 * 
 * Generates clean, URL-friendly booking slugs for public booking links
 * Format: firstname-booking (e.g., tanya-booking, sarah-booking-2)
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Initialize Supabase
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

/**
 * Convert a name to a URL-friendly slug
 * @param {string} name - Full name
 * @returns {string} - URL-friendly first name
 */
function nameToSlug(name) {
  if (!name || typeof name !== 'string') {
    return 'client';
  }
  
  // Get first name only, convert to lowercase, remove special chars
  const firstName = name.split(' ')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20); // Limit length
  
  return firstName || 'client';
}

/**
 * Generate a unique booking code (slug format)
 * @param {string} name - Lead's name
 * @param {number} maxAttempts - Maximum attempts to find unique slug
 * @returns {Promise<string>} - Unique booking slug like "tanya-booking"
 */
async function generateBookingCode(name = '', maxAttempts = 100) {
  const baseName = nameToSlug(name);
  
  // Try without number first: "tanya-booking"
  const baseSlug = `${baseName}-booking`;
  
  const { data: existingBase, error: baseError } = await supabase
    .from('leads')
    .select('id')
    .ilike('booking_code', baseSlug)
    .maybeSingle();
  
  if (!baseError && !existingBase) {
    return baseSlug;
  }
  
  // If base slug exists, try with numbers: "tanya-booking-2", "tanya-booking-3", etc.
  for (let num = 2; num <= maxAttempts; num++) {
    const numberedSlug = `${baseName}-booking-${num}`;
    
    const { data: existing, error } = await supabase
      .from('leads')
      .select('id')
      .ilike('booking_code', numberedSlug)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking booking code uniqueness:', error);
      continue;
    }
    
    if (!existing) {
      return numberedSlug;
    }
  }
  
  // Fallback: add random suffix if too many duplicates
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  const fallbackSlug = `${baseName}-booking-${randomSuffix}`;
  console.warn(`Many duplicates for ${baseName}, using: ${fallbackSlug}`);
  return fallbackSlug;
}

/**
 * Generate booking codes for all leads that don't have one
 * Useful for migrating existing leads
 * @returns {Promise<{updated: number, failed: number}>} - Result counts
 */
async function generateCodesForExistingLeads() {
  console.log('📝 Generating booking codes for existing leads...');
  
  // Get all leads without booking codes
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, name')
    .is('booking_code', null);
  
  if (error) {
    console.error('Error fetching leads:', error);
    throw error;
  }
  
  if (!leads || leads.length === 0) {
    console.log('✅ All leads already have booking codes');
    return { updated: 0, failed: 0 };
  }
  
  console.log(`Found ${leads.length} leads without booking codes`);
  
  let updated = 0;
  let failed = 0;
  
  for (const lead of leads) {
    try {
      const code = await generateBookingCode(lead.name);
      
      const { error: updateError } = await supabase
        .from('leads')
        .update({ booking_code: code })
        .eq('id', lead.id);
      
      if (updateError) {
        console.error(`Failed to update lead ${lead.id}:`, updateError);
        failed++;
      } else {
        console.log(`✅ Generated code ${code} for lead ${lead.name || lead.id}`);
        updated++;
      }
    } catch (err) {
      console.error(`Error generating code for lead ${lead.id}:`, err);
      failed++;
    }
  }
  
  console.log(`📊 Booking code generation complete: ${updated} updated, ${failed} failed`);
  return { updated, failed };
}

/**
 * Get the public booking URL for a lead
 * @param {string} bookingCode - The lead's booking code
 * @returns {string} - Full booking URL
 */
function getBookingUrl(bookingCode) {
  // Use the configured domain
  const domain = process.env.BOOKING_DOMAIN || 'www.example.com';
  return `https://${domain}/book/${bookingCode}`;
}

module.exports = {
  generateBookingCode,
  generateCodesForExistingLeads,
  getBookingUrl,
  nameToSlug
};

