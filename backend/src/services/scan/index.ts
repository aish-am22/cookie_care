import puppeteer, {
  type Cookie as PuppeteerCookie,
  type Page,
  type Frame,
  type Browser,
  CDPSession,
} from 'puppeteer';
import {
  CookieCategory,
  type CookieInfo,
  type TrackerInfo,
  type ScanResultData,
  ComplianceStatus,
  GoogleConsentV2Status,
  ComplianceInfo,
  ThirdPartyDomainInfo,
  type LocalStorageItem,
  type LocalStorageInfo,
} from '../../../types.js';
import { findCookieInDatabase } from '../../../cookieDatabase.js';
import { ai, model, Type } from '../ai/index.js';

export const getHumanReadableExpiry = (puppeteerCookie: PuppeteerCookie): string => {
  if (puppeteerCookie.session || puppeteerCookie.expires === -1) return 'Session';
  const expiryDate = new Date(puppeteerCookie.expires * 1000);
  const now = new Date();
  const diffSeconds = (expiryDate.getTime() - now.getTime()) / 1000;
  if (diffSeconds < 0) return 'Expired';
  if (diffSeconds < 3600) return `${Math.round(diffSeconds / 60)} minutes`;
  if (diffSeconds < 86400) return `${Math.round(diffSeconds / 3600)} hours`;
  if (diffSeconds < 86400 * 30) return `${Math.round(diffSeconds / 86400)} days`;
  if (diffSeconds < 86400 * 365) return `${Math.round(diffSeconds / (86400 * 30))} months`;
  const years = parseFloat((diffSeconds / (86400 * 365)).toFixed(1));
  return `${years} year${years > 1 ? 's' : ''}`;
};

export async function findAndClickButton(frame: Frame, keywords: string[]): Promise<boolean> {
  for (const text of keywords) {
    try {
      const clicked = await frame.evaluate((t) => {
        const selectors = 'button, a, [role="button"], input[type="submit"], input[type="button"]';
        const elements = Array.from(document.querySelectorAll(selectors));
        const target = elements.find(el => {
          const elText = (el.textContent || el.getAttribute('aria-label') || (el as HTMLInputElement).value || '').trim().toLowerCase();
          return elText.includes(t);
        });
        if (target) {
          (target as HTMLElement).click();
          return true;
        }
        return false;
      }, text);
      if (clicked) {
        console.log(`[CONSENT] Clicked button containing: "${text}"`);
        try {
          await frame.page().waitForNetworkIdle({ timeout: 3000 });
        } catch (e) {
          console.log(`[CONSENT] Network did not become idle after action. Continuing.`);
        }
        return true;
      }
    } catch (error) {
      if (error instanceof Error && !frame.isDetached()) {
        if (error.message.includes('timeout')) {
          console.log(`[CONSENT] Timed out interacting with frame: ${frame.url()}. This is common for slow third-party widgets. Skipping.`);
        } else {
          console.warn(`[CONSENT] Warning on frame ${frame.url()}: ${error.message}`);
        }
      }
    }
  }
  return false;
}

export async function handleConsent(page: Page, action: 'accept' | 'reject'): Promise<boolean> {
  console.log(`[CONSENT] Attempting to ${action} consent...`);
  const acceptKeywords = ['accept all', 'allow all', 'agree to all', 'accept cookies', 'agree', 'accept', 'allow', 'i agree', 'ok', 'got it', 'continue', 'tout accepter'];
  const rejectKeywords = ['reject all', 'deny all', 'decline all', 'reject cookies', 'disagree', 'reject', 'deny', 'decline', 'necessary only', 'tout refuser'];

  const keywords = action === 'accept' ? acceptKeywords : rejectKeywords;

  const checkFrame = async (frame: Frame): Promise<boolean> => {
    if (await findAndClickButton(frame, keywords)) return true;
    for (const child of frame.childFrames()) {
      if (await checkFrame(child)) return true;
    }
    return false;
  };

  if (await checkFrame(page.mainFrame())) return true;

  console.log(`[CONSENT] No actionable button found for "${action}".`);
  return false;
}

