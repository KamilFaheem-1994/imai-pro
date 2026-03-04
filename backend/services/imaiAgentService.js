const EventEmitter = require('events');
const axios = require('axios');

// Playwright is optional — only needed for campaign management (not installed by default)
let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  chromium = null;
}

class ImaiAgentService extends EventEmitter {
  static isPlaywrightAvailable() {
    return chromium !== null;
  }

  constructor() {
    super();
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.isStopping = false;
    this.isLoggedIn = false;
    this.openRouterKey = process.env.OPENROUTER_API_KEY;
    this.openRouterModel = 'openai/gpt-4o-mini';
    this.failedCreators = []; // Track failed creators for retry

    // Command queue system for interactive controls
    this.commandQueue = [];
    this.currentCreatorIndex = 0;
    this.creatorsList = []; // Array of { username, status: 'pending'|'processing'|'added'|'failed'|'skipped' }
    this.isPaused = false;
    this.currentCredentials = null; // Store credentials for relogin
    this.currentCampaignId = null; // Store campaign ID for navigation after relogin
  }

  /**
   * Set OpenRouter configuration from client settings
   */
  setOpenRouterConfig(apiKey, model = 'openai/gpt-4o-mini') {
    if (apiKey) {
      this.openRouterKey = apiKey;
      this.log('info', `🤖 Using OpenRouter API key from settings`);
    }
    if (model) {
      this.openRouterModel = model;
      this.log('info', `🤖 AI Model: ${model}`);
    }
  }

  /**
   * Stop the agent gracefully
   */
  async stop() {
    if (!this.isRunning) return;
    this.log('warning', '🛑 Stop requested, finishing current operation...');
    this.isStopping = true;
    this.emit('stopping');
  }

  /**
   * Queue a command to be processed between creator operations
   */
  queueCommand(command) {
    this.commandQueue.push(command);
    this.log('info', `📥 Command queued: ${command.type}`);
  }

  /**
   * Process any pending commands in the queue
   */
  async processCommandQueue() {
    while (this.commandQueue.length > 0) {
      const command = this.commandQueue.shift();

      switch (command.type) {
        case 'skip':
          await this.handleSkipCommand();
          break;
        case 'relogin':
          await this.handleReloginCommand();
          break;
        case 'switch':
          await this.handleSwitchCreatorCommand(command.username);
          break;
        default:
          this.log('warning', `Unknown command type: ${command.type}`);
      }
    }
  }

  /**
   * Handle skip command - mark current creator as skipped and move to next
   */
  async handleSkipCommand() {
    if (this.currentCreatorIndex < this.creatorsList.length) {
      const currentCreator = this.creatorsList[this.currentCreatorIndex];
      this.log('warning', `⏭️ Skipping @${currentCreator.username} by user request`);
      this.creatorsList[this.currentCreatorIndex].status = 'skipped';
      this.emitCreatorsUpdate();
    }
    // The skip flag will be checked in the main loop
    this.skipCurrent = true;
  }

  /**
   * Handle relogin command - force re-authentication
   */
  async handleReloginCommand() {
    if (!this.currentCredentials) {
      this.log('error', '❌ Cannot relogin - no credentials stored');
      return;
    }

    this.log('info', '🔄 Force re-login requested...');
    this.isLoggedIn = false;

    try {
      await this.login(this.currentCredentials.email, this.currentCredentials.password);
      this.log('success', '✅ Re-login successful');

      if (this.currentCampaignId) {
        await this.navigateToCampaign(this.currentCampaignId);
        this.log('success', '✅ Navigated back to campaign');
      }
    } catch (error) {
      this.log('error', `❌ Re-login failed: ${error.message}`);
    }
  }

  /**
   * Handle switch creator command - pause and switch to a different creator
   */
  async handleSwitchCreatorCommand(username) {
    const targetIndex = this.creatorsList.findIndex(
      c => c.username.toLowerCase() === username.toLowerCase()
    );

    if (targetIndex === -1) {
      this.log('error', `❌ Creator @${username} not found in list`);
      return;
    }

    if (this.creatorsList[targetIndex].status !== 'pending') {
      this.log('warning', `⚠️ Creator @${username} is not in pending state (${this.creatorsList[targetIndex].status})`);
      return;
    }

    this.log('info', `🔀 Switching to @${username} (was at index ${this.currentCreatorIndex}, switching to ${targetIndex})`);

    // Mark current as skipped if in processing
    if (this.currentCreatorIndex < this.creatorsList.length &&
        this.creatorsList[this.currentCreatorIndex].status === 'processing') {
      this.creatorsList[this.currentCreatorIndex].status = 'skipped';
    }

    this.switchToIndex = targetIndex;
    this.skipCurrent = true;
    this.emitCreatorsUpdate();
  }

  /**
   * Emit creators list update via SSE
   */
  emitCreatorsUpdate() {
    this.emit('creators_update', {
      creatorsList: this.creatorsList,
      currentCreatorIndex: this.currentCreatorIndex
    });
  }

  /**
   * Get current creators list with statuses
   */
  getCreatorsList() {
    return {
      creatorsList: this.creatorsList,
      currentCreatorIndex: this.currentCreatorIndex,
      isRunning: this.isRunning
    };
  }

