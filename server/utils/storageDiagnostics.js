/**
 * Storage Diagnostics Tool
 * Helps identify why Supabase Storage is timing out
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

async function diagnoseStorageIssues() {
  console.log('\n🔍 ========== STORAGE DIAGNOSTICS AUDIT ==========\n');
  
  const results = {
    config: {},
    connectivity: {},
    permissions: {},
    recommendations: []
  };

  // 1. Check Configuration
  console.log('1️⃣  Checking Configuration...');
  results.config.url = config.supabase.url || 'NOT SET';
  results.config.serviceRoleKeySet = !!config.supabase.serviceRoleKey;
  results.config.serviceRoleKeyLength = config.supabase.serviceRoleKey?.length || 0;
  results.config.anonKeySet = !!config.supabase.anonKey;
  
  console.log(`   URL: ${results.config.url}`);
  console.log(`   Service Role Key: ${results.config.serviceRoleKeySet ? '✅ Set (' + results.config.serviceRoleKeyLength + ' chars)' : '❌ NOT SET'}`);
  console.log(`   Anon Key: ${results.config.anonKeySet ? '✅ Set' : '❌ NOT SET'}`);

  if (!results.config.serviceRoleKeySet) {
    results.recommendations.push('⚠️  Service Role Key is not set - Storage operations require it');
  }

  // 2. Test Basic Connectivity
  console.log('\n2️⃣  Testing Basic Connectivity...');
  try {
    const testClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey || config.supabase.anonKey
    );
    
    // Test database connection first (faster)
    console.log('   Testing database connection...');
    const { data: dbTest, error: dbError } = await Promise.race([
      testClient.from('leads').select('id').limit(1),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB_TIMEOUT')), 5000))
    ]).catch(err => ({ data: null, error: err }));

    if (dbError && dbError.message === 'DB_TIMEOUT') {
      results.connectivity.database = 'TIMEOUT';
      console.log('   ❌ Database connection: TIMEOUT (>5s)');
      results.recommendations.push('⚠️  Database connection is slow - network issue or Supabase is overloaded');
    } else if (dbError) {
      results.connectivity.database = 'ERROR';
      console.log(`   ❌ Database connection: ERROR - ${dbError.message}`);
      results.recommendations.push('⚠️  Database connection failed - check credentials');
    } else {
      results.connectivity.database = 'OK';
      console.log('   ✅ Database connection: OK');
    }

    // Test Storage API connection with shorter timeout
    console.log('   Testing storage API connection...');
    const startTime = Date.now();
    const storageTest = await Promise.race([
      testClient.storage.listBuckets(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('STORAGE_TIMEOUT')), 8000))
    ]).catch(err => ({ data: null, error: err }));

    const duration = Date.now() - startTime;

    if (storageTest.error) {
      if (storageTest.error.message === 'STORAGE_TIMEOUT') {
        results.connectivity.storage = 'TIMEOUT';
        console.log(`   ❌ Storage API: TIMEOUT (>8s) - Took ${duration}ms`);
        results.recommendations.push('🔴 Storage API is timing out - This is the root cause!');
        results.recommendations.push('   → Check Supabase project status at https://app.supabase.com');
        results.recommendations.push('   → Verify Storage is enabled in your Supabase project');
        results.recommendations.push('   → Check network connectivity/firewall');
      } else {
        results.connectivity.storage = 'ERROR';
        console.log(`   ❌ Storage API: ERROR - ${storageTest.error.message}`);
        console.log(`   Error code: ${storageTest.error.status || 'N/A'}`);
        
        if (storageTest.error.status === 403 || storageTest.error.statusCode === '403') {
          results.recommendations.push('🔴 Permission denied (403) - Service Role Key may not have storage access');
          results.recommendations.push('   → Verify Service Role Key has storage permissions');
        } else if (storageTest.error.status === 401 || storageTest.error.statusCode === '401') {
          results.recommendations.push('🔴 Unauthorized (401) - Service Role Key is invalid');
          results.recommendations.push('   → Regenerate Service Role Key in Supabase dashboard');
        }
      }
    } else {
      results.connectivity.storage = 'OK';
      console.log(`   ✅ Storage API: OK - Took ${duration}ms`);
      
      if (duration > 3000) {
        results.recommendations.push('⚠️  Storage API is slow (>3s) - Consider checking network or Supabase region');
      }
    }

  } catch (error) {
    results.connectivity.general = 'EXCEPTION';
    console.log(`   ❌ Exception: ${error.message}`);
    results.recommendations.push(`⚠️  Exception occurred: ${error.message}`);
  }

  // 3. Check if Storage is enabled (try to access storage settings)
  console.log('\n3️⃣  Checking Storage Status...');
  try {
    const checkClient = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey || config.supabase.anonKey
    );
    
    const { data: buckets, error: bucketError } = await Promise.race([
      checkClient.storage.listBuckets(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000))
    ]).catch(err => ({ data: null, error: err }));

    if (bucketError) {
      if (bucketError.message === 'TIMEOUT') {
        results.permissions.storageEnabled = 'TIMEOUT';
        console.log('   ❌ Cannot determine - API timed out');
      } else {
        results.permissions.storageEnabled = 'ERROR';
        console.log(`   ❌ Error: ${bucketError.message}`);
      }
    } else {
      results.permissions.storageEnabled = 'YES';
      results.permissions.bucketCount = buckets?.length || 0;
      console.log(`   ✅ Storage is accessible - Found ${results.permissions.bucketCount} bucket(s)`);
      
      if (results.permissions.bucketCount === 0) {
        results.recommendations.push('ℹ️  No buckets found - Storage may be newly enabled');
      }
    }
  } catch (error) {
    results.permissions.storageEnabled = 'UNKNOWN';
    console.log(`   ⚠️  Could not check: ${error.message}`);
  }

  // 4. Network Diagnostics
  console.log('\n4️⃣  Network Diagnostics...');
  try {
    const url = new URL(config.supabase.url);
    const storageUrl = `https://${url.hostname}/storage/v1/`;
    console.log(`   Storage API URL: ${storageUrl}`);
    console.log(`   This should be accessible from your server`);
    
    // Check if we can resolve the domain
    const dns = require('dns').promises;
    try {
      const addresses = await Promise.race([
        dns.resolve4(url.hostname),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DNS_TIMEOUT')), 3000))
      ]);
      console.log(`   ✅ DNS Resolution: OK - ${addresses[0]}`);
      results.connectivity.dns = 'OK';
    } catch (dnsError) {
      console.log(`   ❌ DNS Resolution: FAILED - ${dnsError.message}`);
      results.connectivity.dns = 'FAILED';
      results.recommendations.push('🔴 DNS resolution failed - Check network connectivity');
    }
  } catch (error) {
    console.log(`   ⚠️  Could not analyze network: ${error.message}`);
  }

  // Summary
  console.log('\n📊 ========== DIAGNOSTIC SUMMARY ==========');
  console.log('\n✅ Configuration:');
  console.log(`   Service Role Key: ${results.config.serviceRoleKeySet ? 'Set' : 'Missing'}`);
  console.log(`   Supabase URL: ${results.config.url}`);
  
  console.log('\n🌐 Connectivity:');
  console.log(`   Database: ${results.connectivity.database || 'Not tested'}`);
  console.log(`   Storage API: ${results.connectivity.storage || 'Not tested'}`);
  console.log(`   DNS: ${results.connectivity.dns || 'Not tested'}`);
  
  console.log('\n🔐 Permissions:');
  console.log(`   Storage Enabled: ${results.permissions.storageEnabled || 'Unknown'}`);
  if (results.permissions.bucketCount !== undefined) {
    console.log(`   Buckets Found: ${results.permissions.bucketCount}`);
  }

  if (results.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    results.recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  } else {
    console.log('\n✅ No issues detected - Storage should be working!');
  }

  console.log('\n===========================================\n');

  return results;
}

module.exports = { diagnoseStorageIssues };