// This function is executed in the browser context via page.evaluate()
export const browserSideComplianceCheck = async (): Promise<{ bannerDetected: boolean; policyDetected: boolean }> => {
  await new Promise(resolve => setTimeout(resolve, 3000));

  let bannerDetected = false;
  let policyDetected = false;

  const isElementVisible = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.offsetParent === null) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };

  const searchContext = (context: Document | ShadowRoot) => {
    if (bannerDetected && policyDetected) return;

    if (!bannerDetected) {
      const bannerKeywords = ['cookie', 'consent', 'privacy', 'accept', 'manage settings', 'we use cookies', 'personal data', 'gdpr', 'ccpa', 'lgpd', 'einwilligung', 'datenschutz', 'akzeptieren', 'zustimmen'];
      const bannerSelectors = ['[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]', '[id*="onetrust"]', '[id*="cmp"]', '[id*="privacy-banner"]', '[role="dialog"]', '[role="alertdialog"]', 'div[data-cy*="consent"]'];

      const potentialElements = Array.from(context.querySelectorAll('div, section, aside, footer, nav, form'));
      let bestCandidate: { el: HTMLElement; score: number } | null = null;

      for (const el of potentialElements) {
        if (!isElementVisible(el)) continue;

        let score = 0;
        const text = (el.textContent || (el as HTMLElement).innerText || '').toLowerCase();
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        if (bannerKeywords.some(kw => text.includes(kw))) score += 5;
        if (bannerSelectors.some(sel => el.matches(sel))) score += 5;
        if (style.position === 'fixed' || style.position === 'sticky') score += 4;
        if (parseInt(style.zIndex || '0', 10) > 99) score += 4;
        if (rect.top < 50 || rect.bottom > window.innerHeight - 50) score += 3;
        if (rect.width > window.innerWidth * 0.8) score += 2;
        if (rect.width < 100 || rect.height < 30) score -= 5;
        if ((el.tagName === 'HEADER' || el.tagName === 'FOOTER') && el.querySelector('nav, a')) {
          if (!bannerKeywords.some(kw => text.includes(kw))) score -= 3;
        }

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = { el, score };
        }
      }

      if (bestCandidate && bestCandidate.score >= 8) {
        const rect = bestCandidate.el.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 20 && rect.bottom > 0 && rect.top < window.innerHeight) {
          bannerDetected = true;
        }
      }
    }

    if (!policyDetected) {
      const policyKeywords = ['cookie policy', 'privacy policy', 'cookie statement', 'legal notice', 'data protection', 'imprint', 'privacy', 'legal', 'terms', 'impressum', 'politique de confidentialité', 'mentions légales', 'declaración de privacidad'];
      const policyUrlPaths = ['privacy', 'legal', 'terms', 'cookie-policy', 'data-protection'];

      const links = Array.from(context.querySelectorAll('a[href]'));
      for (const link of links) {
        if (!isElementVisible(link)) continue;

        const text = (link.textContent || '').toLowerCase().trim();
        const href = (link.getAttribute('href') || '').toLowerCase();

        if (policyKeywords.some(kw => text.includes(kw))) {
          policyDetected = true;
          break;
        }
        if (policyUrlPaths.some(path => href.includes(`/${path}`))) {
          policyDetected = true;
          break;
        }
      }
    }
  };

  const traverseDOM = (doc: Document | ShadowRoot) => {
    searchContext(doc);
    if (bannerDetected && policyDetected) return;

    const elementsWithShadowRoot = doc.querySelectorAll('*');
    for (const el of elementsWithShadowRoot) {
      if (el.shadowRoot) {
        traverseDOM(el.shadowRoot);
      }
    }
  };

  const traverseFrames = (currentWindow: Window) => {
    try {
      traverseDOM(currentWindow.document);
      if (bannerDetected && policyDetected) return;

      for (let i = 0; i < currentWindow.frames.length; i++) {
        traverseFrames(currentWindow.frames[i]);
      }
    } catch (e) {
      // Catches cross-origin frame errors, which is expected.
    }
  };

  if (window.top) {
    traverseFrames(window.top);
  }

  return { bannerDetected, policyDetected };
};

export const detectCMP = async (page: Page): Promise<string> => {
  try {
    const cmp = await page.evaluate(() => {
      if ((window as any).OneTrust) return 'OneTrust';
      if ((window as any).Cookiebot) return 'Cookiebot';
      if ((window as any).CookieYes) return 'CookieYes';
      if ((window as any).Osano) return 'Osano';
      if ((window as any).didomiOnReady) return 'Didomi';
      if (document.getElementById('CybotCookiebotDialog')) return 'Cookiebot';
      if (document.getElementById('onetrust-banner-sdk')) return 'OneTrust';
      if (document.querySelector('[class*="CookieConsent"]')) return 'CookieConsent';
      return 'Unknown';
    });
    return cmp;
  } catch (e) {
    console.warn('[CMP] Could not detect CMP:', e);
    return 'Unknown';
  }
};

