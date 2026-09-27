require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
  console.log('📋 Verifying template email account configuration...\n');

  try {
    const { data: templates, error } = await supabase
      .from('templates')
      .select('name, type, email_account, is_active')
      .order('type');

    if (error) {
      console.error('❌ Error fetching templates:', error);
      throw error;
    }

    // Group by email account
    const primary = templates.filter(t => (t.email_account || 'primary') === 'primary');
    const secondary = templates.filter(t => t.email_account === 'secondary');

    console.log('📧 PRIMARY ACCOUNT (hello@example.com):\n');
    primary.forEach(t => {
      const status = t.is_active ? '✅' : '❌';
      console.log(`  ${status} ${t.name} (${t.type})`);
    });

    console.log('\n📧 SECONDARY ACCOUNT (diary@example.com):\n');
    if (secondary.length === 0) {
      console.log('  (none)');
    } else {
      secondary.forEach(t => {
        const status = t.is_active ? '✅' : '❌';
        console.log(`  ${status} ${t.name} (${t.type})`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`  Primary: ${primary.length} templates`);
    console.log(`  Secondary: ${secondary.length} templates`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verify()
  .then(() => {
    console.log('\n✅ Verification complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Verification error:', error);
    process.exit(1);
  });
