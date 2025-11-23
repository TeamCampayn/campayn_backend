const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class CreatorCleanup {
  constructor() {
    this.accessToken = process.env.IG_ACCESS_TOKEN;
    this.businessId = process.env.IG_BUSINESS_ID;
    this.batchSize = 20; // Small batch size to avoid rate limits
    this.delayBetweenCalls = 4000; // 4 seconds between calls
    this.invalidProfiles = [];
    this.validProfiles = [];
    this.errors = [];
  }

  // Check if an Instagram profile exists and is accessible
  async checkInstagramProfile(igHandle) {
    try {
      const cleanHandle = igHandle.replace(/^@/, '').trim();
      
      // Skip if handle is empty or invalid
      if (!cleanHandle || cleanHandle.length < 2) {
        return { valid: false, reason: 'Invalid handle format', error: 'Empty or too short handle' };
      }

      console.log(`Checking: @${cleanHandle}`);

      const fields = encodeURIComponent(`business_discovery.username(${cleanHandle}){
        username,
        name,
        followers_count,
        media_count
      }`);

      const url = `https://graph.facebook.com/v19.0/${this.businessId}?fields=${fields}&access_token=${this.accessToken}`;
      
      const response = await axios.get(url, { timeout: 10000 });
      const discovery = response.data.business_discovery;

      // Profile exists and is accessible
      return {
        valid: true,
        reason: 'Valid profile',
        data: {
          username: discovery.username,
          name: discovery.name,
          followers_count: discovery.followers_count,
          media_count: discovery.media_count
        }
      };

    } catch (error) {
      // Handle specific Instagram Graph API errors
      if (error.response?.data?.error) {
        const apiError = error.response.data.error;
        
        switch (apiError.code) {
          case 110: // Invalid user id
            return { valid: false, reason: 'User not found', error: apiError.message };
          case 803: // Cannot query users that are not public
            return { valid: false, reason: 'Private or restricted account', error: apiError.message };
          case 100: // Invalid parameter or permissions issue
            if (apiError.error_subcode === 2207013) {
              return { valid: false, reason: 'User not found', error: apiError.message };
            }
            return { valid: false, reason: 'Access denied or invalid parameter', error: apiError.message };
          case 4: // Application request limit reached
            console.log('Rate limit reached, waiting longer...');
            await new Promise(resolve => setTimeout(resolve, 10000));
            return { valid: false, reason: 'Rate limited', error: apiError.message };
          default:
            return { valid: false, reason: 'API error', error: apiError.message };
        }
      }

      // Handle network or other errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
        return { valid: false, reason: 'Network error', error: error.message };
      }

      return { valid: false, reason: 'Unknown error', error: error.message };
    }
  }

  // Get creators from database in batches
  async getCreatorsBatch(offset = 0) {
    try {
      const { data: creators, error } = await supabase
        .from('creators')
        .select('id, name, ig_handle, category, subcategory, followers_count')
        .not('ig_handle', 'is', null)
        .order('id')
        .range(offset, offset + this.batchSize - 1);

      if (error) throw error;
      return creators || [];
    } catch (error) {
      console.error('Error fetching creators batch:', error);
      throw error;
    }
  }

  // Mark invalid profiles in database
  async markInvalidProfile(creatorId, reason, error) {
    try {
      const { error: updateError } = await supabase
        .from('creators')
        .update({
          account_status: 'not_found',
          last_checked: new Date().toISOString(),
          last_updated: new Date().toISOString()
        })
        .eq('id', creatorId);

      if (updateError) throw updateError;
      return true;
    } catch (error) {
      console.error(`Error marking creator ${creatorId} as invalid:`, error);
      return false;
    }
  }

  // Delete invalid profiles from database
  async deleteInvalidProfile(creatorId) {
    try {
      const { error: deleteError } = await supabase
        .from('creators')
        .delete()
        .eq('id', creatorId);

      if (deleteError) throw deleteError;
      return true;
    } catch (error) {
      console.error(`Error deleting creator ${creatorId}:`, error);
      return false;
    }
  }

  // Process a batch of creators
  async processBatch(offset = 0, deleteInvalid = false) {
    console.log(`\n📋 Processing batch starting at offset ${offset}...`);

    const creators = await this.getCreatorsBatch(offset);
    
    if (creators.length === 0) {
      console.log('✅ No more creators to process');
      return false; // No more creators
    }

    console.log(`Found ${creators.length} creators in this batch`);

    const batchResults = {
      valid: 0,
      invalid: 0,
      errors: 0,
      processed: []
    };

    for (let i = 0; i < creators.length; i++) {
      const creator = creators[i];
      console.log(`\n[${i + 1}/${creators.length}] Processing: ${creator.name} (@${creator.ig_handle})`);

      const result = await this.checkInstagramProfile(creator.ig_handle);

      const profileInfo = {
        id: creator.id,
        name: creator.name,
        ig_handle: creator.ig_handle,
        category: creator.category,
        followers: creator.followers_count,
        ...result
      };

      if (result.valid) {
        console.log(`✅ Valid: @${creator.ig_handle} - ${result.data.followers_count} followers`);
        this.validProfiles.push(profileInfo);
        batchResults.valid++;
      } else {
        console.log(`❌ Invalid: @${creator.ig_handle} - ${result.reason}`);
        this.invalidProfiles.push(profileInfo);
        batchResults.invalid++;

        if (deleteInvalid) {
          const deleted = await this.deleteInvalidProfile(creator.id);
          console.log(`🗑️ ${deleted ? 'Deleted' : 'Failed to delete'} invalid profile`);
        } else {
          const marked = await this.markInvalidProfile(creator.id, result.reason, result.error);
          console.log(`🏷️ ${marked ? 'Marked' : 'Failed to mark'} as invalid`);
        }
      }

      batchResults.processed.push(profileInfo);

      // Add delay between API calls to avoid rate limiting
      if (i < creators.length - 1) {
        console.log(`⏳ Waiting ${this.delayBetweenCalls/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, this.delayBetweenCalls));
      }
    }

    console.log(`\n📊 Batch Results: ✅ ${batchResults.valid} valid, ❌ ${batchResults.invalid} invalid`);
    return true; // More creators to process
  }

  // Run the cleanup process
  async runCleanup(options = {}) {
    const {
      maxBatches = 10,
      deleteInvalid = false,
      startOffset = 0
    } = options;

    console.log('🚀 Starting Creator Cleanup Process...');
    console.log(`📋 Settings: maxBatches=${maxBatches}, deleteInvalid=${deleteInvalid}, startOffset=${startOffset}`);
    console.log('⚠️  This will check Instagram profiles and mark/delete invalid ones\n');

    let offset = startOffset;
    let batchCount = 0;

    try {
      while (batchCount < maxBatches) {
        const hasMore = await this.processBatch(offset, deleteInvalid);
        
        if (!hasMore) break;

        offset += this.batchSize;
        batchCount++;

        console.log(`\n📈 Progress: Processed ${batchCount} batches (${offset} total creators)`);
      }

      // Final summary
      console.log('\n🎉 Cleanup Process Complete!');
      console.log('=' .repeat(50));
      console.log(`📊 SUMMARY:`);
      console.log(`✅ Valid profiles: ${this.validProfiles.length}`);
      console.log(`❌ Invalid profiles: ${this.invalidProfiles.length}`);
      console.log(`⚠️  Errors: ${this.errors.length}`);
      console.log(`📋 Total processed: ${this.validProfiles.length + this.invalidProfiles.length}`);

      if (this.invalidProfiles.length > 0) {
        console.log('\n❌ INVALID PROFILES:');
        this.invalidProfiles.forEach((profile, index) => {
          console.log(`${index + 1}. ${profile.name} (@${profile.ig_handle}) - ${profile.reason}`);
        });
      }

      // Save results to file
      const results = {
        timestamp: new Date().toISOString(),
        settings: { maxBatches, deleteInvalid, startOffset },
        summary: {
          valid: this.validProfiles.length,
          invalid: this.invalidProfiles.length,
          errors: this.errors.length,
          total: this.validProfiles.length + this.invalidProfiles.length
        },
        validProfiles: this.validProfiles,
        invalidProfiles: this.invalidProfiles,
        errors: this.errors
      };

      const fs = require('fs');
      const filename = `cleanup-results-${new Date().toISOString().split('T')[0]}.json`;
      fs.writeFileSync(filename, JSON.stringify(results, null, 2));
      console.log(`\n💾 Results saved to: ${filename}`);

      return results;

    } catch (error) {
      console.error('\n💥 Cleanup process failed:', error);
      throw error;
    }
  }

  // Get cleanup statistics without processing
  async getStats() {
    try {
      const { data: stats, error } = await supabase
        .from('creators')
        .select('account_status, ig_handle')
        .not('ig_handle', 'is', null);

      if (error) throw error;

      const summary = {
        total: stats.length,
        unknown: stats.filter(c => !c.account_status || c.account_status === 'unknown').length,
        active: stats.filter(c => c.account_status === 'active').length,
        inactive: stats.filter(c => c.account_status === 'inactive').length,
        not_found: stats.filter(c => c.account_status === 'not_found').length,
        private: stats.filter(c => c.account_status === 'private').length
      };

      console.log('📊 Current Database Stats:');
      console.log(`Total creators: ${summary.total}`);
      console.log(`Unknown status: ${summary.unknown}`);
      console.log(`Active: ${summary.active}`);
      console.log(`Inactive: ${summary.inactive}`);
      console.log(`Not found: ${summary.not_found}`);
      console.log(`Private: ${summary.private}`);

      return summary;
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }
}

// CLI Usage
async function main() {
  const cleanup = new CreatorCleanup();

  const args = process.argv.slice(2);
  const command = args[0] || 'stats';

  try {
    switch (command) {
      case 'stats':
        await cleanup.getStats();
        break;

      case 'check':
        const maxBatches = parseInt(args[1]) || 5;
        const startOffset = parseInt(args[2]) || 0;
        console.log(`🔍 Checking ${maxBatches} batches starting from offset ${startOffset}`);
        await cleanup.runCleanup({ 
          maxBatches, 
          deleteInvalid: false, 
          startOffset 
        });
        break;

      case 'cleanup':
        const cleanupBatches = parseInt(args[1]) || 5;
        const cleanupOffset = parseInt(args[2]) || 0;
        console.log(`🧹 Cleaning up ${cleanupBatches} batches starting from offset ${cleanupOffset}`);
        console.log('⚠️  This will DELETE invalid profiles from the database!');
        await cleanup.runCleanup({ 
          maxBatches: cleanupBatches, 
          deleteInvalid: true, 
          startOffset: cleanupOffset 
        });
        break;

      case 'test':
        console.log('🧪 Testing with a single profile...');
        const testHandle = args[1] || 'aaftab_bagarwa';
        const result = await cleanup.checkInstagramProfile(testHandle);
        console.log(`Result for @${testHandle}:`, result);
        break;

      default:
        console.log('Usage:');
        console.log('  node cleanup-invalid-creators.js stats                    # Show database stats');
        console.log('  node cleanup-invalid-creators.js check [batches] [offset] # Check profiles and mark invalid');
        console.log('  node cleanup-invalid-creators.js cleanup [batches] [offset] # Delete invalid profiles');
        console.log('  node cleanup-invalid-creators.js test [handle]            # Test single profile');
        break;
    }
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { CreatorCleanup };