  log(level, message, details = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      details,
    };
    this.emit('log', logEntry);
    console.log(`[${level.toUpperCase()}] ${message}${details ? ` - ${JSON.stringify(details)}` : ''}`);
  }

  /**
   * Check if the AI response indicates a login page
   */
  isLoginPageFromAnalysis(analysis) {
    if (!analysis) return false;

    let textToCheck = '';

    if (typeof analysis === 'object' && analysis !== null) {
      // Check pageState, currentState, and stringify the whole thing
      textToCheck = [
        analysis.pageState || '',
        analysis.currentState || '',
        JSON.stringify(analysis)
      ].join(' ').toLowerCase();
    } else if (typeof analysis === 'string') {
      textToCheck = analysis.toLowerCase();
    }

    const loginKeywords = [
      'login',
      'log in',
      'sign in',
      'signin',
      'password field',
      'email and password',
      'enter your email',
      'enter your password',
      'authentication',
      'credentials'
    ];

    return loginKeywords.some(keyword => textToCheck.includes(keyword));
  }

  /**
   * Check if influencer already exists in the campaign (by looking at page content)
   * Uses multiple detection methods for reliability
   */
  async checkInfluencerExistsInCampaign(username) {
    try {
      // Normalize username (remove @ and lowercase)
      const cleanUsername = username.replace('@', '').toLowerCase();
      this.log('info', `🔍 Checking if @${cleanUsername} already exists in campaign...`);

      // METHOD 1: Direct DOM check - look for username in participant links/rows
      // IMAI shows participants as @username links in a table
      const participantSelectors = [
        // Link with @username text
        `a:has-text("@${cleanUsername}")`,
        `a:has-text("${cleanUsername}")`,
        // Table cell containing username
        `td a[href*="${cleanUsername}"]`,
        // Any element with the exact username
        `[class*="participant"] :text-is("@${cleanUsername}")`,
        `[class*="participant"] :text-is("${cleanUsername}")`,
        // Rows in participant table
        `tr:has-text("${cleanUsername}")`,
      ];

      for (const selector of participantSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            // Verify it's in the participants section, not elsewhere
            const isVisible = await element.isVisible();
            if (isVisible) {
              this.log('info', `✓ Found @${cleanUsername} via selector: ${selector}`);
              return true;
            }
          }
        } catch (e) {
          // Selector didn't match, continue to next
        }
      }

      // METHOD 2: Check page HTML content directly
      const pageContent = await this.page.content();
      const pageContentLower = pageContent.toLowerCase();

      // Look for username in participant-related contexts
      // Pattern: the username appears near "participant" or in a table row with follower counts
      const usernameInPage = pageContentLower.includes(cleanUsername);

      if (usernameInPage) {
        // Check if it appears in a participant context (not just anywhere)
        // Look for patterns like: @username</a> or href containing username
        const patterns = [
          new RegExp(`@${cleanUsername}\\s*</a>`, 'i'),
          new RegExp(`>${cleanUsername}</a>`, 'i'),
          new RegExp(`href="[^"]*${cleanUsername}[^"]*"`, 'i'),
          // Also check for username in table rows with typical metrics (followers, engagement)
          new RegExp(`${cleanUsername}[^<]*\\d+[.,]?\\d*k?\\s*(followers|engagement)?`, 'i'),
        ];

        for (const pattern of patterns) {
          if (pattern.test(pageContent)) {
            this.log('info', `✓ Found @${cleanUsername} via HTML pattern match`);
            return true;
          }
        }
      }

      // METHOD 3: Use evaluate to check within participant table specifically
      try {
        const existsInTable = await this.page.evaluate((username) => {
          // Find all links/text that might contain usernames in participant area
          const participantSection = document.querySelector('[class*="participant"], table, .influencer-list');
          if (!participantSection) return false;

          const text = participantSection.textContent.toLowerCase();
          return text.includes(username.toLowerCase()) || text.includes('@' + username.toLowerCase());
        }, cleanUsername);

        if (existsInTable) {
          this.log('info', `✓ Found @${cleanUsername} in participant section via JS evaluate`);
          return true;
        }
      } catch (e) {
        // Evaluate failed, continue
      }

      this.log('info', `✗ @${cleanUsername} not found in campaign`);
      return false;
    } catch (error) {
      this.log('warning', `Error checking if influencer exists: ${error.message}`);
      return false;
    }
  }

  /**
   * Take a screenshot and get AI analysis of the current page state
   */
  async analyzePageWithAI(context, expectedState = null) {
    if (!this.page) return { success: false, analysis: 'No page available' };

    try {
      // Take screenshot
      const screenshot = await this.page.screenshot({ type: 'png' });
      const base64Image = screenshot.toString('base64');

      // Get current URL for context
      const currentUrl = this.page.url();

      const prompt = expectedState
        ? `You are analyzing a screenshot of the IMAI influencer marketing platform.

Current URL: ${currentUrl}
Context: ${context}
Expected state: ${expectedState}

Analyze this screenshot and determine:
1. Is the page in the expected state? (true/false)
2. What is currently visible on the page?
3. What action should be taken next?
4. Are there any error messages or issues visible?

Respond in JSON format:
{
  "isExpectedState": true/false,
  "currentState": "description of what you see",
  "nextAction": "what action to take",
  "hasError": true/false,
  "errorMessage": "error text if any",
  "confidence": 0-100
}`
        : `You are analyzing a screenshot of the IMAI influencer marketing platform.

Current URL: ${currentUrl}
Context: ${context}

Describe what you see on the page:
1. What state is the page in?
2. Are there any modals/dialogs open?
3. Are there any error or success messages?
4. What interactive elements are visible?

Respond in JSON format:
{
  "pageState": "description",
  "hasModal": true/false,
  "hasError": true/false,
  "hasSuccess": true/false,
  "message": "any visible message",
  "visibleButtons": ["list of visible button texts"],
  "confidence": 0-100
}`;

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: this.openRouterModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
              ]
            }
          ],
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://panel.influencerhq.io',
            'X-Title': 'InfluencerHQ Agent'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content;

      // Try to parse JSON from response
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          this.log('ai', `🤖 AI Analysis: ${analysis.currentState || analysis.pageState}`, { confidence: analysis.confidence });
          return { success: true, analysis };
        }
      } catch (e) {
        // Return raw response if JSON parsing fails
      }

      this.log('ai', `🤖 AI Response: ${aiResponse.substring(0, 200)}...`);
      return { success: true, analysis: aiResponse };

    } catch (error) {
      this.log('warning', `AI analysis failed: ${error.message}`);
      return { success: false, analysis: null, error: error.message };
    }
  }

  /**
   * Wait for a condition with AI verification
   */
  async waitForStateWithAI(context, expectedState, maxWaitMs = 30000, checkIntervalMs = 3000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const { success, analysis } = await this.analyzePageWithAI(context, expectedState);

      if (success && analysis && typeof analysis === 'object') {
        if (analysis.isExpectedState) {
          this.log('success', `✅ AI confirmed: ${expectedState}`);
          return { success: true, analysis };
        }

        if (analysis.hasError) {
          this.log('warning', `⚠️ AI detected error: ${analysis.errorMessage}`);
          return { success: false, analysis, error: analysis.errorMessage };
        }

        this.log('info', `⏳ Waiting... Current: ${analysis.currentState}`);
      }

      await this.page.waitForTimeout(checkIntervalMs);
    }

    this.log('warning', `⏱️ Timeout waiting for: ${expectedState}`);
    return { success: false, timeout: true };
  }

  /**
   * Extract campaign ID from JWT URL
   */
  extractCampaignId(campaignIdOrUrl) {
    if (/^\d+$/.test(campaignIdOrUrl)) {
      return campaignIdOrUrl;
    }

    if (campaignIdOrUrl.includes('/c/')) {
      try {
        const jwtToken = campaignIdOrUrl.split('/c/')[1];
        const payload = jwtToken.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
        if (decoded.campaign) {
          this.log('info', `Extracted campaign ID: ${decoded.campaign} from JWT`);
          return decoded.campaign.toString();
        }
      } catch (e) {
        this.log('warning', `Failed to decode JWT: ${e.message}`);
      }
    }

    const match = campaignIdOrUrl.match(/\/campaigns\/(?:influencers\/)?(\d+)/);
    if (match) return match[1];

    return campaignIdOrUrl;
  }

  async initialize() {
    if (!chromium) {
      this.log('error', 'Playwright is not installed. Campaign management requires: npm install playwright');
      throw new Error('Playwright is not installed. Install it with: npm install playwright');
    }
    this.log('info', 'Initializing Playwright browser...');
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.page = await this.browser.newPage();
      this.log('success', 'Browser initialized successfully');
      return true;
    } catch (error) {
      this.log('error', 'Failed to initialize browser', { error: error.message });
      throw error;
    }
  }

  async login(email, password) {
    if (!this.browser || !this.page) {
      await this.initialize();
    }

    this.log('info', 'Navigating to IMAI login page...');

    try {
      await this.page.goto('https://imai.co/login', { waitUntil: 'networkidle', timeout: 60000 });
      this.log('info', 'Login page loaded');

      // AI verification of login page
      await this.analyzePageWithAI('Verifying login page loaded');

      await this.page.waitForSelector('input[name="username"]', { timeout: 15000 });
      await this.page.waitForTimeout(2000);

      this.log('info', 'Entering credentials...');
      await this.page.fill('input[name="username"]', email);
      await this.page.fill('input[name="password"]', password);

      this.log('info', 'Clicking login button...');
      await this.page.click('button.btn-dark');

      this.log('info', 'Waiting for authentication...');
      await this.page.waitForURL(url => !url.href.includes('/login'), { timeout: 60000 });

      // AI verification of successful login
      const loginCheck = await this.analyzePageWithAI('Verifying login success', 'User is logged in and on dashboard or campaigns page');

      this.isLoggedIn = true;
      this.log('success', 'Successfully logged into IMAI!');
      return true;
    } catch (error) {
      this.log('error', 'Login failed', { error: error.message });
      throw error;
    }
  }

  async navigateToCampaign(campaignIdOrUrl) {
    if (!this.isLoggedIn) throw new Error('Not logged in');

    const campaignId = this.extractCampaignId(campaignIdOrUrl);
    this.log('info', `Navigating to campaign influencers page (ID: ${campaignId})...`);

    try {
      const campaignUrl = `https://imai.co/campaigns/influencers/${campaignId}`;
      await this.page.goto(campaignUrl, { waitUntil: 'networkidle', timeout: 60000 });

      // Check URL immediately - if redirected to login, we need to re-auth
      const currentUrl = this.page.url();
      this.log('info', `📍 Post-navigation URL: ${currentUrl}`);

      if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
        this.log('warning', '⚠️ Redirected to login after navigation! Session expired.');
        throw new Error('Session expired - redirected to login');
      }

      // AI verification
      const navCheck = await this.waitForStateWithAI(
        'Verifying campaign page loaded',
        'Campaign influencers page is loaded with Add influencer button visible',
        30000
      );

      if (!navCheck.success) {
        throw new Error('Failed to confirm campaign page loaded');
      }

      this.log('success', 'Navigated to campaign influencers page');
      return campaignId;
    } catch (error) {
      this.log('error', 'Failed to navigate to campaign', { error: error.message });
      throw error;
    }
  }

  /**
   * Close any open modals to reset page state
   * Enhanced version that checks backdrop, waits for hidden state, and forcefully removes if needed
   */
  async ensureModalClosed() {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check if modal OR backdrop is visible
        const modal = await this.page.$('modal-container, .modal.show, .modal.fade.show, [role="dialog"][aria-modal="true"]');
        const backdrop = await this.page.$('.modal-backdrop');
        const bodyModalOpen = await this.page.$('body.modal-open');

        if (!modal && !backdrop && !bodyModalOpen) {
          if (attempt > 1) {
            this.log('info', '✓ Modal and backdrop closed successfully');
          }
          return true;
        }

        this.log('info', `🔄 Closing open modal (attempt ${attempt}/${maxAttempts})...`);
        this.log('info', `  → Modal: ${!!modal}, Backdrop: ${!!backdrop}, Body.modal-open: ${!!bodyModalOpen}`);

        // Attempt 1: Try clicking Cancel/Close/No button first (inside modal)
        try {
          const closeButtons = [
            'modal-container button:has-text("Cancel")',
            'modal-container button:has-text("No")',
            'modal-container button:has-text("Close")',
            'modal-container .close',
            'modal-container .btn-close',
            'modal-container button[aria-label="Close"]',
            '.modal.show button:has-text("Cancel")',
            '.modal.show button:has-text("No")',
            '.modal.show .close',
            '.modal-header .close',
            '.modal-header .btn-close',
            'button.close[data-dismiss="modal"]',
            'button[data-bs-dismiss="modal"]',
          ];

          for (const selector of closeButtons) {
            const btn = await this.page.$(selector);
            if (btn) {
              const isVisible = await btn.isVisible().catch(() => false);
              if (isVisible) {
                await btn.click();
                this.log('info', `  → Clicked close button: ${selector}`);
                await this.page.waitForTimeout(1000);
                break;
              }
            }
          }
        } catch (e) {
          // Continue to next approach
        }

        // Check if closed (including backdrop)
        const stillOpen1 = await this.page.$('modal-container, .modal.show, .modal-backdrop');
        if (!stillOpen1) {
          // Also clean up body class
          await this.page.evaluate(() => document.body.classList.remove('modal-open'));
          continue;
        }

        // Attempt 2: Try Escape key
        this.log('info', '  → Pressing Escape key...');
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(1000);

        // Check if closed
        const stillOpen2 = await this.page.$('modal-container, .modal.show, .modal-backdrop');
        if (!stillOpen2) {
          await this.page.evaluate(() => document.body.classList.remove('modal-open'));
          continue;
        }

        // Attempt 3: Click on backdrop (modal-backdrop)
        try {
          this.log('info', '  → Clicking modal backdrop...');
          const backdropEl = await this.page.$('.modal-backdrop');
          if (backdropEl) {
            await backdropEl.click({ position: { x: 5, y: 5 }, force: true });
            await this.page.waitForTimeout(1000);
          }
        } catch (e) {
          // Continue
        }

        // Check if closed
        const stillOpen3 = await this.page.$('modal-container, .modal.show, .modal-backdrop');
        if (!stillOpen3) {
          await this.page.evaluate(() => document.body.classList.remove('modal-open'));
          continue;
        }

        // Attempt 4: Click far outside modal
        this.log('info', '  → Clicking outside modal area...');
        await this.page.mouse.click(1, 1);
        await this.page.waitForTimeout(1000);

        // Attempt 5: Force remove modal elements via JavaScript
        if (attempt >= 3) {
          this.log('info', '  → Force removing modal elements via JavaScript...');
          await this.page.evaluate(() => {
            // Remove all modal containers
            document.querySelectorAll('modal-container, .modal').forEach(el => {
              el.classList.remove('show', 'fade');
              el.style.display = 'none';
            });
            // Remove backdrop
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            // Remove body classes
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
          });
          await this.page.waitForTimeout(500);
        }

      } catch (e) {
        this.log('warning', `Modal cleanup error on attempt ${attempt}: ${e.message}`);
      }
    }

    // Final check - if modal still open after all attempts, force remove
    const finalModal = await this.page.$('modal-container, .modal.show');
    const finalBackdrop = await this.page.$('.modal-backdrop');

    if (finalModal || finalBackdrop) {
      this.log('warning', '⚠️ Modal still present after all attempts. Force removing...');
      await this.page.evaluate(() => {
        document.querySelectorAll('modal-container, .modal, .modal-backdrop').forEach(el => el.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      });
      await this.page.waitForTimeout(500);

      // Verify removal
      const verifyModal = await this.page.$('modal-container, .modal.show, .modal-backdrop');
      if (verifyModal) {
        this.log('warning', '⚠️ Modal could not be closed. Will need page refresh.');
        return false;
      }
    }

    return true;
  }

  /**
   * Force close any modal - call this unconditionally before attempting to click "Add influencer"
   * This is more aggressive than ensureModalClosed and doesn't rely on detecting if modal is open
   */
  async forceCloseModal() {
    this.log('info', '🔒 Force closing any open modals...');

    // First try the gentle approach
    const gentleClosed = await this.ensureModalClosed();

    if (!gentleClosed) {
      // Nuclear option - remove everything modal-related
      this.log('info', '  → Using nuclear option to remove all modal elements...');
      await this.page.evaluate(() => {
        // Remove all modal-related elements
        document.querySelectorAll('modal-container, .modal, .modal-dialog, .modal-backdrop, .modal-content').forEach(el => {
          el.remove();
        });
        // Clean up body
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
      });
      await this.page.waitForTimeout(500);
    }

    // Wait for any animations to complete
    try {
      await this.page.waitForSelector('modal-container', { state: 'hidden', timeout: 2000 }).catch(() => {});
      await this.page.waitForSelector('.modal-backdrop', { state: 'hidden', timeout: 2000 }).catch(() => {});
    } catch (e) {
      // Elements might not exist, which is fine
    }

    // Final verification
    const anyModal = await this.page.$('modal-container, .modal.show, .modal-backdrop');
    if (anyModal) {
      this.log('warning', '⚠️ Modal elements still detected after force close');
      return false;
    }

    this.log('info', '✓ Modal state cleared');
    return true;
  }

  /**
   * Click Cancel button inside modal to close it explicitly
   * Use this after errors to ensure modal is properly closed
   */
  async clickCancelInModal() {
    this.log('info', '🔙 Clicking Cancel to close modal...');

    const cancelSelectors = [
      'modal-container button:has-text("Cancel")',
      'modal-container button:has-text("Close")',
      'modal-container button:has-text("No")',
      '.modal.show button:has-text("Cancel")',
      '.modal.show button:has-text("Close")',
      '.modal-footer button:has-text("Cancel")',
      '.modal-footer button.btn-secondary',
      'button[data-dismiss="modal"]',
      'button[data-bs-dismiss="modal"]',
      '.modal-header .close',
      '.modal-header .btn-close',
    ];

    for (const selector of cancelSelectors) {
      try {
        const btn = await this.page.$(selector);
        if (btn) {
          const isVisible = await btn.isVisible().catch(() => false);
          if (isVisible) {
            await btn.click();
            this.log('info', `  → Clicked: ${selector}`);
            await this.page.waitForTimeout(1000);

            // Verify modal closed
            const stillOpen = await this.page.$('modal-container, .modal.show, .modal-backdrop');
            if (!stillOpen) {
              this.log('info', '✓ Modal closed via Cancel button');
              return true;
            }
          }
        }
      } catch (e) {
        // Try next selector
      }
    }

    // If Cancel didn't work, try Escape
    this.log('info', '  → Cancel button not found, pressing Escape...');
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(1000);

    // Force cleanup as last resort
    await this.forceCloseModal();
    return true;
  }

  /**
   * Check if we're still logged in, re-login if needed
   */
  async ensureLoggedIn(email, password) {
    const currentUrl = this.page.url();
    this.log('info', `🔍 ensureLoggedIn: Current URL: ${currentUrl}`);

    // Check if we're on login page by URL
    if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
      this.log('warning', '⚠️ Session expired (URL check), re-logging in...');
      this.isLoggedIn = false;
      await this.login(email, password);
      return true; // Indicates we had to re-login
    }

    // AI check for login state
    const result = await this.analyzePageWithAI('Quick check: is this a login page with username/email and password fields?');

    // Use the helper method for consistent login detection
    if (this.isLoginPageFromAnalysis(result.analysis)) {
      this.log('warning', '⚠️ AI detected login page, re-logging in...');
      this.isLoggedIn = false;
      await this.login(email, password);
      return true;
    }

    return false;
  }

  /**
   * Helper to handle login page detection and re-login
   * Call this after ANY AI analysis to check if we got logged out
   */
  async handleLoginIfDetected(analysis, credentials, campaignId) {
    if (this.isLoginPageFromAnalysis(analysis)) {
      this.log('warning', '⚠️ LOGIN PAGE DETECTED! Re-logging in...');
      this.isLoggedIn = false;
      await this.login(credentials.email, credentials.password);
      this.log('info', '✅ Re-login complete, navigating back to campaign...');
      await this.navigateToCampaign(campaignId);
      return true;
    }
    return false;
  }

  async addInfluencerWithAI(username, credentials, campaignId) {
    if (!this.isLoggedIn) throw new Error('Not logged in');

    this.log('info', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    this.log('info', `🎯 Starting: Add @${username} to campaign`);
    this.log('info', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      // PRE-CHECK: Does this influencer already exist in the campaign?
      this.log('info', '📍 Pre-check: Checking if influencer already exists...');
      const alreadyExists = await this.checkInfluencerExistsInCampaign(username);
      if (alreadyExists) {
        this.log('warning', `⏭️ @${username} already exists in campaign - skipping`);
        return { success: false, username, reason: 'already_exists' };
      }
      this.log('info', `✓ @${username} not found in campaign, proceeding to add...`);

      // CHECK: Are we still logged in? (URL-based check)
      const reloggedIn = await this.ensureLoggedIn(credentials.email, credentials.password);
      if (reloggedIn) {
        this.log('info', '🔄 Navigating back to campaign page...');
        await this.navigateToCampaign(campaignId);
      }

      // STEP 0: Force close any lingering modals before attempting to click Add influencer
      // This prevents the "modal intercepts pointer events" error from previous failed attempts
      await this.forceCloseModal();

      // STEP 1: Click "Add influencer" button
      this.log('info', '📍 Step 1: Looking for "Add influencer" button...');

      // First verify the page state - check if we're still logged in
      let pageAnalysis = await this.analyzePageWithAI('Checking if Add influencer button is visible or if login form is shown');

      // CRITICAL: Check if AI detected a login page and handle it
      if (await this.handleLoginIfDetected(pageAnalysis.analysis, credentials, campaignId)) {
        // We re-logged in, now re-verify the page
        this.log('info', '🔍 Verifying page after re-login...');
        pageAnalysis = await this.analyzePageWithAI('Verifying Add influencer button is now visible after re-login');

        // If STILL showing login, something is wrong
        if (this.isLoginPageFromAnalysis(pageAnalysis.analysis)) {
          throw new Error('Login failed - still showing login page after re-login attempt');
        }
      }

      // Extract page state for modal check
      const analysis = pageAnalysis.analysis;
      let pageStateStr = '';
      if (typeof analysis === 'object' && analysis !== null) {
        pageStateStr = (analysis.pageState || analysis.currentState || '').toLowerCase();
      } else if (typeof analysis === 'string') {
        pageStateStr = analysis.toLowerCase();
      }
      const fullAnalysisStr = JSON.stringify(analysis || '').toLowerCase();

      // Check if a modal is already open (from previous operation)
      const hasOpenModal = pageStateStr.includes('modal') ||
                           fullAnalysisStr.includes('modal') ||
                           fullAnalysisStr.includes('dialog');

      // Also check DOM directly for modal
      const domModalOpen = await this.page.$('modal-container.show, modal-container.modal, .modal.show, .modal.fade.show');

      if (hasOpenModal || domModalOpen) {
        this.log('warning', '⚠️ Modal already open, closing it first...');

        const modalClosed = await this.ensureModalClosed();

        if (!modalClosed) {
          // Modal couldn't be closed, refresh the page
          this.log('info', '🔄 Refreshing page to clear stuck modal...');
          await this.page.reload({ waitUntil: 'networkidle', timeout: 30000 });
          await this.page.waitForTimeout(2000);

          // Navigate back to campaign if needed
          const currentUrl = this.page.url();
          if (!currentUrl.includes(`/campaigns/influencers/${campaignId}`)) {
            await this.navigateToCampaign(campaignId);
          }
        }

        // Verify modal is closed
        this.log('info', '🔍 Verifying modal is closed...');
        await this.page.waitForTimeout(500);
      }

      const addButtonSelector = 'button:has-text("Add influencer")';
      await this.page.waitForSelector(addButtonSelector, { timeout: 20000 });

      // Use force click if element might be obscured
      try {
        await this.page.click(addButtonSelector, { timeout: 5000 });
      } catch (clickError) {
        this.log('warning', '⚠️ Normal click failed, trying force click...');
        await this.page.click(addButtonSelector, { force: true });
      }
      this.log('info', '✓ Clicked "Add influencer" button');

      // STEP 2: Wait for modal to open with AI verification
      this.log('info', '📍 Step 2: Waiting for modal to open...');
      const modalCheck = await this.waitForStateWithAI(
        'Waiting for add influencer modal',
        'Modal/dialog is open with an input field for entering profile URL or handle',
        30000,
        2000
      );

      if (!modalCheck.success) {
        throw new Error('Modal did not open properly');
      }

      // STEP 3: Enter username
      this.log('info', `📍 Step 3: Entering username: @${username}`);
      const inputSelector = 'input[placeholder="Profile URL, @handle or user ID"]';
      await this.page.waitForSelector(inputSelector, { timeout: 20000 });

      // Clear and type slowly
      await this.page.fill(inputSelector, '');
      await this.page.waitForTimeout(500);
      await this.page.type(inputSelector, username, { delay: 150 });
      this.log('info', `✓ Entered: ${username}`);

      // STEP 4: Wait for search results with DOM probe + AI fallback
      this.log('info', '📍 Step 4: Waiting for search results dropdown...');

      // First try DOM probe for common dropdown selectors
      const dropdownProbeSelectors = [
        'ngb-typeahead-window',
        '[role="listbox"]',
        '.typeahead-popup',
        '.autocomplete-results',
        '.dropdown-menu.show',
      ];

      let dropdownFound = false;
      for (const selector of dropdownProbeSelectors) {
        try {
          await this.page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
          this.log('info', `✓ Dropdown detected via DOM probe: ${selector}`);
          dropdownFound = true;
          break;
        } catch (e) {
          // Try next selector
        }
      }

      // If DOM probe failed, fall back to AI verification
      if (!dropdownFound) {
        this.log('info', '  → DOM probe found no dropdown, checking with AI...');
        const searchCheck = await this.waitForStateWithAI(
          `Waiting for search results for "${username}"`,
          `Dropdown showing search results with "${username}" or similar usernames visible`,
          15000,
          2000
        );

        // If AI also doesn't see results, the search likely returned nothing
        if (!searchCheck.success) {
          this.log('warning', `⚠️ No search results found for @${username}`);
          // Click Cancel to close modal before throwing
          await this.clickCancelInModal();
          throw new Error(`No search results found for @${username}`);
        }
      }

      // STEP 5: Click on the result from dropdown
      this.log('info', '📍 Step 5: Selecting from dropdown...');

      // Wait a moment for dropdown to fully render
      await this.page.waitForTimeout(1500);

      // Try multiple selector strategies for IMAI's typeahead dropdown
      const dropdownSelectors = [
        // NgBootstrap typeahead selectors
        'ngb-typeahead-window button',
        'ngb-typeahead-window .dropdown-item',
        'ngb-typeahead-window [role="option"]',
        // Generic autocomplete/dropdown patterns
        '.typeahead-popup button',
        '.typeahead-popup .dropdown-item',
        '.autocomplete-results button',
        '.autocomplete-results .result-item',
        '.search-results button',
        '.search-results .result-item',
        // Angular Material autocomplete
        'mat-option',
        '.mat-autocomplete-panel mat-option',
        // Generic dropdown patterns
        '[role="listbox"] [role="option"]',
        '.dropdown-menu button',
        '.dropdown-menu .dropdown-item',
        '.dropdown-menu a',
        // List-based results
        'ul.dropdown-menu li',
        'ul.dropdown-menu li a',
        'ul.dropdown-menu li button',
        // Any clickable item in a dropdown container
        '[class*="dropdown"] button:visible',
        '[class*="typeahead"] button:visible',
        '[class*="autocomplete"] [class*="item"]:visible',
      ];

      let clicked = false;

      // First, try to find an exact match for the username
      const exactMatchSelectors = [
        `span:text-is("${username}")`,
        `span:text-is("@${username}")`,
        `button:has-text("${username}")`,
        `a:has-text("${username}")`,
        `div:has-text("${username}"):not(:has(*:has-text("${username}")))`, // Innermost element
        `[role="option"]:has-text("${username}")`,
      ];

      for (const selector of exactMatchSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            const isVisible = await element.isVisible().catch(() => false);
            if (isVisible) {
              await element.click();
              this.log('info', `✓ Selected exact match via: ${selector}`);
              clicked = true;
              break;
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // If exact match failed, try to click first result in dropdown
      if (!clicked) {
        this.log('info', 'Exact match not found, looking for first dropdown result...');

        for (const selector of dropdownSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              const isVisible = await element.isVisible().catch(() => false);
              if (isVisible) {
                await element.click();
                this.log('info', `✓ Selected first result via: ${selector}`);
                clicked = true;
                break;
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      }

      // If still not clicked, try using page.evaluate to find and click
      if (!clicked) {
        this.log('info', 'Standard selectors failed, trying JS evaluate...');

        const evaluateClicked = await this.page.evaluate((username) => {
          // Look for any dropdown/typeahead visible on page
          const dropdownContainers = document.querySelectorAll(
            'ngb-typeahead-window, [class*="typeahead"], [class*="dropdown"], [class*="autocomplete"], [role="listbox"]'
          );

          for (const container of dropdownContainers) {
            if (container.offsetParent === null) continue; // Skip hidden

            // Find clickable items within
            const items = container.querySelectorAll('button, a, [role="option"], .dropdown-item, li');
            for (const item of items) {
              if (item.offsetParent === null) continue; // Skip hidden

              const text = item.textContent.toLowerCase();
              if (text.includes(username.toLowerCase())) {
                item.click();
                return { clicked: true, text: item.textContent };
              }
            }

            // If no match, just click the first visible item
            for (const item of items) {
              if (item.offsetParent !== null) {
                item.click();
                return { clicked: true, text: item.textContent, firstItem: true };
              }
            }
          }

          return { clicked: false };
        }, username);

        if (evaluateClicked.clicked) {
          this.log('info', `✓ Selected via JS evaluate: "${evaluateClicked.text}"${evaluateClicked.firstItem ? ' (first item)' : ''}`);
          clicked = true;
        }
      }

      // Final fallback: press Enter to select first result
      if (!clicked) {
        this.log('info', 'All selectors failed, trying Enter key to select...');
        await this.page.keyboard.press('ArrowDown');
        await this.page.waitForTimeout(300);
        await this.page.keyboard.press('Enter');
        this.log('info', '✓ Pressed Enter to select');
        clicked = true; // Assume it worked, will verify in next step
      }

      // Brief wait for selection to register
      await this.page.waitForTimeout(1000);

      // STEP 6: Wait for confirmation dialog with AI
      this.log('info', '📍 Step 6: Waiting for confirmation dialog...');
      await this.page.waitForTimeout(3000);

      const confirmCheck = await this.waitForStateWithAI(
        'Waiting for Yes/No confirmation',
        'Confirmation dialog is visible with Yes button',
        20000,
        2000
      );

      // STEP 7: Click Yes
      this.log('info', '📍 Step 7: Clicking "Yes" to confirm...');
      const yesButton = 'button.btn-success';
      await this.page.waitForSelector(yesButton, { timeout: 15000 });
      await this.page.click(yesButton);
      this.log('info', '✓ Clicked Yes button');

      // STEP 8: Wait for completion with AI verification
      this.log('info', '📍 Step 8: Waiting for addition to complete...');
      const completionCheck = await this.waitForStateWithAI(
        `Verifying ${username} was added`,
        'Modal is closed and we are back on the influencers list page, or success message is shown',
        30000,
        3000
      );

      // Final verification
      this.log('info', '📍 Step 9: Final verification...');
      await this.page.waitForTimeout(2000);

      const finalCheck = await this.analyzePageWithAI(
        `Confirming @${username} is now in the campaign list`,
        `The influencer ${username} appears in the list or the modal has closed successfully`
      );

      this.log('success', `✅ Successfully added @${username} to campaign!`);

      // Ensure modal is closed before returning
      await this.ensureModalClosed();

      return { success: true, username };

    } catch (error) {
      this.log('error', `❌ Failed to add @${username}: ${error.message}`);

      // CRITICAL: First try to click Cancel to properly close the modal
      // This prevents "modal intercepts pointer events" on next creator
      await this.clickCancelInModal();

      // Then ensure modal is fully closed (including backdrop)
      const modalClosed = await this.forceCloseModal();

      // If modal couldn't be closed, refresh the page
      if (!modalClosed) {
        this.log('info', '🔄 Refreshing page to reset state...');
        try {
          await this.page.reload({ waitUntil: 'networkidle', timeout: 30000 });
          await this.page.waitForTimeout(2000);

          // Check if we're still on the campaign page, navigate if needed
          const currentUrl = this.page.url();
          if (!currentUrl.includes(`/campaigns/influencers/${campaignId}`)) {
            await this.navigateToCampaign(campaignId);
          }

          this.log('info', '✓ Page refreshed and ready for next creator');
        } catch (refreshError) {
          this.log('warning', `Page refresh failed: ${refreshError.message}`);
        }
      }

      // Check for "already exists" via AI
      const errorCheck = await this.analyzePageWithAI('Checking if error indicates user already exists');
      if (errorCheck.analysis && typeof errorCheck.analysis === 'object') {
        if (errorCheck.analysis.hasError && errorCheck.analysis.errorMessage?.toLowerCase().includes('already')) {
          this.log('warning', `⚠️ @${username} already exists in campaign`);
          return { success: false, username, reason: 'already_exists' };
        }
      }

      // Add to failed list for retry
      this.failedCreators.push(username);
      return { success: false, username, reason: error.message };
    }
  }

  async runAgentForClient(client, imaiCredentials, creators) {
    // Force reset if somehow stuck in running state without browser
    if (this.isRunning && !this.browser) {
      this.log('warning', '⚠️ Resetting stale running state (no browser found)');
      this.isRunning = false;
    }

    if (this.isRunning) {
      throw new Error('Agent is already running');
    }

    this.isRunning = true;
    this.isStopping = false;
    this.failedCreators = [];

    // Store credentials and campaign ID for relogin/navigation
    this.currentCredentials = imaiCredentials;
    this.currentCampaignId = client.imaiCampaignId;

    // Initialize command queue state
    this.commandQueue = [];
    this.skipCurrent = false;
    this.switchToIndex = null;
    this.currentCreatorIndex = 0;

    // Initialize creators list with pending status
    this.creatorsList = creators.map(c => ({
      username: c.username,
      status: 'pending'
    }));
    this.emitCreatorsUpdate();

    const results = {
      total: creators.length,
      added: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    try {
      this.log('info', '╔══════════════════════════════════════════════════╗');
      this.log('info', '║       IMAI AI-POWERED AGENT STARTING             ║');
      this.log('info', '╚══════════════════════════════════════════════════╝');
      this.log('info', `Client: ${client.name}`);
      this.log('info', `Campaign: ${client.imaiCampaignId}`);
      this.log('info', `Creators to add: ${creators.length}`);
      this.log('info', `AI Model: ${this.openRouterModel}`);
      this.log('info', '');

      // Initialize
      await this.initialize();

      // Login
      await this.login(imaiCredentials.email, imaiCredentials.password);

      // Navigate to campaign
      await this.navigateToCampaign(client.imaiCampaignId);

      // Emit initial progress so UI shows controls immediately
      this.emit('progress', {
        current: 0,
        total: creators.length,
        added: 0,
        failed: 0,
        skipped: 0,
        currentCreator: creators[0]?.username || '',
        isRetry: false
      });

      // Process each creator using index-based loop for switch support
      let i = 0;
      while (i < creators.length) {
        // Process any pending commands first
        await this.processCommandQueue();

        // Handle switch command
        if (this.switchToIndex !== null) {
          i = this.switchToIndex;
          this.switchToIndex = null;
          this.skipCurrent = false;
        }

        // Check if stop was requested
        if (this.isStopping) {
          this.log('warning', '🛑 Agent stopped by user');
          break;
        }

        // Skip already processed creators (added/failed/skipped)
        if (this.creatorsList[i].status !== 'pending') {
          i++;
          continue;
        }

        const creator = creators[i];
        this.currentCreatorIndex = i;

        // Skip invalid usernames
        if (!creator.username || creator.username === 'unknown') {
          this.log('warning', `Skipping invalid username: ${creator.username}`);
          this.creatorsList[i].status = 'skipped';
          results.skipped++;
          results.details.push({ success: false, username: creator.username, reason: 'invalid_username' });
          this.emitCreatorsUpdate();
          i++;
          continue;
        }

        // Mark as processing and emit update
        this.creatorsList[i].status = 'processing';
        this.emitCreatorsUpdate();

        // Emit progress at start of each creator so UI updates immediately
        this.emit('progress', {
          current: i,
          total: creators.length,
          added: results.added,
          failed: results.failed,
          skipped: results.skipped,
          currentCreator: creator.username,
          isRetry: false
        });

        this.log('info', '');
        this.log('info', `═══════════════════════════════════════════════════`);
        this.log('info', `  Processing ${i + 1}/${creators.length}: @${creator.username}`);
        this.log('info', `═══════════════════════════════════════════════════`);

        // Check for skip command before processing
        if (this.skipCurrent) {
          this.skipCurrent = false;
          this.creatorsList[i].status = 'skipped';
          results.skipped++;
          results.details.push({ success: false, username: creator.username, reason: 'user_skipped' });
          this.emitCreatorsUpdate();
          i++;
          continue;
        }

        const result = await this.addInfluencerWithAI(creator.username, imaiCredentials, client.imaiCampaignId);
        results.details.push(result);

        // Update creator status based on result
        if (result.success) {
          this.creatorsList[i].status = 'added';
          results.added++;
        } else if (result.reason === 'already_exists') {
          this.creatorsList[i].status = 'skipped';
          results.skipped++;
        } else {
          this.creatorsList[i].status = 'failed';
          results.failed++;
        }
        this.emitCreatorsUpdate();

        // Emit progress for real-time updates
        this.emit('progress', {
          current: i + 1,
          total: creators.length,
          added: results.added,
          failed: results.failed,
          skipped: results.skipped,
          currentCreator: creator.username,
          lastResult: result
        });

        i++;

        // 30 second wait between creators (check for commands during wait)
        if (i < creators.length && !this.isStopping) {
          this.log('info', '');
          this.log('info', '⏳ Waiting 30 seconds before next creator...');

          // Split wait into smaller chunks to check for commands
          for (let waitTime = 0; waitTime < 30000; waitTime += 1000) {
            if (this.commandQueue.length > 0 || this.isStopping) break;
            await this.page.waitForTimeout(1000);
          }
        }
      }

      // RETRY FAILED CREATORS (if not stopping)
      if (this.failedCreators.length > 0 && !this.isStopping) {
        this.log('info', '');
        this.log('info', '╔══════════════════════════════════════════════════╗');
        this.log('info', '║       RETRYING FAILED CREATORS                   ║');
        this.log('info', '╚══════════════════════════════════════════════════╝');
        this.log('info', `Retrying ${this.failedCreators.length} failed creators...`);

        // Re-login and navigate back to campaign
        await this.ensureLoggedIn(imaiCredentials.email, imaiCredentials.password);
        await this.navigateToCampaign(client.imaiCampaignId);

        for (const username of [...this.failedCreators]) {
          if (this.isStopping) {
            this.log('warning', '🛑 Agent stopped by user during retry');
            break;
          }

          this.log('info', `🔄 Retry attempt: @${username}`);

          const retryResult = await this.addInfluencerWithAI(username, imaiCredentials, client.imaiCampaignId);

          if (retryResult.success) {
            // Update results
            results.failed--;
            results.added++;
            this.failedCreators = this.failedCreators.filter(u => u !== username);

            // Update details
            const existingIndex = results.details.findIndex(d => d.username === username && !d.success);
            if (existingIndex >= 0) {
              results.details[existingIndex] = retryResult;
            }

            // Emit progress
            this.emit('progress', {
              current: results.added + results.skipped + results.failed,
              total: creators.length,
              added: results.added,
              failed: results.failed,
              skipped: results.skipped,
              currentCreator: username,
              isRetry: true
            });
          }

          await this.page.waitForTimeout(30000);
        }
      }

      this.log('info', '');
      this.log('success', '╔══════════════════════════════════════════════════╗');
      this.log('success', '║       AGENT RUN COMPLETED                        ║');
      this.log('success', '╚══════════════════════════════════════════════════╝');
      this.log('info', `✅ Added: ${results.added}`);
      this.log('info', `⏭️ Skipped: ${results.skipped}`);
      this.log('info', `❌ Failed: ${results.failed}`);

    } catch (error) {
      this.log('error', 'Agent run failed', { error: error.message });
      throw error;
    } finally {
      this.isRunning = false;
      this.isStopping = false;
      await this.cleanup();
    }

    return results;
  }

  async cleanup() {
    this.log('info', 'Cleaning up browser session...');
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
      this.isLoggedIn = false;
      this.isRunning = false;
      this.isStopping = false;

      // Clear command queue state
      this.commandQueue = [];
      this.currentCredentials = null;
      this.currentCampaignId = null;
      this.skipCurrent = false;
      this.switchToIndex = null;

      this.log('success', 'Cleanup complete');
    } catch (error) {
      this.log('error', 'Cleanup error', { error: error.message });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isLoggedIn: this.isLoggedIn,
      hasBrowser: !!this.browser,
    };
  }
}

module.exports = ImaiAgentService;
