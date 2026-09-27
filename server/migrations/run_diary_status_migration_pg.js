/**
 * Migration: Add diary status columns using direct PostgreSQL connection
 *
 * Run with: node server/migrations/run_diary_status_migration_pg.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function runMigration() {
  console.log('🚀 Starting diary status columns migration (Direct PG)...\n');

  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  console.log('📡 Connecting to database...');
  console.log('   Connection string:', connectionString ? connectionString.substring(0, 30) + '...' : 'NOT SET');

  if (!connectionString) {
    throw new Error('DATABASE_URL or SUPABASE_DB_URL must be set');
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  let client;
  try {
    client = await pool.connect();
  } catch (connError) {
    console.error('❌ Connection failed:', connError.message);
    throw connError;
  }

  try {
    console.log('✅ Connected to database\n');

    // Check current columns
    console.log('📋 Checking current columns...');
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'leads'
      AND column_name IN ('is_double_confirmed', 'review_date', 'review_time')
    `);

    const existingColumns = checkResult.rows.map(r => r.column_name);
    console.log('   Existing new columns:', existingColumns.length > 0 ? existingColumns.join(', ') : 'None');

    // Run migrations
    console.log('\n📝 Running migrations...\n');

    // Add is_double_confirmed column
    if (!existingColumns.includes('is_double_confirmed')) {
      console.log('   Adding is_double_confirmed column...');
      await client.query('ALTER TABLE leads ADD COLUMN is_double_confirmed INTEGER DEFAULT 0');
      console.log('   ✅ is_double_confirmed added');
    } else {
      console.log('   ⏭️  is_double_confirmed already exists');
    }

    // Add review_date column
    if (!existingColumns.includes('review_date')) {
      console.log('   Adding review_date column...');
      await client.query('ALTER TABLE leads ADD COLUMN review_date DATE');
      console.log('   ✅ review_date added');
    } else {
      console.log('   ⏭️  review_date already exists');
    }

    // Add review_time column
    if (!existingColumns.includes('review_time')) {
      console.log('   Adding review_time column...');
      await client.query('ALTER TABLE leads ADD COLUMN review_time VARCHAR(10)');
      console.log('   ✅ review_time added');
    } else {
      console.log('   ⏭️  review_time already exists');
    }

    // Create indexes
    console.log('\n📊 Creating indexes...');

    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_leads_is_double_confirmed ON leads(is_double_confirmed)');
      console.log('   ✅ idx_leads_is_double_confirmed created');
    } catch (e) {
      console.log('   ⏭️  idx_leads_is_double_confirmed index already exists or error:', e.message);
    }

    try {
      await client.query('CREATE INDEX IF NOT EXISTS idx_leads_review_date ON leads(review_date)');
      console.log('   ✅ idx_leads_review_date created');
    } catch (e) {
      console.log('   ⏭️  idx_leads_review_date index already exists or error:', e.message);
    }

    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const verifyResult = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'leads'
      AND column_name IN ('is_double_confirmed', 'review_date', 'review_time')
      ORDER BY column_name
    `);

    console.log('\n   New columns in database:');
    verifyResult.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'NULL'})`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
