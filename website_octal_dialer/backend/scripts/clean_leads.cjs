require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://octal_admin:octal_secure_pg_pass_2026@127.0.0.1:5432/octal_dialer';
  console.log('Connecting to PostgreSQL database using configuration...');
  const pool = new Pool({ connectionString });

  try {
    // Check current counts
    const leadsCount = await pool.query('SELECT COUNT(*) FROM leads');
    console.log(`Current leads count: ${leadsCount.rows[0].count}`);

    let crmCount = { rows: [{ count: 0 }] };
    try {
      crmCount = await pool.query('SELECT COUNT(*) FROM crm_companies');
      console.log(`Current crm_companies count: ${crmCount.rows[0].count}`);
    } catch (e) {
      console.log('crm_companies table not present or empty');
    }

    let contactsCount = { rows: [{ count: 0 }] };
    try {
      contactsCount = await pool.query('SELECT COUNT(*) FROM crm_contacts');
      console.log(`Current crm_contacts count: ${contactsCount.rows[0].count}`);
    } catch (e) {
      console.log('crm_contacts table not present or empty');
    }

    let campaignsCount = { rows: [{ count: 0 }] };
    try {
      campaignsCount = await pool.query('SELECT COUNT(*) FROM campaigns');
      console.log(`Current campaigns count: ${campaignsCount.rows[0].count}`);
    } catch (e) {
      console.log('campaigns table not present or empty');
    }

    let callLogsCount = { rows: [{ count: 0 }] };
    try {
      callLogsCount = await pool.query('SELECT COUNT(*) FROM call_logs');
      console.log(`Current call_logs count: ${callLogsCount.rows[0].count}`);
    } catch (e) {
      console.log('call_logs table not present or empty');
    }

    // Inspect some lead records
    const sampleLeads = await pool.query('SELECT id, name, phone, "tenantId", status FROM leads LIMIT 5');
    console.log('\nSample leads before deletion:', sampleLeads.rows);

    // Purging all leads, campaigns, and sample CRM data
    console.log('\nPurging all leads and sample CRM records...');
    
    await pool.query('DELETE FROM leads');
    console.log('✓ Cleared leads table');

    try {
      await pool.query('DELETE FROM crm_contacts');
      console.log('✓ Cleared crm_contacts table');
    } catch (e) {}

    try {
      await pool.query('DELETE FROM crm_tasks');
      console.log('✓ Cleared crm_tasks table');
    } catch (e) {}

    try {
      await pool.query('DELETE FROM crm_notes');
      console.log('✓ Cleared crm_notes table');
    } catch (e) {}

    try {
      await pool.query('DELETE FROM call_logs');
      console.log('✓ Cleared call_logs table');
    } catch (e) {}

    try {
      await pool.query('DELETE FROM campaigns');
      console.log('✓ Cleared campaigns table');
    } catch (e) {}

    // Verify counts are zero
    const finalLeads = await pool.query('SELECT COUNT(*) FROM leads');
    const finalCampaigns = await pool.query('SELECT COUNT(*) FROM campaigns');
    const finalCallLogs = await pool.query('SELECT COUNT(*) FROM call_logs');

    console.log('\n================ VERIFICATION SUMMARY ================');
    console.log(`Final leads count: ${finalLeads.rows[0].count}`);
    console.log(`Final campaigns count: ${finalCampaigns.rows[0].count}`);
    console.log(`Final call_logs count: ${finalCallLogs.rows[0].count}`);
    console.log('======================================================');
    console.log('ALL FAKE LEADS AND SAMPLE PIPELINE DATA PURGED CLEANLY!');
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