export const getOneTrustClassifications = async (page: Page): Promise<Map<string, string>> => {
  const oneTrustMap = new Map<string, string>();
  try {
    const isOneTrust = await page.evaluate(() => !!(window as any).OneTrust);
    if (!isOneTrust) return oneTrustMap;

    const domainData = await page.evaluate(() => (window as any).OneTrust.GetDomainData());
    if (domainData && domainData.Groups) {
      for (const group of domainData.Groups) {
        if (group.Cookies && group.GroupName) {
          for (const cookie of group.Cookies) {
            if (cookie.Name) {
              oneTrustMap.set(cookie.Name, group.GroupName);
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[CMP] Failed to get OneTrust classifications:', e);
  }
  return oneTrustMap;
};

export const collectPageData = async (
  page: Page,
  rootHostname: string
): Promise<{ cookies: PuppeteerCookie[]; networkRequests: { hostname: string; url: string }[]; localStorageItems: LocalStorageItem[]; googleConsentV2: GoogleConsentV2Status }> => {
  let cdpSession: CDPSession | null = null;
  try {
    cdpSession = await page.target().createCDPSession();
    await cdpSession.send('Network.enable');
  } catch (e) {
    console.warn('[CDP] Could not create CDP session. Cookie collection may be incomplete.', e);
  }

  const networkRequests: { hostname: string; url: string }[] = [];
  const requestListener = (request: any) => {
    try {
      const reqUrl = new URL(request.url());
      if (reqUrl.hostname !== rootHostname && (reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:')) {
        networkRequests.push({ url: request.url(), hostname: reqUrl.hostname });
      }
    } catch (e) { /* ignore invalid urls */ }
  };
  page.on('request', requestListener);

  await page.reload({ waitUntil: 'networkidle2' });

  try {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForNetworkIdle({ timeout: 2000 });
    await page.evaluate(() => window.scrollTo(0, 0));
  } catch (e) {
    console.log(`[CRAWL] Could not scroll or wait for idle on ${page.url()}`);
  }

  console.log(`[SCANNER] Soaking page for 4 seconds to catch delayed trackers...`);
  await new Promise(resolve => setTimeout(resolve, 4000));

  let cookies: PuppeteerCookie[] = [];
  if (cdpSession) {
    try {
      const { cookies: cdpCookies } = await cdpSession.send('Network.getAllCookies');
      cookies = cdpCookies as unknown as PuppeteerCookie[];
    } catch (e) {
      console.error('[CDP] Error getting cookies via CDP, falling back to page.cookies()', e);
      cookies = await page.cookies();
    } finally {
      await cdpSession.detach();
    }
  } else {
    cookies = await page.cookies();
  }

  const { localStorageItems, googleConsentV2 } = await page.evaluate(() => {
    const items: LocalStorageItem[] = [];
    let gcmStatus: GoogleConsentV2Status = { detected: false, status: 'Not Detected' };

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          items.push({ origin: window.location.origin, key, value: localStorage.getItem(key) || '', pageUrl: window.location.href });
        }
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          items.push({ origin: window.location.origin, key, value: sessionStorage.getItem(key) || '', pageUrl: window.location.href });
        }
      }
    } catch (e) {
      console.warn('Could not access storage on page.');
    }

    try {
      const gcs = (window as any).google_tag_data?.ics?.entries;
      if (gcs && typeof gcs === 'object' && Object.keys(gcs).length > 0) {
        gcmStatus.detected = true;
        const firstStateKey = Object.keys(gcs)[0];
        const state = gcs[firstStateKey];
        if (state && typeof state === 'object') {
          gcmStatus.status = Object.entries(state)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
        } else {
          gcmStatus.status = 'Detected, but state format is unexpected.';
        }
      }
    } catch (e) {
      // proceed to fallback
    }

    if (!gcmStatus.detected) {
      const dataLayer = (window as any).dataLayer || (window as any).google_tag_manager?.dataLayer;
      if (Array.isArray(dataLayer)) {
        try {
          const consentDefault = dataLayer.filter((i: any) =>
            Array.isArray(i) && i.length > 2 && i[0] === 'consent' && i[1] === 'default'
          ).pop();

          if (consentDefault && typeof consentDefault[2] === 'object') {
            gcmStatus.detected = true;
            const consentState = consentDefault[2];
            gcmStatus.status = Object.keys(consentState)
              .map(k => `${k}: ${consentState[k]}`)
              .join('; ');
          }
        } catch (e) {
          console.warn('Could not parse GCM status from dataLayer.');
        }
      }
    }

    return { localStorageItems: items, googleConsentV2: gcmStatus };
  });

  page.off('request', requestListener);
  return { cookies, networkRequests, localStorageItems, googleConsentV2 };
};

export const parseSitemap = async (sitemapUrl: string): Promise<string[]> => {
  try {
    const response = await fetch(sitemapUrl, { headers: { 'User-Agent': 'CookieCare-Bot/1.0' } });
    if (!response.ok) return [];
    const sitemapText = await response.text();

    const urlRegex = /<loc>(.*?)<\/loc>/g;
    let match;
    const urls = [];
    while ((match = urlRegex.exec(sitemapText)) !== null) {
      urls.push(match[1]);
    }

    if (sitemapText.includes('<sitemapindex')) {
      const nestedSitemaps = urls;
      const allUrls: string[] = [];
      await Promise.all(nestedSitemaps.map(async (nestedUrl) => {
        const nestedUrls = await parseSitemap(nestedUrl);
        allUrls.push(...nestedUrls);
      }));
      return allUrls;
    }

    return urls;
  } catch (error) {
    console.warn(`[SITEMAP] Failed to parse sitemap at ${sitemapUrl}:`, error);
    return [];
  }
};

export const discoverSitemapUrls = async (rootUrl: URL): Promise<string[]> => {
  const sitemapLocations = new Set<string>();
  try {
    const robotsUrl = new URL('/robots.txt', rootUrl);
    const robotsResponse = await fetch(robotsUrl.toString(), { headers: { 'User-Agent': 'CookieCare-Bot/1.0' } });
    if (robotsResponse.ok) {
      const robotsText = await robotsResponse.text();
      const sitemapRegex = /^Sitemap:\s*(.*)$/gim;
      let match;
      while ((match = sitemapRegex.exec(robotsText)) !== null) {
        sitemapLocations.add(match[1].trim());
      }
    }
  } catch (e) {
    console.warn('[SITEMAP] Could not fetch or parse robots.txt');
  }

  if (sitemapLocations.size === 0) {
    sitemapLocations.add(new URL('/sitemap.xml', rootUrl).toString());
  }

  const allPageUrls = new Set<string>();
  for (const sitemapUrl of sitemapLocations) {
    const pageUrls = await parseSitemap(sitemapUrl);
    pageUrls.forEach(url => allPageUrls.add(url));
  }

  return Array.from(allPageUrls);
};

export const analyzeBatch = async (batch: any[], batchNum: number, maxRetries = 3): Promise<any[]> => {
  const keyMap = new Map<string, string>();
  const itemsForBatchAnalysis = batch.map((item, index) => {
    const shortKey = `${item.type}-${batchNum}-${index}`;
    if (item.type === 'cookie') {
      const { name, domain, path } = item.data.data;
      keyMap.set(shortKey, `${name}|${domain}|${path}`);
      return { type: 'cookie', key: shortKey, name: name, provider: domain, states: Array.from(item.data.states) };
    }
    if (item.type === 'network_request') {
      keyMap.set(shortKey, item.data.data.url);
      return { type: 'network_request', key: shortKey, provider: item.data.data.hostname, states: Array.from(item.data.states) };
    }
    if (item.type === 'storage') {
      const { origin, key } = item.data.data;
      keyMap.set(shortKey, `${origin}|${key}`);
      return { type: 'storage', key: shortKey, name: key, provider: origin, states: Array.from(item.data.states) };
    }
    if (item.type === 'third_party_domain') {
      const { hostname } = item.data.data;
      keyMap.set(shortKey, hostname);
      return { type: 'third_party_domain', key: shortKey, provider: hostname, states: Array.from(item.data.states) };
    }
  });

  const batchPrompt = `You are an automated, rule-based web technology categorization engine. Your task is to process a batch of items and return a JSON array. Follow these rules with absolute precision. DO NOT deviate or use creative interpretation.

For each item in the input, produce a JSON object with the following fields:

1.  **key**: (String) The original key provided in the input.

2.  **isTracker**: (Boolean, for 'network_request' type ONLY)
    *   **Rule:** Set to \`true\` if the request's provider domain is primarily associated with advertising, analytics, or user behavior tracking (e.g., google-analytics.com, doubleclick.net, facebook.net, clarity.ms).
    *   **Rule:** Set to \`false\` if the provider is for content delivery (CDN like cdnjs.cloudflare.com, fonts.googleapis.com), essential site APIs, or user-facing widgets (e.g., intercom.io).
    *   **Default:** For 'cookie', 'storage', and 'third_party_domain' types, this field MUST be \`false\`.

3.  **category**: (String, ONE of: 'Necessary', 'Functional', 'Analytics', 'Marketing', 'Unknown')
    *   **Step A: Check for Necessary items (Highest Priority).**
        *   If the item's name or provider relates to a Consent Management Platform (e.g., 'OptanonConsent', 'CookieConsent', 'cookielawinfo'), the category is ALWAYS **'Necessary'**.
        *   If the item's name suggests essential security (e.g., 'csrf_token', 'session_id') or load balancing, the category is **'Necessary'**.
    *   **Step B: Use \`isTracker\` for network requests.**
        *   If \`type\` is 'network_request' and \`isTracker\` is \`true\`, the category MUST be **'Analytics'** or **'Marketing'**. Decide based on the provider (e.g., 'google-analytics.com' is Analytics, 'doubleclick.net' is Marketing).
        *   If \`type\` is 'network_request' and \`isTracker\` is \`false\`, the category MUST be **'Functional'** or **'Necessary'**.
    *   **Step C: Infer from Provider for Cookies/Storage/Domains.**
        *   For providers like 'google-analytics.com', '_ga', 'matomo', 'hotjar', 'clarity.ms', the category is **'Analytics'**.
        *   For providers like 'doubleclick.net', 'facebook.com', '_fbp', 'hubspot', the category is **'Marketing'**.
        *   For providers of user-facing features like 'intercom', 'zendesk', or for remembering user choices like language ('lang'), the category is **'Functional'**.
    *   **Default:** Use 'Unknown' ONLY if no other rule applies.

4.  **purpose**: (String)
    *   **Rule:** A brief, 15-word max description of the item's function.
    *   **Rule:** For 'network_request' and 'third_party_domain' types, return an empty string.

5.  **complianceStatus**: (String, ONE of: 'Compliant', 'Pre-Consent Potential Issue', 'Post-Rejection Potential Issue')
    *   **Rule 1:** If \`category\` is **'Necessary'**, \`complianceStatus\` is ALWAYS **'Compliant'**.
    *   **Rule 2:** If \`category\` is NOT **'Necessary'** AND the \`states\` array contains **'pre-consent'**, \`complianceStatus\` is **'Pre-Consent Potential Issue'**.
    *   **Rule 3:** If \`category\` is NOT **'Necessary'** AND the \`states\` array contains **'post-rejection'**, \`complianceStatus\` is **'Post-Rejection Potential Issue'**.
    *   **Rule 4:** In all other cases, \`complianceStatus\` is **'Compliant'**.

6.  **remediation**: (String)
    *   **Rule:** If \`complianceStatus\` is **'Compliant'**, return "No action needed.".
    *   **Rule:** For **'Pre-Consent Potential Issue'**, return "This [category] item was detected before user consent was given. Configure your consent management platform to block this script/cookie until the user explicitly opts in.".
    *   **Rule:** For **'Post-Rejection Potential Issue'**, return "This [category] item was detected after the user rejected consent. This technology should not be loaded when consent is denied. Check your tag manager triggers and script configurations.".

Input Data:
${JSON.stringify(itemsForBatchAnalysis, null, 2)}

Return ONLY the valid JSON array of results.`;

  const batchResponseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING },
        isTracker: { type: Type.BOOLEAN },
        category: { type: Type.STRING },
        purpose: { type: Type.STRING },
        complianceStatus: { type: Type.STRING },
        remediation: { type: Type.STRING },
      },
      required: ['key', 'isTracker', 'category', 'purpose', 'complianceStatus', 'remediation'],
    },
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model,
        contents: batchPrompt,
        config: { responseMimeType: 'application/json', responseSchema: batchResponseSchema },
      });

      if (result.promptFeedback?.blockReason) {
        const blockReason = result.promptFeedback.blockReason;
        const blockMessage = result.promptFeedback.blockReasonMessage || 'No additional message.';
        console.error(`[AI] Batch ${batchNum + 1} was blocked. Reason: ${blockReason}. Message: ${blockMessage}`);
        throw new Error(`AI content generation was blocked due to safety settings (Reason: ${blockReason}).`);
      }

      const resultText = result.text;
      if (!resultText) {
        throw new Error(`Gemini API returned an empty text response for analysis batch #${batchNum + 1}.`);
      }

      let cleanedJsonString = resultText.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, '$1');
      const firstBracket = cleanedJsonString.indexOf('[');
      const lastBracket = cleanedJsonString.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        cleanedJsonString = cleanedJsonString.substring(firstBracket, lastBracket + 1);
      }

      try {
        const analysisResults = JSON.parse(cleanedJsonString);
        return analysisResults.map((res: any) => {
          if (keyMap.has(res.key)) {
            return { ...res, key: keyMap.get(res.key) };
          }
          console.warn(`[AI] Could not map back key: ${res.key}`);
          return res;
        });
      } catch (jsonError) {
        console.error(`[AI] Failed to parse JSON on batch ${batchNum + 1}. Content received:`, cleanedJsonString);
        throw new Error(`Invalid JSON response from AI on batch ${batchNum + 1}.`);
      }
    } catch (error) {
      console.warn(`[AI] Attempt ${attempt + 1}/${maxRetries + 1} failed for batch ${batchNum + 1}.`, error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.message.includes('blocked due to safety settings')) {
        throw error;
      }
      if (attempt === maxRetries) {
        console.error(`[AI] Batch ${batchNum + 1} failed after ${maxRetries + 1} attempts.`);
        throw error;
      }
      await new Promise(res => setTimeout(res, Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000));
    }
  }
  throw new Error(`Exhausted all retries for batch ${batchNum + 1}`);
};

