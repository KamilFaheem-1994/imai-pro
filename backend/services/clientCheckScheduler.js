/**
 * Background service: every 1 minute we tick, fetch all clients, and for each client
 * run runSearchForClient(client) only when that client's check_interval has elapsed
 * since last_checked. All in UTC.
 */

const schedule = require('node-schedule');
const db = require('../config/database');
const instagramService = require('./instagramService');
const tiktokService = require('./tiktokService');

let scheduledJob = null;
let isTickRunning = false;

const DEFAULT_INTERVAL_MINUTES = 2;


/* ============================================================
   UTC DATE FORMATTER (GLOBAL — USE EVERYWHERE)
============================================================ */

function formatDateTimeUTC(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} at ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}


/* ============================================================
   BUILD KEYWORDS (shared logic for Instagram & TikTok)
============================================================ */

/**
 * Extracts normalized handle + hashtag keywords from a tracking config object.
 * @param {object|null} platformTracking - e.g. client.tracking.instagram or client.tracking.tiktok
 * @returns {string[]} Array of "@handle" and "#hashtag" strings
 */
function buildKeywords(platformTracking) {
    const keywords = [];
    if (!platformTracking) return keywords;

    const { handle, hashtags } = platformTracking;

    if (handle && String(handle).trim()) {
        const h = String(handle).trim().replace(/^@/, '');
        keywords.push(`@${h}`);
    }

    if (Array.isArray(hashtags)) {
        hashtags.forEach((tag) => {
            const t = String(tag).trim().replace(/^#/, '');
            if (t) keywords.push(`#${t}`);
        });
    }

    return keywords;
}

function getInstagramKeywords(tracking) {
    return buildKeywords(tracking?.instagram);
}

function getTiktokKeywords(tracking) {
    return buildKeywords(tracking?.tiktok);
}


/* ============================================================
   CHECK IF CLIENT IS DUE (UTC ONLY)
============================================================ */

function isClientDue(client) {
    const nowMs = Date.now();

    const intervalMinutes = Number(client.check_interval);
    const isValidInterval = intervalMinutes && intervalMinutes >= 1;
    const safeInterval = isValidInterval ? intervalMinutes : DEFAULT_INTERVAL_MINUTES;

    if (!isValidInterval) {
        console.warn(`[Scheduler] Client "${client.name}" has invalid check_interval (${client.check_interval}). Defaulting to ${DEFAULT_INTERVAL_MINUTES} min.`);
    }

    console.log(`\n[Scheduler] Client: ${client.name} (${client.id})`);
    console.log(`   Interval: ${safeInterval} min`);

    // First run — no last_checked recorded yet
    if (!client.last_checked) {
        console.log(`   First Run (no last_checked) → Due: true\n`);
        return true;
    }

    const lastCheckedMs = new Date(client.last_checked).getTime();

    if (isNaN(lastCheckedMs)) {
        console.warn(`[Scheduler] Client "${client.name}" has invalid last_checked value: ${client.last_checked}. Treating as due.`);
        return true;
    }

    const nextRunMs = lastCheckedMs + safeInterval * 60 * 1000;
    const isDue = nowMs >= nextRunMs;

    console.log(`   Last Checked: ${formatDateTimeUTC(new Date(lastCheckedMs))}`);
    console.log(`   Next Run:     ${formatDateTimeUTC(new Date(nextRunMs))}`);
    console.log(`   Now:          ${formatDateTimeUTC(new Date(nowMs))}`);
    console.log(`   Due: ${isDue}\n`);

    return isDue;
}


/* ============================================================
   RUN SEARCH FOR CLIENT
============================================================ */

async function runSearchForClient(client) {
    const instagramKeywords = getInstagramKeywords(client.tracking);
    const tiktokKeywords = getTiktokKeywords(client.tracking);

    console.log(`[Search] ${client.name}: ${instagramKeywords.length} Instagram keyword(s), ${tiktokKeywords.length} TikTok keyword(s).`);

    if (instagramKeywords.length === 0 && tiktokKeywords.length === 0) {
        console.log(`[Search] ${client.name}: No keywords configured — skipping.`);
        return;
    }

    try {
        if (instagramKeywords.length > 0) {
            for (const keyword of instagramKeywords) {
                console.log(`[Search] ${client.name}: Instagram → "${keyword}"`);
                await instagramService.searchByKeyword(keyword, client.id);
            }
        }

        if (tiktokKeywords.length > 0) {
            for (const keyword of tiktokKeywords) {
                console.log(`[Search] ${client.name}: TikTok → "${keyword}"`);
                await tiktokService.searchByKeyword(keyword, client.id);
            }
        }

        const updated = await db.updateClientLastChecked(client.id);
        if (updated) {
            console.log(`[Search] ${client.name}: last_checked updated (UTC).`);
        } else {
            console.warn(`[Search] ${client.name}: Failed to update last_checked.`);
        }

    } catch (err) {
        console.error(`[Search] ${client.name} ERROR:`, err.message);
        console.error(err.stack); // preserve stack trace for debugging
    }
}


/* ============================================================
   SINGLE TICK (RUNS EVERY MINUTE)
============================================================ */

async function tick() {
    if (isTickRunning) {
        console.log('[Scheduler] Tick skipped (previous tick still running)');
        return;
    }

    isTickRunning = true;

    try {
        const pool = db.getPool();
        if (!pool) {
            console.warn('[Scheduler] Skipped — No DB connection.');
            return;
        }

        const now = new Date();
        console.log(`\n[Scheduler] ===== Tick at ${formatDateTimeUTC(now)} =====`);

        const clients = await db.getClients();

        if (!clients || clients.length === 0) {
            console.log('[Scheduler] No clients found.');
            return;
        }

        console.log(`[Scheduler] Found ${clients.length} client(s).`);

        for (const client of clients) {
            if (isClientDue(client)) {
                console.log(`[Scheduler] >>> RUNNING search for "${client.name}"`);
                await runSearchForClient(client);
            } else {
                console.log(`[Scheduler] --- SKIPPED "${client.name}" (not due yet)`);
            }
        }

        console.log('[Scheduler] ===== Tick Finished =====\n');

    } catch (err) {
        console.error('[Scheduler] Tick error:', err.message);
        console.error(err.stack);
    } finally {
        isTickRunning = false;
    }
}


/* ============================================================
   START SCHEDULER
============================================================ */

function start() {
    if (scheduledJob) {
        console.log('[Scheduler] Already running.');
        return;
    }
    if (!db.getPool()) {
        console.warn('[Scheduler] Cannot start — No DB connection.');
        return;
    }

    scheduledJob = schedule.scheduleJob('* * * * *', async () => {
        try {
            await tick();
        } catch (err) {
            console.error('[Scheduler] Unhandled scheduler tick error:', err);
        }
    });

    console.log('[Scheduler] Started. Running every minute.');
}


/* ============================================================
   STOP SCHEDULER
============================================================ */

function stop() {
    if (scheduledJob) {
        scheduledJob.cancel();
        scheduledJob = null;
        console.log('[Scheduler] Stopped.');
    }
}


module.exports = {
    start,
    stop,
    tick,
};
