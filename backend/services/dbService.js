const postgres = require('postgres');
require('dotenv').config();

// Initialize database connection
const sql = postgres(process.env.POSTGRES_URL || process.env.DATABASE_URL, {
  ssl: 'require',
});

/**
 * Add tracked creator to database using ON CONFLICT upsert.
 * Returns { inserted: true } for new rows, { inserted: false, reason: 'duplicate' } for existing.
 */
async function addTrackedCreator(data) {
  const {
    clientId,
    username,
    fullName = null,
    profilePicUrl = null,
    platform = 'instagram',
    sourceType,
    sourceValue,
    postId = null,
    postCaption = null,
    postMediaUrl = null,
    engagement = null,
    platformUserId = null,
    followersCount = null,
    isVerified = false,
  } = data;

  try {
    const result = await sql`
      INSERT INTO tracked_creators (
        client_id, username, full_name, profile_pic_url, platform,
        source_type, source_value, post_id, post_caption, post_media_url,
        engagement, platform_user_id, followers_count, is_verified, discovered_at
      ) VALUES (
        ${clientId}, ${username}, ${fullName}, ${profilePicUrl}, ${platform},
        ${sourceType}, ${sourceValue}, ${postId}, ${postCaption}, ${postMediaUrl},
        ${JSON.stringify(engagement)}, ${platformUserId}, ${followersCount},
        ${isVerified}, NOW()
      )
      ON CONFLICT (client_id, username, platform) DO NOTHING
      RETURNING id
    `;

    if (result.length > 0) {
      console.log(`   Added creator @${username} to tracked_creators`);
      return { inserted: true, id: result[0].id };
    } else {
      console.log(`   Creator @${username} already tracked for this client, skipping`);
      return { inserted: false, reason: 'duplicate' };
    }
  } catch (error) {
    console.error(`   Error adding creator @${username}:`, error.message);
    throw error;
  }
}

/**
 * Add multiple tracked creators (batch with duplicate handling)
 */
async function addTrackedCreators(creators) {
  const results = { inserted: 0, duplicates: 0, errors: 0, errorDetails: [] };

  for (const creator of creators) {
    try {
      const result = await addTrackedCreator(creator);
      if (result.inserted) {
        results.inserted++;
      } else if (result.reason === 'duplicate') {
        results.duplicates++;
      }
    } catch (error) {
      results.errors++;
      results.errorDetails.push({
        username: creator.username || 'unknown',
        error: error.message,
      });
      console.error(`   Error processing creator @${creator.username || 'unknown'}:`, error.message);
    }
  }

  return results;
}

/**
 * Read a setting value by key.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getSettingValue(key) {
  const result = await sql`SELECT value FROM settings WHERE key = ${key} LIMIT 1`;
  return result[0]?.value || null;
}

/**
 * Upsert a setting using ON CONFLICT.
 * @param {string} key
 * @param {string} value
 */
async function setSetting(key, value) {
  await sql`
    INSERT INTO settings (id, key, value, updated_at)
    VALUES (gen_random_uuid(), ${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
}

/**
 * Health check -- test database connectivity.
 * @returns {Promise<boolean>}
 */
async function checkDbHealth() {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  sql,
  addTrackedCreator,
  addTrackedCreators,
  getSettingValue,
  setSetting,
  checkDbHealth,
};
