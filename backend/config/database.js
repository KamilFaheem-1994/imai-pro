/**
 * PostgreSQL connection for backend (client check scheduler).
 * Use the same database as the client app (e.g. same URL as client's POSTGRES_URL).
 */
const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

function getPool() {
    if (!process.env.DATABASE_URL) {
        return null;
    }
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 2,
            idleTimeoutMillis: 30000,
        });
        // Force session to UTC so NOW() and all timestamps are UTC (no local TZ shift).
        pool.on('connect', (client) => {
            client.query("SET timezone = 'UTC'").catch(() => { });
        });
    }
    return pool;
}

/**
 * Get all clients with id, name, tracking, check_interval, last_checked.
 * @returns {Promise<Array<{ id: string, name: string, tracking: object, check_interval: number, last_checked: Date | null }>>}
 */
async function getClients() {
    const p = getPool();
    if (!p) return [];
    const result = await p.query(
        `SELECT id, name, tracking, check_interval, last_checked
         FROM clients
         ORDER BY created_at DESC`
    );
    return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        tracking: row.tracking || {},
        check_interval: Math.max(1, parseInt(row.check_interval, 10) || 2),
        last_checked: row.last_checked,
    }));
}

/**
 * Update a client's last_checked to now.
 * @param {string} clientId - UUID of the client
 * @returns {Promise<boolean>} true if updated
 */
async function updateClientLastChecked(clientId) {
    const p = getPool();
    if (!p || !clientId) return false;

    // Session is UTC (set in pool). timestamptz stores instant; pg returns correct Date in Node.
    const result = await p.query(
        `UPDATE clients 
         SET last_checked = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [clientId]
    );

    return (result.rowCount || 0) > 0;
}


/**
 * Insert or update a creator/post in the tracked_creators table.
 * Prevents duplicates by (client_id, post_id): if a row exists, we update it; otherwise insert.
 * Uses SELECT then UPDATE/INSERT because the table has no unique constraint on post_id.
 * @param {object} data - The creator/post data
 * @returns {Promise<boolean>} true if successful
 */
async function upsertTrackedCreator(data) {
    const p = getPool();
    if (!p) return false;

    const {
        clientId,
        username,
        fullName,
        profilePicUrl,
        platform,
        sourceType,
        sourceValue,
        postId,
        postCaption,
        postMediaUrl,
        permalink,
        engagement,
    } = data;

    const engagementJson = JSON.stringify(engagement || {});

    try {
        // Dedupe by (client_id, post_id) when post_id is set; otherwise just insert
        if (clientId && postId) {
            const existing = await p.query(
                `SELECT id FROM tracked_creators WHERE client_id = $1 AND post_id = $2 LIMIT 1`,
                [clientId, postId]
            );
            if (existing.rows.length > 0) {
                await p.query(
                    `UPDATE tracked_creators SET
                        username = $2, full_name = $3, profile_pic_url = $4,
                        post_caption = $5, post_media_url = $6, permalink = $7, engagement = $8
                     WHERE id = $1`,
                    [
                        existing.rows[0].id,
                        username,
                        fullName,
                        profilePicUrl,
                        postCaption,
                        postMediaUrl,
                        permalink ?? null,
                        engagementJson,
                    ]
                );
                return true;
            }
        }

        await p.query(
            `INSERT INTO tracked_creators (
                client_id, username, full_name, profile_pic_url, platform,
                source_type, source_value, post_id, post_caption,
                post_media_url, permalink, engagement, discovered_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
            [
                clientId,
                username,
                fullName,
                profilePicUrl,
                platform,
                sourceType,
                sourceValue,
                postId,
                postCaption,
                postMediaUrl,
                permalink ?? null,
                engagementJson,
            ]
        );
        return true;
    } catch (err) {
        if (err.code === '23505') {
            // Unique violation (e.g. if a constraint is added later)
            return true;
        }
        console.error('[Database] Error in upsertTrackedCreator:', err.message);
        return false;
    }
}

/**
 * Bulk insert or update creators/posts in the tracked_creators table.
 * @param {Array<object>} posts - Array of creator/post data objects
 * @returns {Promise<boolean>} true if all operations successful
 */
async function bulkUpsertTrackedCreators(posts) {
    if (!Array.isArray(posts) || posts.length === 0) return true;

    const p = getPool();
    if (!p) return false;

    try {
        // We use a manual loop with individual upserts for now to maintain the complex deduplication logic
        // but wrapped in a single transaction for better performance and atomicity.
        const client = await p.connect();
        try {
            await client.query('BEGIN');

            for (const data of posts) {
                const {
                    clientId, username, fullName, profilePicUrl, platform,
                    sourceType, sourceType_alt, sourceValue, postId, postCaption,
                    postMediaUrl, permalink, engagement
                } = data;

                const engagementJson = JSON.stringify(engagement || {});

                // Dedupe by (client_id, post_id) when post_id is set
                if (clientId && postId) {
                    const existing = await client.query(
                        `SELECT id FROM tracked_creators WHERE client_id = $1 AND post_id = $2 LIMIT 1`,
                        [clientId, postId]
                    );

                    if (existing.rows.length > 0) {
                        await client.query(
                            `UPDATE tracked_creators SET
                                username = $2, full_name = $3, profile_pic_url = $4,
                                post_caption = $5, post_media_url = $6, permalink = $7, engagement = $8
                             WHERE id = $1`,
                            [
                                existing.rows[0].id,
                                username,
                                fullName,
                                profilePicUrl,
                                postCaption,
                                postMediaUrl,
                                permalink ?? null,
                                engagementJson,
                            ]
                        );
                        continue;
                    }
                }

                // Insert if not found or no postId
                await client.query(
                    `INSERT INTO tracked_creators (
                        client_id, username, full_name, profile_pic_url, platform,
                        source_type, source_value, post_id, post_caption,
                        post_media_url, permalink, engagement, discovered_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
                    [
                        clientId,
                        username,
                        fullName,
                        profilePicUrl,
                        platform,
                        sourceType || sourceType_alt || 'hashtag',
                        sourceValue,
                        postId,
                        postCaption,
                        postMediaUrl,
                        permalink ?? null,
                        engagementJson,
                    ]
                );
            }

            await client.query('COMMIT');
            return true;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[Database] Error in bulkUpsertTrackedCreators:', err.message);
        return false;
    }
}

module.exports = {
    getPool,
    getClients,
    updateClientLastChecked,
    upsertTrackedCreator,
    bulkUpsertTrackedCreators,
};