export interface ScanOptions {
  url: string;
  depth: 'lite' | 'medium' | 'deep' | 'enterprise';
  sendEvent: (data: object) => void;
}

export const performScan = async ({ url, depth, sendEvent }: ScanOptions): Promise<void> => {
  let browser: Browser | null = null;
  try {
    const depthLimits = { lite: 10, medium: 50, deep: 100, enterprise: 500 };
    const maxPages = depthLimits[depth];
    sendEvent({ type: 'log', message: `Scan initiated for ${url} (Depth: ${depth}, up to ${maxPages} pages)` });

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] });

    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/536');
    await page.setViewport({ width: 1920, height: 1080 });

    const urlsToVisit: { url: string; priority: number }[] = [{ url: url, priority: 0 }];
    const visitedUrls = new Set<string>();
    const allCookieMap = new Map<string, any>();
    const allNetworkRequestMap = new Map<string, any>();
    const allLocalStorageMap = new Map<string, any>();
    const rootUrl = new URL(url);
    const domainParts = rootUrl.hostname.split('.');
    const mainDomain = domainParts.slice(Math.max(domainParts.length - 2, 0)).join('.');

    let screenshotBase64 = '';
    let consentBannerFound = false;
    let cookiePolicyDetected = false;
    let googleConsentV2Status: GoogleConsentV2Status = { detected: false, status: 'Not checked' };
    let cmpProvider = 'Unknown';
    let oneTrustClassifications = new Map<string, string>();

    const visitedBuckets = new Map<string, number>();
    const bucketLimit = Math.max(2, Math.ceil(maxPages / 25));

    sendEvent({ type: 'log', message: 'Searching for sitemap for comprehensive crawling...' });
    try {
      const sitemapPageUrls = await discoverSitemapUrls(rootUrl);
      if (sitemapPageUrls.length > 0) {
        sendEvent({ type: 'log', message: `Found sitemap! Added ${sitemapPageUrls.length} URLs to the crawl queue.` });
        sitemapPageUrls.forEach(pageUrl => {
          if (!urlsToVisit.some(item => item.url === pageUrl)) {
            urlsToVisit.push({ url: pageUrl, priority: 0 });
          }
        });
      } else {
        sendEvent({ type: 'log', message: 'No sitemap found. Proceeding with standard link-following crawl.' });
      }
    } catch (error) {
      console.warn('[SITEMAP] Error during sitemap discovery:', error);
      sendEvent({ type: 'log', message: 'Could not process sitemap. Proceeding with standard crawl.' });
    }

    const processItems = (map: Map<string, any>, items: any[], state: string, isCookie: boolean, pageUrl: string) => {
      items.forEach((item: any) => {
        const key = isCookie ? `${item.name}|${item.domain}|${item.path}` : item.url;
        if (!map.has(key)) {
          map.set(key, { states: new Set(), data: item, pageUrls: new Set() });
        }
        map.get(key).states.add(state);
        map.get(key).pageUrls.add(pageUrl);
      });
    };

    const processLocalStorage = (items: LocalStorageItem[], state: string, pageUrl: string) => {
      items.forEach(item => {
        const key = `${item.origin}|${item.key}`;
        if (!allLocalStorageMap.has(key)) {
          allLocalStorageMap.set(key, { states: new Set(), data: item, pageUrls: new Set() });
        }
        allLocalStorageMap.get(key).states.add(state);
        allLocalStorageMap.get(key).pageUrls.add(pageUrl);
      });
    };

    while (urlsToVisit.length > 0 && visitedUrls.size < maxPages) {
      urlsToVisit.sort((a, b) => a.priority - b.priority);
      const currentItem = urlsToVisit.shift();
      if (!currentItem || visitedUrls.has(currentItem.url)) {
        continue;
      }

      const currentUrl = currentItem.url;
      let bucket = '/';

      try {
        const pageUrl = new URL(currentUrl);
        if (!pageUrl.hostname.endsWith(mainDomain)) {
          continue;
        }

        const pathSegments = pageUrl.pathname.split('/').filter(Boolean);
        bucket = pathSegments.length > 0 ? `/${pathSegments[0]}` : '/';
        const bucketCount = visitedBuckets.get(bucket) || 0;

        if (bucketCount >= bucketLimit) {
          sendEvent({ type: 'log', message: `Skipping URL from full section '${bucket}': ${currentUrl}` });
          continue;
        }
      } catch (e) {
        console.warn(`[CRAWL] Invalid URL skipped: ${currentUrl}`);
        continue;
      }

      sendEvent({ type: 'log', message: `[${visitedUrls.size + 1}/${maxPages}] Scanning: ${currentUrl}` });

      try {
        await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        visitedUrls.add(currentUrl);
        visitedBuckets.set(bucket, (visitedBuckets.get(bucket) || 0) + 1);

        if (visitedUrls.size === 1) {
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 7000 }).catch(() => console.log('[SCAN] Network did not idle on entry page, proceeding.'));

          const checksResult = await page.evaluate(browserSideComplianceCheck);
          consentBannerFound = checksResult.bannerDetected;
          cookiePolicyDetected = checksResult.policyDetected;

          sendEvent({ type: 'log', message: consentBannerFound ? `Consent banner detected.` : `Warning: Consent banner not detected.` });
          if (cookiePolicyDetected) {
            sendEvent({ type: 'log', message: `Cookie/Privacy Policy link found on ${currentUrl}` });
          }

          cmpProvider = await detectCMP(page);
          sendEvent({ type: 'log', message: `Detected Consent Management Platform: ${cmpProvider}` });
          if (cmpProvider === 'OneTrust') {
            sendEvent({ type: 'log', message: `Attempting to extract OneTrust classifications...` });
            oneTrustClassifications = await getOneTrustClassifications(page);
          }

          sendEvent({ type: 'log', message: 'Performing 3-stage consent analysis on entry page...' });
          screenshotBase64 = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 70 });

          const { cookies: preConsentCookies, networkRequests: preConsentRequests, localStorageItems: preConsentStorage, googleConsentV2: gcmPre } = await collectPageData(page, rootUrl.hostname);
          processItems(allCookieMap, preConsentCookies, 'pre-consent', true, currentUrl);
          processItems(allNetworkRequestMap, preConsentRequests, 'pre-consent', false, currentUrl);
          processLocalStorage(preConsentStorage, 'pre-consent', currentUrl);
          if (gcmPre.detected) googleConsentV2Status = gcmPre;

          await handleConsent(page, 'reject');
          const { cookies: postRejectCookies, networkRequests: postRejectRequests, localStorageItems: postRejectStorage, googleConsentV2: gcmPostReject } = await collectPageData(page, rootUrl.hostname);
          processItems(allCookieMap, postRejectCookies, 'post-rejection', true, currentUrl);
          processItems(allNetworkRequestMap, postRejectRequests, 'post-rejection', false, currentUrl);
          processLocalStorage(postRejectStorage, 'post-rejection', currentUrl);
          if (!googleConsentV2Status.detected && gcmPostReject.detected) googleConsentV2Status = gcmPostReject;

          await page.reload({ waitUntil: 'networkidle2' });
          await handleConsent(page, 'accept');
          const { cookies: postAcceptCookies, networkRequests: postAcceptRequests, localStorageItems: postAcceptStorage, googleConsentV2: gcmPostAccept } = await collectPageData(page, rootUrl.hostname);
          processItems(allCookieMap, postAcceptCookies, 'post-acceptance', true, currentUrl);
          processItems(allNetworkRequestMap, postAcceptRequests, 'post-acceptance', false, currentUrl);
          processLocalStorage(postAcceptStorage, 'post-acceptance', currentUrl);
          if (!googleConsentV2Status.detected && gcmPostAccept.detected) googleConsentV2Status = gcmPostAccept;
        } else {
          if (!cookiePolicyDetected) {
            const policyCheckResult = await page.evaluate(browserSideComplianceCheck);
            if (policyCheckResult.policyDetected) {
              cookiePolicyDetected = true;
              sendEvent({ type: 'log', message: `Cookie/Privacy Policy link found on ${currentUrl}` });
            }
          }
          const { cookies, networkRequests, localStorageItems, googleConsentV2 } = await collectPageData(page, rootUrl.hostname);
          processItems(allCookieMap, cookies, 'post-acceptance', true, currentUrl);
          processItems(allNetworkRequestMap, networkRequests, 'post-acceptance', false, currentUrl);
          processLocalStorage(localStorageItems, 'post-acceptance', currentUrl);
          if (!googleConsentV2Status.detected && googleConsentV2.detected) googleConsentV2Status = googleConsentV2;
        }

        const internalLinks: { href: string; text: string }[] = await page.evaluate((domain) => {
          const links = new Map<string, string>();
          document.querySelectorAll('a[href]').forEach(el => {
            const anchor = el as HTMLAnchorElement;
            try {
              const linkUrl = new URL(anchor.href, document.baseURI);
              if (linkUrl.hostname.endsWith(domain)) {
                const href = linkUrl.href.split('#')[0].split('?')[0];
                if (!links.has(href)) {
                  links.set(href, (anchor.textContent || '').trim().toLowerCase());
                }
              }
            } catch (e) { /* ignore invalid URLs */ }
          });
          return Array.from(links.entries()).map(([href, text]) => ({ href, text }));
        }, mainDomain);

        internalLinks.sort((a, b) => a.href.localeCompare(b.href));

        const priorityKeywords = [
          'privacy', 'policy', 'terms', 'conditions', 'cookie',
          'contact', 'about', 'legal', 'login', 'signin', 'signup',
          'pricing', 'dpa', 'data-processing', 'security', 'disclaimer',
          'imprint', 'impressum', 'user-agreement', 'terms-of-service', 'terms-of-use',
        ];
        internalLinks.forEach(link => {
          if (!visitedUrls.has(link.href) && !urlsToVisit.some(item => item.url === link.href)) {
            const linkTextAndHref = `${link.text} ${link.href}`.toLowerCase();
            const priority = priorityKeywords.some(keyword => linkTextAndHref.includes(keyword)) ? 1 : 2;
            urlsToVisit.push({ url: link.href, priority });
          }
        });
      } catch (pageError) {
        const message = pageError instanceof Error ? pageError.message : String(pageError);
        sendEvent({ type: 'log', message: `Warning: Failed to load ${currentUrl}. ${message.substring(0, 100)}` });
      }
    }

    sendEvent({ type: 'log', message: `Crawl complete. Found ${allCookieMap.size} unique cookies, ${allNetworkRequestMap.size} unique third-party requests, and ${allLocalStorageMap.size} storage items.` });
    sendEvent({ type: 'log', message: `Submitting all findings to AI for analysis... (This may take a moment)` });

    const allDomainsMap = new Map<string, { states: Set<string>; pageUrls: Set<string> }>();
    allNetworkRequestMap.forEach(req => {
      const hostname = req.data.hostname;
      if (!allDomainsMap.has(hostname)) {
        allDomainsMap.set(hostname, { states: new Set(), pageUrls: new Set() });
      }
      const domainData = allDomainsMap.get(hostname)!;
      req.states.forEach((s: string) => domainData.states.add(s));
      req.pageUrls.forEach((p: string) => domainData.pageUrls.add(p));
    });

    const allItemsToAnalyze = [
      ...Array.from(allCookieMap.values()).map(value => ({ type: 'cookie', data: value })),
      ...Array.from(allNetworkRequestMap.values()).map(value => ({ type: 'network_request', data: value })),
      ...Array.from(allLocalStorageMap.values()).map(value => ({ type: 'storage', data: value })),
      ...Array.from(allDomainsMap.entries()).map(([hostname, data]) => ({ type: 'third_party_domain', data: { data: { hostname }, ...data } })),
    ];

    if (allItemsToAnalyze.length === 0) {
      sendEvent({
        type: 'result',
        payload: {
          uniqueCookies: [], uniqueTrackers: [], uniqueLocalStorage: [], thirdPartyDomains: [],
          pages: Array.from(visitedUrls).map(u => ({ url: u })), screenshotBase64,
          consentBannerDetected: consentBannerFound,
          cookiePolicyDetected,
          pagesScannedCount: visitedUrls.size,
          googleConsentV2: googleConsentV2Status,
          cmpProvider,
          compliance: {
            gdpr: { riskLevel: 'Low', assessment: 'No cookies or trackers were detected.' },
            ccpa: { riskLevel: 'Low', assessment: 'No cookies or trackers were detected.' },
          },
        },
      });
      return;
    }

    const BATCH_SIZE = 25;
    const batches = [];
    for (let i = 0; i < allItemsToAnalyze.length; i += BATCH_SIZE) {
      batches.push(allItemsToAnalyze.slice(i, i + BATCH_SIZE));
    }

    const aggregatedAnalysis: any[] = [];
    for (const [index, batch] of batches.entries()) {
      sendEvent({ type: 'log', message: `Analyzing batch ${index + 1}/${batches.length}...` });
      const batchAnalysis = await analyzeBatch(batch, index);
      aggregatedAnalysis.push(...batchAnalysis);
    }

    sendEvent({ type: 'log', message: 'Finalizing compliance assessment...' });
    const potentialIssuesSummary = {
      preConsentPotentialIssues: aggregatedAnalysis.filter(a => a.complianceStatus === 'Pre-Consent Potential Issue').length,
      postRejectionPotentialIssues: aggregatedAnalysis.filter(a => a.complianceStatus === 'Post-Rejection Potential Issue').length,
    };
    const compliancePrompt = `You are a privacy expert providing a risk assessment. Based on this summary, provide a JSON object with "gdpr" and "ccpa" keys.
Summary: ${JSON.stringify(potentialIssuesSummary, null, 2)}
For both GDPR and CCPA, provide:
- riskLevel: 'Low', 'Medium', 'High', or 'Critical'. Any potential issue makes the risk at least 'High'. Multiple issues across types could make it 'Critical'.
- assessment: A brief summary explaining the risk level. Mention the number of potential issues.
Return ONLY the valid JSON object.`;
    const complianceSchema = {
      type: Type.OBJECT,
      properties: {
        gdpr: { type: Type.OBJECT, properties: { riskLevel: { type: Type.STRING }, assessment: { type: Type.STRING } } },
        ccpa: { type: Type.OBJECT, properties: { riskLevel: { type: Type.STRING }, assessment: { type: Type.STRING } } },
      },
      required: ['gdpr', 'ccpa'],
    };
    const complianceResult = await ai.models.generateContent({
      model,
      contents: compliancePrompt,
      config: { responseMimeType: 'application/json', responseSchema: complianceSchema },
    });

    const complianceResultText = complianceResult.text;
    if (!complianceResultText) {
      throw new Error('Gemini API returned an empty response for the final compliance analysis.');
    }
    const complianceAnalysis = JSON.parse(complianceResultText);

    const analysisMap = new Map(aggregatedAnalysis.map((item: any) => [item.key, item]));
    const scannedUrlHostname = new URL(url).hostname;

    const uniqueCookies: CookieInfo[] = Array.from(allCookieMap.values()).map(c => {
      const key = `${c.data.name}|${c.data.domain}|${c.data.path}`;
      const analyzed = analysisMap.get(key);
      const databaseEntry = findCookieInDatabase(c.data.name);
      const oneTrustCat = oneTrustClassifications.get(c.data.name);
      const domain = c.data.domain.startsWith('.') ? c.data.domain : `.${c.data.domain}`;
      const rootDomain = `.${scannedUrlHostname.replace(/^www\./, '')}`;

      const aiCategory = analyzed?.category || CookieCategory.UNKNOWN;
      const dbCategory = databaseEntry?.category;
      const otCategory = oneTrustCat;

      const isConsideredNecessary =
        (aiCategory === CookieCategory.NECESSARY || aiCategory === CookieCategory.UNKNOWN) &&
        (!dbCategory || dbCategory.toLowerCase() === 'necessary' || dbCategory.toLowerCase() === 'functional') &&
        (!otCategory || otCategory.toLowerCase().includes('necessary') || otCategory.toLowerCase().includes('strictly') || otCategory.toLowerCase().includes('essential'));

      let finalComplianceStatus: ComplianceStatus = ComplianceStatus.COMPLIANT;
      if (!isConsideredNecessary) {
        if (c.states.has('pre-consent')) {
          finalComplianceStatus = ComplianceStatus.PRE_CONSENT_POTENTIAL_ISSUE;
        } else if (c.states.has('post-rejection')) {
          finalComplianceStatus = ComplianceStatus.POST_REJECTION_POTENTIAL_ISSUE;
        }
      }

      const originalRemediation = analyzed?.remediation || 'Analysis incomplete.';
      let finalRemediation = originalRemediation;
      if (finalComplianceStatus === ComplianceStatus.PRE_CONSENT_POTENTIAL_ISSUE) {
        finalRemediation = `This ${aiCategory} item was detected before user consent was given. Configure your consent management platform to block this script/cookie until the user explicitly opts in.`;
      } else if (finalComplianceStatus === ComplianceStatus.POST_REJECTION_POTENTIAL_ISSUE) {
        finalRemediation = `This ${aiCategory} item was detected after the user rejected consent. This technology should not be loaded when consent is denied. Check your tag manager triggers and script configurations.`;
      } else if (finalComplianceStatus === ComplianceStatus.COMPLIANT) {
        finalRemediation = 'No action needed.';
      }

      return {
        key, name: c.data.name, provider: c.data.domain, expiry: getHumanReadableExpiry(c.data),
        party: domain.endsWith(rootDomain) ? 'First' : 'Third',
        isHttpOnly: c.data.httpOnly, isSecure: c.data.secure,
        complianceStatus: finalComplianceStatus,
        category: aiCategory,
        purpose: analyzed?.purpose || 'No purpose determined.',
        remediation: finalRemediation,
        pagesFound: Array.from(c.pageUrls),
        databaseClassification: dbCategory || undefined,
        oneTrustClassification: otCategory || undefined,
      };
    });

    const oneTrustDomainMap = new Map<string, string>();
    uniqueCookies.forEach(cookie => {
      if (cookie.oneTrustClassification && cookie.provider) {
        const domain = cookie.provider.replace(/^\./, '');
        if (!oneTrustDomainMap.has(domain)) {
          oneTrustDomainMap.set(domain, cookie.oneTrustClassification);
        }
      }
    });

    const getOtClassificationForHost = (hostname: string): string | undefined => {
      const parts = hostname.split('.');
      for (let i = 0; i < parts.length - 1; i++) {
        const domain = parts.slice(i).join('.');
        if (oneTrustDomainMap.has(domain)) {
          return oneTrustDomainMap.get(domain);
        }
      }
      return undefined;
    };

    const analyzedTrackersWithInfo: TrackerInfo[] = [];
    Array.from(allNetworkRequestMap.values()).forEach(req => {
      const key = req.data.url;
      const analyzed = analysisMap.get(key);
      if (analyzed && analyzed.isTracker) {
        const trackerHostname = req.data.hostname;
        const relatedCookie = uniqueCookies.find(c => {
          const cookieProvider = c.provider.startsWith('.') ? c.provider.substring(1) : c.provider;
          return trackerHostname === cookieProvider || trackerHostname.endsWith(`.${cookieProvider}`);
        });

        analyzedTrackersWithInfo.push({
          key,
          hostname: trackerHostname,
          complianceStatus: (analyzed.complianceStatus as ComplianceStatus) || ComplianceStatus.UNKNOWN,
          category: analyzed.category || CookieCategory.UNKNOWN,
          remediation: analyzed.remediation || 'Analysis incomplete.',
          pagesFound: Array.from(req.pageUrls),
          databaseClassification: relatedCookie?.databaseClassification,
          oneTrustClassification: getOtClassificationForHost(trackerHostname) || relatedCookie?.oneTrustClassification,
        });
      }
    });

    const uniqueTrackers: TrackerInfo[] = analyzedTrackersWithInfo;

    const uniqueLocalStorage: LocalStorageInfo[] = Array.from(allLocalStorageMap.values()).map(s => {
      const key = `${s.data.origin}|${s.data.key}`;
      const analyzed = analysisMap.get(key);
      const originUrl = new URL(s.data.origin);
      return {
        key,
        origin: s.data.origin,
        storageKey: s.data.key,
        complianceStatus: analyzed?.complianceStatus || ComplianceStatus.UNKNOWN,
        category: analyzed?.category || CookieCategory.UNKNOWN,
        remediation: analyzed?.remediation || 'Analysis incomplete.',
        purpose: analyzed?.purpose || 'No purpose determined.',
        pagesFound: Array.from(s.pageUrls),
        oneTrustClassification: getOtClassificationForHost(originUrl.hostname),
      };
    });

    const thirdPartyDomains: ThirdPartyDomainInfo[] = Array.from(allDomainsMap.entries()).map(([hostname, data]) => {
      const analyzed = analysisMap.get(hostname);
      return {
        hostname,
        count: data.pageUrls.size,
        pagesFound: Array.from(data.pageUrls),
        category: analyzed?.category || CookieCategory.UNKNOWN,
        complianceStatus: analyzed?.complianceStatus || ComplianceStatus.UNKNOWN,
        remediation: analyzed?.remediation || 'Analysis incomplete.',
        oneTrustClassification: getOtClassificationForHost(hostname),
      };
    });

    sendEvent({
      type: 'result',
      payload: {
        uniqueCookies,
        uniqueTrackers,
        uniqueLocalStorage,
        thirdPartyDomains,
        pages: Array.from(visitedUrls).map(u => ({ url: u })),
        compliance: complianceAnalysis,
        screenshotBase64,
        consentBannerDetected: consentBannerFound,
        cookiePolicyDetected,
        pagesScannedCount: visitedUrls.size,
        googleConsentV2: googleConsentV2Status,
        cmpProvider,
      },
    });
  } finally {
    if (browser) await browser.close();
  }
};
