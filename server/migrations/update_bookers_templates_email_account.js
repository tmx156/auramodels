require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🔄 Updating bookers templates to use secondary email account (diary@example.com)...\n');

  try {
    // Update no_answer and invitation_email templates to use secondary email account
    const { data, error } = await supabase
      .from('templates')
      .update({ email_account: 'secondary' })
      .in('type', ['no_answer', 'invitation_email'])
      .select();

    if (error) {
      console.error('❌ Error updating templates:', error);
      throw error;
    }

    console.log(`✅ Successfully updated ${data ? data.length : 0} templates`);

    if (data && data.length > 0) {
      console.log('\n📋 Updated templates:');
      data.forEach(template => {
        console.log(`  - ${template.name} (${template.type}) → email_account: secondary`);
      });
    } else {
      console.log('\n⚠️ No bookers templates (no_answer or invitation_email) found to update');
      console.log('   This might mean you need to create these templates first');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('📧 Bookers templates will now send from: diary@example.com');
    console.log('📧 Admin templates will continue sending from: hello@example.com');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate()
  .then(() => {
    console.log('\n👍 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration error:', error);
    process.exit(1);
  });
