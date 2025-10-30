

// FIX: Resolved all Express type errors by switching to a single default import for 'express' and using 'express.Request' and 'express.Response' for type annotations. This ensures types are correctly resolved from the express namespace, avoiding potential global type conflicts.
import express from 'express';
import mammoth from 'mammoth';
import { jsPDF } from 'jspdf';
import puppeteer, { type Cookie as PuppeteerCookie, type Page, type Frame, type Browser, CDPSession } from 'puppeteer';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import nodemailer from 'nodemailer';
import { Buffer } from 'buffer';
import { 
    CookieCategory, type CookieInfo, type TrackerInfo, type ScanResultData, ComplianceStatus, 
    type LegalAnalysisResult, type LegalPerspective, type VulnerabilityScanResult, 
    type VulnerabilityCategory, type GeneratedContract, ContractTemplate, type NetworkRequestItem, type LocalStorageItem,
    type LocalStorageInfo,
    GoogleConsentV2Status,
    ComplianceInfo,
    ThirdPartyDomainInfo
} from './types.js';
import { findCookieInDatabase } from './cookieDatabase.js';

dotenv.config();

const app = express();
const port = 3001;

app.use(cors());
// FIX: Increase request body limit to 50mb to handle large base64 PDF payloads for email reports. This has been implemented.
app.use(express.json({ limit: '50mb' }));

if (!process.env.API_KEY) {
  console.error("FATAL ERROR: API_KEY environment variable is not set.");
  (process as any).exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash";

// --- AI Rate Limiting Queue ---
// This queue ensures that we stay within the API's rate limits (e.g., 10 requests per minute on the free tier)
// by processing AI calls one by one with a minimum delay between them.
class AiCallQueue {
    private queue: { task: () => Promise<any>; resolve: (value: any) => void; reject: (reason?: any) => void; }[] = [];
    private isProcessing = false;
    // Free tier limit is 10 RPM. 60s / 10 = 6s per request. Add a 100ms buffer.
    private readonly minInterval: number = 6100; 

    add<T>(task: () => Promise<T>): Promise<T> {
        console.log(`[AI_QUEUE] Task added. Queue size: ${this.queue.length + 1}`);
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    private async processQueue() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            console.log('[AI_QUEUE] Queue empty. Worker is idle.');
            return;
        }

        this.isProcessing = true;
        const { task, resolve, reject } = this.queue.shift()!;
        console.log(`[AI_QUEUE] Processing task. Tasks remaining: ${this.queue.length}`);
        
        try {
            const result = await task();
            resolve(result);
        } catch (err) {
            console.error('[AI_QUEUE] Task failed:', err);
            reject(err);
        } finally {
            // Wait for the minimum interval before processing the next item.
            setTimeout(() => this.processQueue(), this.minInterval);
        }
    }
}

const aiCallQueue = new AiCallQueue();


// --- In-Memory Storage ---
const templateLibrary = new Map<string, ContractTemplate>();

const getHumanReadableExpiry = (puppeteerCookie: PuppeteerCookie): string => {
    if (puppeteerCookie.session || puppeteerCookie.expires === -1) return "Session";
    const expiryDate = new Date(puppeteerCookie.expires * 1000);
    const now = new Date();
    const diffSeconds = (expiryDate.getTime() - now.getTime()) / 1000;
    if (diffSeconds < 0) return "Expired";
    if (diffSeconds < 3600) return `${Math.round(diffSeconds / 60)} minutes`;
    if (diffSeconds < 86400) return `${Math.round(diffSeconds / 3600)} hours`;
    if (diffSeconds < 86400 * 30) return `${Math.round(diffSeconds / 86400)} days`;
    if (diffSeconds < 86400 * 365) return `${Math.round(diffSeconds / (86400 * 30))} months`;
    const years = parseFloat((diffSeconds / (86400 * 365)).toFixed(1));
    return `${years} year${years > 1 ? 's' : ''}`;
};

async function findAndClickButton(frame: Frame, keywords: string[]): Promise<boolean> {
  for (const text of keywords) {
    try {
      const clicked = await frame.evaluate((t) => {
        const selectors = 'button, a, [role="button"], input[type="submit"], input[type="button"]';
        const elements = Array.from(document.querySelectorAll(selectors));
        const target = elements.find(el => {
            const elText = (el.textContent || el.getAttribute('aria-label') || (el as HTMLInputElement).value || '').trim().toLowerCase();
            return elText.includes(t)
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

async function handleConsent(page: Page, action: 'accept' | 'reject'): Promise<boolean> {
  console.log(`[CONSENT] Attempting to ${action} consent...`);
  const acceptKeywords = ["accept all", "allow all", "agree to all", "accept cookies", "agree", "accept", "allow", "i agree", "ok", "got it", "continue", "tout accepter"];
  const rejectKeywords = ["reject all", "deny all", "decline all", "reject cookies", "disagree", "reject", "deny", "decline", "necessary only", "tout refuser"];
  
  const keywords = action === 'accept' ? acceptKeywords : rejectKeywords;

  // Check main frame first, then all sub-frames recursively
  const checkFrame = async (frame: Frame): Promise<boolean> => {
      if (await findAndClickButton(frame, keywords)) return true;
      for (const child of frame.childFrames()) {
          if (await checkFrame(child)) return true;
      }
      return false;
  }

  if (await checkFrame(page.mainFrame())) return true;
  
  console.log(`[CONSENT] No actionable button found for "${action}".`);
  return false;
}


// This is the function that will be executed in the browser context via page.evaluate()
const browserSideComplianceCheck = async (): Promise<{ bannerDetected: boolean; policyDetected: boolean; }> => {
    // Give dynamic banners (React/Vue/etc.) a moment to mount after page load
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
        // Early exit if both are already found
        if (bannerDetected && policyDetected) return;

        // --- New, more robust banner detection logic ---
        if (!bannerDetected) {
            const bannerKeywords = ['cookie', 'consent', 'privacy', 'accept', 'manage settings', 'we use cookies', 'personal data', 'gdpr', 'ccpa', 'lgpd', 'einwilligung', 'datenschutz', 'akzeptieren', 'zustimmen'];
            const bannerSelectors = ['[id*="cookie"]', '[class*="cookie"]', '[id*="consent"]', '[class*="consent"]', '[id*="onetrust"]', '[id*="cmp"]', '[id*="privacy-banner"]', '[role="dialog"]', '[role="alertdialog"]', 'div[data-cy*="consent"]'];

            const potentialElements = Array.from(context.querySelectorAll('div, section, aside, footer, nav, form'));
            let bestCandidate: { el: HTMLElement, score: number } | null = null;

            for (const el of potentialElements) {
                if (!isElementVisible(el)) continue;

                let score = 0;
                const text = (el.textContent || el.innerText || '').toLowerCase();
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();

                // Score based on content and attributes (high confidence)
                if (bannerKeywords.some(kw => text.includes(kw))) score += 5;
                if (bannerSelectors.some(sel => el.matches(sel))) score += 5;
                
                // Score based on styling and position (strong indicators)
                if (style.position === 'fixed' || style.position === 'sticky') score += 4;
                if (parseInt(style.zIndex || '0', 10) > 99) score += 4;
                
                // A banner is usually at the top or bottom of the viewport
                if (rect.top < 50 || rect.bottom > window.innerHeight - 50) score += 3;
                
                // Banners are typically wide
                if (rect.width > window.innerWidth * 0.8) score += 2;
                
                // Penalize very small elements
                if (rect.width < 100 || rect.height < 30) score -= 5;
                
                // Penalize elements that are likely headers/footers if they don't contain keywords
                if ((el.tagName === 'HEADER' || el.tagName === 'FOOTER') && el.querySelector('nav, a')) {
                   if (!bannerKeywords.some(kw => text.includes(kw))) score -= 3;
                }

                if (!bestCandidate || score > bestCandidate.score) {
                    bestCandidate = { el, score };
                }
            }
            
            // A score threshold to be considered a banner. This prevents false positives.
            if (bestCandidate && bestCandidate.score >= 8) {
                const rect = bestCandidate.el.getBoundingClientRect();
                 // Final check: is it actually taking up significant space on the screen?
                 if (rect.width > 50 && rect.height > 20 && rect.bottom > 0 && rect.top < window.innerHeight) {
                    bannerDetected = true;
                }
            }
        }

        // --- Improved Policy Link Detection Logic ---
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

        // Recursively check all shadow roots in the current context
        const elementsWithShadowRoot = doc.querySelectorAll('*');
        for (const el of elementsWithShadowRoot) {
            if (el.shadowRoot) {
                traverseDOM(el.shadowRoot);
            }
        }
    };
    
    // This function will traverse all frames recursively
    const traverseFrames = (currentWindow: Window) => {
        try {
            traverseDOM(currentWindow.document);
            if (bannerDetected && policyDetected) return;

            for (let i = 0; i < currentWindow.frames.length; i++) {
                traverseFrames(currentWindow.frames[i]);
            }
        } catch(e) {
            // Catches cross-origin frame errors, which is expected.
        }
    };

    // Start traversal from the top window
    if (window.top) {
        traverseFrames(window.top);
    }
    
    return { bannerDetected, policyDetected };
};


const detectCMP = async (page: Page): Promise<string> => {
    try {
        const cmp = await page.evaluate(() => {
            if ((window as any).OneTrust) return 'OneTrust';
            if ((window as any).Cookiebot) return 'Cookiebot';
            if ((window as any).CookieYes) return 'CookieYes';
            if ((window as any).Osano) return 'Osano';
            if ((window as any).didomiOnReady) return 'Didomi';
            if (document.getElementById('CybotCookiebotDialog')) return 'Cookiebot';
            if (document.getElementById('onetrust-banner-sdk')) return 'OneTrust';
            if (document.querySelector('[class*="CookieConsent"]')) return 'CookieConsent'; // Generic fallback
            return 'Unknown';
        });
        return cmp;
    } catch (e) {
        console.warn('[CMP] Could not detect CMP:', e);
        return 'Unknown';
    }
};

const getOneTrustClassifications = async (page: Page): Promise<Map<string, string>> => {
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

const collectPageData = async (page: Page, rootHostname: string): Promise<{ cookies: PuppeteerCookie[], networkRequests: {hostname: string, url: string}[], localStorageItems: LocalStorageItem[], googleConsentV2: GoogleConsentV2Status }> => {
    let cdpSession: CDPSession | null = null;
    try {
        cdpSession = await page.target().createCDPSession();
        await cdpSession.send('Network.enable');
    } catch (e) {
        console.warn('[CDP] Could not create CDP session. Cookie collection may be incomplete.', e);
    }
    
    const networkRequests: {hostname: string, url: string}[] = [];
    const requestListener = (request: any) => {
        try {
            const reqUrl = new URL(request.url());
            if (reqUrl.hostname !== rootHostname && (reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:')) {
                networkRequests.push({ url: request.url(), hostname: reqUrl.hostname });
            }
        } catch(e) { /* ignore invalid urls */ }
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

    // Add a soak time to allow async/delayed scripts to fire for consistent results
    console.log(`[SCANNER] Soaking page for 4 seconds to catch delayed trackers...`);
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    let cookies: PuppeteerCookie[] = [];
    if (cdpSession) {
        try {
            const { cookies: cdpCookies } = await cdpSession.send('Network.getAllCookies');
            cookies = cdpCookies as unknown as PuppeteerCookie[];
        } catch(e) {
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
        } catch(e) {
            console.warn('Could not access storage on page.');
        }

        // --- Improved GCMv2 Detection Logic ---
        // Primary, more reliable method: Check the internal google_tag_data state
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
                    gcmStatus.status = "Detected, but state format is unexpected."
                }
            }
        } catch (e) {
           // This check can fail if the object doesn't exist; we'll proceed to the fallback.
        }

        // Fallback method: Check the dataLayer for the default command
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
    
    page.off('request', requestListener); // Clean up listener
    return { cookies, networkRequests, localStorageItems, googleConsentV2 };
}

// --- Sitemap Discovery Helpers ---
const parseSitemap = async (sitemapUrl: string): Promise<string[]> => {
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
        
        // Check if it's a sitemap index file and recursively parse nested sitemaps
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

const discoverSitemapUrls = async (rootUrl: URL): Promise<string[]> => {
    const sitemapLocations = new Set<string>();
    try {
        // 1. Check robots.txt for "Sitemap:" directive
        const robotsUrl = new URL('/robots.txt', rootUrl);
        const robotsResponse = await fetch(robotsUrl.toString(), { headers: { 'User-Agent': 'CookieCare-Bot/1.0' }});
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

    // 2. Fallback to common location if not found in robots.txt
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

app.get('/api/scan', async (req: express.Request, res: express.Response) => {
  const rawUrl = req.query.url as string;
  const depth = req.query.depth as 'lite' | 'medium' | 'deep' | 'enterprise' | undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!rawUrl) {
      sendEvent({ type: 'error', message: 'URL is required' });
      return res.end();
  }
  
  const url = decodeURIComponent(rawUrl);
  
  try {
      new URL(url);
  } catch(e) {
      console.error(`[SERVER] Scan failed: Invalid URL provided "${url}"`);
      sendEvent({ type: 'error', message: `Failed to scan ${url}. Invalid URL` });
      return res.end();
  }

  console.log(`[SERVER] Received scan request for: ${url}`);
  let browser: Browser | null = null;
  // FIX: Wrap main browser session in a try/finally to guarantee it closes. This is implemented.
  try {
    const depthLimits = { lite: 10, medium: 50, deep: 100, enterprise: 500 };
    const maxPages = depthLimits[depth || 'lite'];
    sendEvent({ type: 'log', message: `Scan initiated for ${url} (Depth: ${depth || 'lite'}, up to ${maxPages} pages)` });

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] });
    
    // Use an isolated browser context for each scan. This creates a fresh, "incognito-like" session
    // ensuring that cookies from previous visits (or other scans) do not affect banner detection,
    // which guarantees an accurate simulation of a first-time user visit.
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
    let googleConsentV2Status: GoogleConsentV2Status = { detected: false, status: "Not checked" };
    let cmpProvider = 'Unknown';
    let oneTrustClassifications = new Map<string, string>();
    
    // Crawler logic: Bucket URLs by section to ensure diversity
    const visitedBuckets = new Map<string, number>();
    const bucketLimit = Math.max(2, Math.ceil(maxPages / 25)); // Scales from 2 (lite) up to 20 (enterprise)

    // --- Sitemap Discovery ---
    sendEvent({ type: 'log', message: 'Searching for sitemap for comprehensive crawling...' });
    try {
        const sitemapPageUrls = await discoverSitemapUrls(rootUrl);
        if (sitemapPageUrls.length > 0) {
            sendEvent({ type: 'log', message: `Found sitemap! Added ${sitemapPageUrls.length} URLs to the crawl queue.` });
            sitemapPageUrls.forEach(pageUrl => {
                if (!urlsToVisit.some(item => item.url === pageUrl)) {
                    urlsToVisit.push({ url: pageUrl, priority: 0 }); // Highest priority
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
    }
    
    while(urlsToVisit.length > 0 && visitedUrls.size < maxPages) {
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
            
            // Bucketing Logic to ensure scan diversity
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
                // On the first page, run the comprehensive check for banner, policy, and CMP.
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

                sendEvent({ type: 'log', message: 'Performing 3-stage consent analysis on entry page...'});
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

            // FIX: Sort links to ensure a deterministic crawl order. This is implemented.
            internalLinks.sort((a, b) => a.href.localeCompare(b.href));

            const priorityKeywords = [
                'privacy', 'policy', 'terms', 'conditions', 'cookie', 
                'contact', 'about', 'legal', 'login', 'signin', 'signup', 
                'pricing', 'dpa', 'data-processing', 'security', 'disclaimer', 
                'imprint', 'impressum', 'user-agreement', 'terms-of-service', 'terms-of-use'
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

    const allDomainsMap = new Map<string, { states: Set<string>, pageUrls: Set<string> }>();
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
        sendEvent({ type: 'result', payload: {
            uniqueCookies: [], uniqueTrackers: [], uniqueLocalStorage: [], thirdPartyDomains: [], pages: Array.from(visitedUrls).map(u => ({ url: u })), screenshotBase64,
            consentBannerDetected: consentBannerFound,
            cookiePolicyDetected,
            pagesScannedCount: visitedUrls.size,
            googleConsentV2: googleConsentV2Status,
            cmpProvider,
            compliance: {
                gdpr: { riskLevel: 'Low', assessment: 'No cookies or trackers were detected.'},
                ccpa: { riskLevel: 'Low', assessment: 'No cookies or trackers were detected.'},
            }
        }});
        return;
    }

    const BATCH_SIZE = 25;
    const batches = [];
    for (let i = 0; i < allItemsToAnalyze.length; i += BATCH_SIZE) {
        batches.push(allItemsToAnalyze.slice(i, i + BATCH_SIZE));
    }
    
    const analyzeBatch = async (batch: any[], batchNum: number, maxRetries = 3): Promise<any[]> => {
      // FIX: Use a map to correlate short keys with original keys. This is implemented.
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
      
      const batchResponseSchema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, isTracker: { type: Type.BOOLEAN }, category: { type: Type.STRING }, purpose: { type: Type.STRING }, complianceStatus: { type: Type.STRING }, remediation: { type: Type.STRING } }, required: ["key", "isTracker", "category", "purpose", "complianceStatus", "remediation"] }};
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await ai.models.generateContent({ model, contents: batchPrompt, config: { responseMimeType: "application/json", responseSchema: batchResponseSchema } });
            
            if (result.promptFeedback?.blockReason) {
                const blockReason = result.promptFeedback.blockReason;
                const blockMessage = result.promptFeedback.blockReasonMessage || "No additional message.";
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
                // Map the short keys back to their original long keys before returning.
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
        } catch(error) {
            console.warn(`[AI] Attempt ${attempt + 1}/${maxRetries + 1} failed for batch ${batchNum + 1}.`, error instanceof Error ? error.message : String(error));
             if (error instanceof Error && error.message.includes("blocked due to safety settings")) {
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
    const complianceSchema = { type: Type.OBJECT, properties: { gdpr: { type: Type.OBJECT, properties: { riskLevel: { type: Type.STRING }, assessment: { type: Type.STRING } } }, ccpa: { type: Type.OBJECT, properties: { riskLevel: { type: Type.STRING }, assessment: { type: Type.STRING } } } }, required: ['gdpr', 'ccpa'] };
    const complianceResult = await ai.models.generateContent({ model, contents: compliancePrompt, config: { responseMimeType: "application/json", responseSchema: complianceSchema } });
    
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
            finalRemediation = "No action needed.";
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
            // FIX: Improved logic to associate trackers with cookies from the same root domain.
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

    sendEvent({ type: 'result', payload: { 
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
    }});

  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    console.error('[SERVER] Scan failed:', message);
    sendEvent({ type: 'error', message: `Failed to scan ${url}. ${message}` });
  } finally {
    if (browser) await browser.close();
    res.end();
  }
});

// Email Report Endpoint
app.post('/api/email-report', async (req: express.Request, res: express.Response) => {
    const { email, pdfData, fileName } = req.body;
    if (!email || !pdfData || !fileName) {
        return res.status(400).json({ error: 'Email, PDF data, and file name are required.' });
    }

    try {
        console.log(`[SERVER] Received request to email report to: ${email}`);
        
        const websiteName = fileName.replace('Cookie-Report-', '').replace('.pdf', '');

        // Generate a professional email body using Gemini
        const emailPrompt = `You are a corporate communications AI. Write a professional HTML email body for sending a website compliance report. The report is for the website "${websiteName}" and is attached to this email. The email should be from "Cookie Care" and should state that the attached report contains the results of the recent website scan. The tone should be professional and informative. The email should be visually appealing with a simple header (using the name Cookie Care) and a small footer. Do not include any placeholder for the recipient's name.`;

        const geminiResult = await ai.models.generateContent({ model, contents: emailPrompt });
        const emailHtml = geminiResult.text;
        
        let transporter;

        // Check for production SMTP credentials provided via environment variables
        if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
            console.log('[SERVER] Using configured SMTP transport for real email delivery.');
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: (process.env.SMTP_PORT === '465'), // Common convention for SSL on port 465
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
        } else {
            // Fallback to Ethereal for development/testing if credentials are not set
            console.warn('[SERVER] WARNING: SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS) are not set.');
            console.warn('[SERVER] Using Ethereal for email preview. Email will NOT be delivered to the recipient.');
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false, // Ethereal uses STARTTLS
                auth: {
                    user: testAccount.user, // generated ethereal user
                    pass: testAccount.pass, // generated ethereal password
                },
            });
        }

        const mailOptions = {
            from: '"Cookie Care" <noreply@cookiecare.com>',
            to: email,
            subject: `Your Website Compliance Report for ${websiteName}`,
            html: emailHtml,
            attachments: [{
                filename: fileName,
                content: pdfData,
                encoding: 'base64',
                contentType: 'application/pdf'
            }]
        };
        
        const info = await transporter.sendMail(mailOptions);
        
        console.log(`[SERVER] Email sent: ${info.messageId}`);
        const previewUrl = nodemailer.getTestMessageUrl(info);

        if (previewUrl) {
            console.log(`[SERVER] Preview URL: ${previewUrl}`);
        } else {
            console.log('[SERVER] Email successfully sent via configured SMTP server.');
        }
        
        res.status(200).json({ message: `Report successfully sent to ${email}` });

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error('[SERVER] Email report failed:', message);
        res.status(500).json({ error: `Failed to email report. ${message}` });
    }
});

// --- DOCUMENT REDACTION REFACTOR ---

// Endpoint 1: Find PII in a document
app.post('/api/find-pii', async (req: express.Request, res: express.Response) => {
    const { fileName, fileData, mimeType } = req.body;
    if (!fileName || !fileData || !mimeType) {
        return res.status(400).json({ error: 'fileName, fileData, and mimeType are required.' });
    }

    console.log(`[REDACTOR] Received PII find request for: ${fileName}`);
    let browser: Browser | null = null;
    try {
        const fileBuffer = Buffer.from(fileData, 'base64');
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        
        let pdfBuffer: Buffer;
        if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const { value: html } = await mammoth.convertToHtml({ buffer: fileBuffer });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
            await page.close();
        } else {
            pdfBuffer = fileBuffer;
        }

        const page = await browser.newPage();
        await page.goto('about:blank');
        
        try {
            await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
            await page.evaluate(() => {
                (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            });
        } catch (e) {
            throw new Error('Failed to load PDF rendering engine in browser.');
        }

        const pdfDataUri = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
        const numPages = await page.evaluate(async (dataUri) => {
            const loadingTask = (window as any).pdfjsLib.getDocument({ data: atob(dataUri.split(',')[1]) });
            const pdf = await loadingTask.promise;
            return pdf.numPages;
        }, pdfDataUri);

        let piiFound: any[] = [];
        const pagesInfo: { imageUrl: string; width: number; height: number }[] = [];
        let piiCounter = 0;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            console.log(`[REDACTOR] Analyzing page ${pageNum}/${numPages}...`);
            const pageData = await page.evaluate(async (dataUri, num) => {
                const loadingTask = (window as any).pdfjsLib.getDocument({ data: atob(dataUri.split(',')[1]) });
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(num);
                const viewport = page.getViewport({ scale: 2.0 });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: context!, viewport }).promise;
                const dataUrl = canvas.toDataURL('image/png');

                const textContent = await page.getTextContent();
                return {
                    dataUrl,
                    width: viewport.width / 2.0,
                    height: viewport.height / 2.0,
                    textItems: textContent.items.map((item: any) => ({
                        text: item.str, transform: item.transform, width: item.width, height: item.height,
                    })),
                };
            }, pdfDataUri, pageNum);

            const { dataUrl, width, height, textItems } = pageData;
            pagesInfo.push({ imageUrl: dataUrl, width, height });

            // --- Text PII Detection ---
            if (textItems.length > 0) {
                const pageText = textItems.map((item: { text: string }) => item.text).join(' ');
                const textPiiPrompt = `You are a highly accurate PII detection engine. Your task is to analyze the provided text from a document page and identify ALL instances of the following PII categories. Be extremely thorough.

                PII CATEGORIES TO DETECT:
                - **Name**: Full names of individuals (e.g., "Reshika Samala", "Tammy Bare", "Jessica Valentine").
                - **Address**: Full or partial mailing addresses (e.g., "3653 Santa Croce CT, San Jose, California 95148").
                - **Date**: Any form of date (e.g., "9/2/2025", "2/27/2026", "August 23rd, 2018", "08/25/2025 EDT").
                - **Financial**: Monetary values, rates, or financial identifiers (e.g., "$123.50", "$185.25").
                - **SignatureText**: Any typed text appearing near a signature line (e.g., "Mollee Bobusch" typed under a signature).
                - **Id**: Unique alphanumeric identifiers, such as Document IDs, Signer IDs, Contract Numbers, or tracking codes. These are often long strings of random characters. (e.g., "c8eb73fbd...", "Signer ID: 0J4XAF0A15...", "Document ID: 123-456-789"). You MUST extract the full line including the label, like "Signer ID: 0J4XAF0A15...".

                Return ONLY a valid JSON array of objects. Each object must have "text" (the EXACT PII string found) and "category" (one of the PII categories). If no PII is found, return an empty array.
                Text:
                ---
                ${pageText}
                ---`;
                
                const piiSchema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, category: { type: Type.STRING } }, required: ["text", "category"] } };
                
                const piiResult = await aiCallQueue.add(() => ai.models.generateContent({ model, contents: textPiiPrompt, config: { responseMimeType: "application/json", responseSchema: piiSchema } }));
                const detectedPii = JSON.parse(piiResult.text || '[]');
                
                if (detectedPii.length > 0) {
                    const foundTextCoords = new Map();
                    detectedPii.forEach((pii: any) => {
                        const searchText = pii.text;
                        const normalizedSearchText = searchText.replace(/\s+/g, '').toLowerCase();
                        if (!normalizedSearchText || foundTextCoords.has(normalizedSearchText)) return;

                        const allBoxes = [];
                        for (let i = 0; i < textItems.length; i++) {
                            let currentText = '';
                            const sequence = [];
                            for (let j = i; j < textItems.length; j++) {
                                currentText += textItems[j].text;
                                sequence.push(textItems[j]);
                                if (currentText.replace(/\s+/g, '').toLowerCase().startsWith(normalizedSearchText)) {
                                    if (currentText.replace(/\s+/g, '').toLowerCase() === normalizedSearchText) {
                                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                                        sequence.forEach(item => {
                                            const itemWidth = item.width, itemHeight = item.height, x = item.transform[4], y = item.transform[5];
                                            const boxYTop = height - y;
                                            minX = Math.min(minX, x); minY = Math.min(minY, boxYTop - itemHeight); maxX = Math.max(maxX, x + itemWidth); maxY = Math.max(maxY, boxYTop);
                                        });
                                        if (isFinite(minX)) {
                                            allBoxes.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
                                        }
                                        i = j; break;
                                    }
                                } else if (!normalizedSearchText.startsWith(currentText.replace(/\s+/g, '').toLowerCase())) break;
                            }
                        }
                        if (allBoxes.length > 0) {
                            piiFound.push({ id: `pii-${piiCounter++}`, text: searchText, category: pii.category, pageNum, boxes: allBoxes });
                            foundTextCoords.set(normalizedSearchText, true);
                        }
                    });
                }
            }
            
            // --- Signature Detection ---
            const signaturePrompt = `Analyze the provided image to find all handwritten signatures. A handwritten signature is cursive-style writing, typically a person's name, used for authentication. Focus ONLY on actual, ink-like handwritten signatures. IGNORE all other elements, including: printed text, typed text, empty horizontal lines (like form field underlines), and page borders or footers. The image coordinate system has its origin (0,0) at the TOP-LEFT corner. Return ONLY a valid JSON array of bounding box objects. Each object must have "x", "y", "width", and "height" properties, representing the signature's bounding box. The values must be normalized to a 0-1000 scale. Example: [{"x": 100, "y": 150, "width": 150, "height": 15}]. If no signatures are found, return an empty array.`;
            const signatureResult = await aiCallQueue.add(() => ai.models.generateContent({
                model,
                contents: [{ inlineData: { mimeType: 'image/png', data: dataUrl.split(',')[1] } }, { text: signaturePrompt }],
                config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, width: { type: Type.NUMBER }, height: { type: Type.NUMBER } }, required: ["x", "y", "width", "height"] } } },
            }));
            const signatureBoxes = JSON.parse(signatureResult.text || '[]');
            
            signatureBoxes.forEach((box: { x: number; y: number; width: number; height: number; }) => {
                if (!box) return;
                const absX = (box.x / 1000) * width;
                const absY = (box.y / 1000) * height;
                const absW = (box.width / 1000) * width;
                const absH = (box.height / 1000) * height;
                piiFound.push({ id: `pii-${piiCounter++}`, text: 'Handwritten Signature', category: 'Signature', pageNum, boxes: [{ x: absX, y: absY, w: absW, h: absH }] });
            });
        }
        
        await page.close();
        res.json({ piiFound, pagesInfo });

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`[SERVER] PII finding failed for ${fileName}:`, message);
        res.status(500).json({ error: `Failed to find PII. ${message}` });
    } finally {
        if (browser) await browser.close();
    }
});


// Endpoint 2: Redact a document based on provided coordinates
app.post('/api/redact-document', async (req: express.Request, res: express.Response) => {
    const { fileName, fileData, mimeType, redactions } = req.body;
    if (!fileName || !fileData || !mimeType || !redactions) {
        return res.status(400).json({ error: 'fileName, fileData, mimeType, and redactions are required.' });
    }

    console.log(`[REDACTOR] Received redaction request for: ${fileName}`);
    let browser: Browser | null = null;
    try {
        const fileBuffer = Buffer.from(fileData, 'base64');
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        
        let pdfBuffer: Buffer;
        if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const { value: html } = await mammoth.convertToHtml({ buffer: fileBuffer });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
            await page.close();
        } else {
            pdfBuffer = fileBuffer;
        }

        const page = await browser.newPage();
        await page.goto('about:blank');
        await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
        await page.evaluate(() => { (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; });

        const pdfDataUri = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
        const numPages = await page.evaluate(async (dataUri) => {
            const loadingTask = (window as any).pdfjsLib.getDocument({ data: atob(dataUri.split(',')[1]) });
            const pdf = await loadingTask.promise;
            return pdf.numPages;
        }, pdfDataUri);

        const finalPdf = new jsPDF();
        finalPdf.deletePage(1);

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const pageData = await page.evaluate(async (dataUri, num) => {
                const loadingTask = (window as any).pdfjsLib.getDocument({ data: atob(dataUri.split(',')[1]) });
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(num);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
                return { dataUrl: canvas.toDataURL('image/png'), width: viewport.width / 2.0, height: viewport.height / 2.0 };
            }, pdfDataUri, pageNum);

            finalPdf.addPage([pageData.width, pageData.height]);
            finalPdf.addImage(pageData.dataUrl, 'PNG', 0, 0, pageData.width, pageData.height);
            finalPdf.setFillColor(0, 0, 0);

            const pageRedactions = redactions[pageNum] || [];
            const margin = 1;
            pageRedactions.forEach((box: any) => {
                finalPdf.rect(box.x - margin, box.y - margin, box.w + (margin * 2), box.h + (margin * 2), 'F');
            });
        }
        
        await page.close();
        const pdfOutput = finalPdf.output('datauristring').split(',')[1];
        res.json({ redactedFileData: pdfOutput });

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error(`[SERVER] Document redaction failed for ${fileName}:`, message);
        res.status(500).json({ error: `Failed to redact document. ${message}` });
    } finally {
        if (browser) await browser.close();
    }
});


app.post('/api/scan-vulnerabilities', async (req: express.Request, res: express.Response) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    console.log(`[SERVER] Received vulnerability scan request for: ${url}`);
    let browser: Browser | null = null;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        
        const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        if (!response) throw new Error('Could not get a response from the URL.');

        const headers = response.headers();
        const cookies = await page.cookies();
        
        const pageData = await page.evaluate(() => {
            const comments: string[] = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT, null);
            let node;
            while(node = walker.nextNode()) {
                if (node.nodeValue) comments.push(node.nodeValue.trim());
            }

            const externalScripts = Array.from(document.querySelectorAll('script[src]'))
                .map(s => s.getAttribute('src'))
                .filter((src): src is string => !!src && (src.startsWith('http') || src.startsWith('//')));
                 
            const metaTags = Array.from(document.querySelectorAll('meta')).map(m => ({ name: m.name, content: m.content }));

            const insecureLinks = Array.from(document.querySelectorAll('a[target="_blank"]:not([rel~="noopener"]):not([rel~="noreferrer"])'))
                .map(a => (a as HTMLAnchorElement).href);

            const forms = Array.from(document.querySelectorAll('form')).map(f => ({
                action: f.getAttribute('action') || '',
                method: f.getAttribute('method') || 'GET',
                hasPasswordInput: !!f.querySelector('input[type="password"]'),
            }));

            return { comments, externalScripts, metaTags, insecureLinks, forms };
        });

        const vulnerabilityPrompt = `
          You are a Principal Security Consultant and Professional Auditor, tasked with producing a comprehensive, non-intrusive penetration test and security audit report for the website "${url}".
          Your analysis must be exceptionally detailed, accurate, and reflect the standards of a top-tier cybersecurity firm. The final output must be a single, client-ready JSON object. Do not use markdown formatting in your response.

          **Passively Collected Intelligence:**
          *   **HTTP Headers:** ${JSON.stringify(headers, null, 2)}
          *   **Cookies:** ${JSON.stringify(cookies.map(c => ({ name: c.name, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite })), null, 2)}
          *   **Meta Tags:** ${JSON.stringify(pageData.metaTags, null, 2)}
          *   **External Scripts:** ${JSON.stringify(pageData.externalScripts, null, 2)}
          *   **HTML Comments:** ${JSON.stringify(pageData.comments, null, 2)}
          *   **Insecure "target=_blank" Links:** ${JSON.stringify(pageData.insecureLinks, null, 2)}
          *   **Forms:** ${JSON.stringify(pageData.forms, null, 2)}

          **Mandatory Reporting Structure & Analysis Guidelines:**

          **Part 1: Executive Summary (overallRisk object)**
          *   **score:** Provide a precise Common Vulnerability Scoring System (CVSS) v3.1 equivalent score (0.0-10.0). Base this on the highest severity finding and the overall security posture. A site with critical findings (e.g., no CSP, leaking sensitive info) must score 8.0+. A well-configured site should be below 3.0.
          *   **level:** Assign a risk level: 'Critical', 'High', 'Medium', 'Low', or 'Informational'. This must correspond to the highest risk finding.
          *   **summary:** Write a concise, C-level executive summary. Clearly state the overall security posture, highlight the most critical risk areas, and quantify the number of high-risk findings.

          **Part 2: Detailed Technical Findings (findings array)**
          For EACH identified weakness, no matter how small, create a finding object. Be exhaustive.
          *   **name:** Use a standardized, professional vulnerability name (e.g., "Content-Security-Policy (CSP) Header Not Implemented").
          *   **riskLevel:** Classify the risk of the specific finding.
          *   **category:** Use one: 'Security Headers', 'Cookie Configuration', 'Information Exposure', 'Insecure Transport', 'Software Fingerprinting', 'Frontend Security', 'Third-Party Risk', 'Best Practices'.
          *   **description:** Provide a detailed explanation of what the vulnerability is and why it's a risk in the context of this specific website.
          *   **impact:** Clearly articulate the potential business and technical impact of exploitation (e.g., "Successful exploitation could lead to Cross-Site Scripting (XSS) attacks, allowing an attacker to steal user session cookies, deface the website, or redirect users to malicious sites.").
          *   **evidence:** Provide the *exact* piece of data from the "Collected Intelligence" that proves the vulnerability exists. For missing headers, state "The '[Header-Name]' header was not present in the HTTP response."
          *   **remediation:** Offer a comprehensive and actionable remediation plan. Include best-practice code snippets, configuration examples, and specific implementation guidance. This is the most critical part of your analysis.
          *   **references:** Provide an array of at least two authoritative references (title and URL) from sources like OWASP, MDN, or CWE for each finding.

          **Comprehensive Audit Checklist (You must evaluate ALL points):**

          1.  **Security Headers:**
              *   **Content-Security-Policy:** Is it present? If so, is it strong or overly permissive (e.g., contains 'unsafe-inline' or wildcard sources)? A weak or missing CSP is a HIGH or CRITICAL risk.
              *   **Strict-Transport-Security (HSTS):** Is it present? Does it have a long \`max-age\` and include \`includeSubDomains\`?
              *   **X-Content-Type-Options:** Must be \`nosniff\`.
              *   **X-Frame-Options:** Must be \`DENY\` or \`SAMEORIGIN\`. Note that \`Content-Security-Policy: frame-ancestors\` is superior.
              *   **Permissions-Policy (formerly Feature-Policy):** Is a restrictive policy in place to prevent misuse of browser features?
              *   **Referrer-Policy:** Is it set to a privacy-preserving value like \`strict-origin-when-cross-origin\` or \`no-referrer\`?
              *   **COOP/COEP:** Check for \`Cross-Origin-Opener-Policy\` and \`Cross-Origin-Embedder-Policy\` to mitigate cross-origin attacks.

          2.  **Information Exposure & Fingerprinting:**
              *   **Server / X-Powered-By / X-AspNet-Version:** Are these headers exposing specific server technologies and versions? This is a finding.
              *   **Meta 'generator' tags:** Is the specific CMS or framework version being advertised?
              *   **HTML Comments:** Scrutinize comments for any leaked developer notes, credentials, internal paths, or commented-out code.

          3.  **Cookie Security:**
              *   Audit EVERY cookie. Any cookie without \`Secure\` (if site is HTTPS) and \`HttpOnly\` (unless needed by client-side JS) is a finding.
              *   Check for weak \`SameSite\` policies (e.g., \`None\` without \`Secure\`). Praise use of \`Lax\` or \`Strict\`.
              *   Note if cookies lack the \`__Host-\` or \`__Secure-\` prefix for added protection.

          4.  **Frontend & Transport Security:**
              *   **Tabnabbing:** Report all links with \`target="_blank"\` that are missing \`rel="noopener noreferrer"\`.
              *   **Third-Party Scripts:** Analyze the list of external scripts. If there are many, create a 'Third-Party Risk' finding explaining the increased attack surface and risk of supply chain attacks (e.g., Magecart).
              *   **Insecure Forms:** Analyze the 'forms' data. Report any form that submits to an \`http://\` action, especially if it contains a password field.

          5.  **Best Practices & Further Investigation:**
              *   If no major issues are found, still provide 'Informational' findings for hardening (e.g., 'Permissions-Policy Header Not Implemented'). If the site is already very secure, create an Informational finding praising a specific strong control, for example: "Robust Content-Security-Policy". Your goal is to always provide value.

          **Final Instruction:** Your final response MUST be a single, valid JSON object and nothing else. Adhere strictly to the JSON schema provided in the API definition. Do not include any text, markdown, or commentary outside of the JSON structure.
        `;

        const vulnerabilitySchema = {
            type: Type.OBJECT,
            properties: {
                overallRisk: {
                    type: Type.OBJECT,
                    properties: {
                        level: { type: Type.STRING },
                        score: { type: Type.NUMBER },
                        summary: { type: Type.STRING },
                    },
                    required: ['level', 'score', 'summary'],
                },
                findings: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            riskLevel: { type: Type.STRING },
                            category: { type: Type.STRING },
                            description: { type: Type.STRING },
                            impact: { type: Type.STRING },
                            evidence: { type: Type.STRING },
                            remediation: { type: Type.STRING },
                            references: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        title: { type: Type.STRING },
                                        url: { type: Type.STRING },
                                    },
                                    required: ['title', 'url'],
                                },
                            },
                        },
                        required: ['name', 'riskLevel', 'category', 'description', 'impact', 'evidence', 'remediation', 'references'],
                    },
                },
            },
            required: ['overallRisk', 'findings'],
        };
        
        console.log('[AI] Requesting vulnerability assessment...');
        const result = await ai.models.generateContent({
            model,
            contents: vulnerabilityPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: vulnerabilitySchema,
            },
        });
        
        const resultText = result.text;
        if (!resultText) {
            throw new Error(`Gemini API returned an empty response for vulnerability scan.`);
        }
        
        const vulnerabilityReport: VulnerabilityScanResult = JSON.parse(resultText);
        
        res.json(vulnerabilityReport);
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error('[SERVER] Vulnerability scan failed:', message);
        res.status(500).json({ error: `Failed to scan ${url} for vulnerabilities. ${message}` });
    } finally {
        if (browser) await browser.close();
    }
});

// Legal Document Analysis
interface LegalReviewBody {
    documentText: string;
    perspective: LegalPerspective;
}
app.post('/api/analyze-legal-document', async (req: express.Request, res: express.Response) => {
    const { documentText, perspective } = req.body;
    if (!documentText) return res.status(400).json({ error: 'Document text is required.' });

    try {
        console.log(`[SERVER] Received legal analysis request (perspective: ${perspective}).`);

        const legalPrompt = `
You are a world-class AI legal analyst. Your task is to perform a detailed risk analysis of the provided legal document from the perspective of a **${perspective}**.

**Document Text:**
---
${documentText}
---

**Instructions:**
1.  **Overall Risk:** Start by providing an 'overallRisk' object.
    *   'level': A single risk level ('Critical', 'High', 'Medium', 'Low') for the entire document from the chosen perspective.
    *   'summary': A concise, two-sentence executive summary explaining the primary risks or lack thereof.
2.  **Clause-by-Clause Analysis:** Provide an 'analysis' array of objects, one for each significant clause or section you identify (e.g., "Liability," "Data Processing," "Confidentiality," "Termination"). For each clause:
    *   'clause': The name of the clause (e.g., "Limitation of Liability").
    *   'summary': A brief, plain-language summary of what the clause means.
    *   'risk': A detailed explanation of the specific risks this clause poses to the **${perspective}**. Be specific.
    *   'riskLevel': The risk level for this specific clause.
    *   'recommendation': A concrete, actionable recommendation for how the **${perspective}** could negotiate or amend this clause to mitigate risk.

Your final output must be a single, valid JSON object adhering to this structure. Do not include any other text or markdown.
        `;
        
        const legalSchema = {
            type: Type.OBJECT,
            properties: {
                overallRisk: {
                    type: Type.OBJECT,
                    properties: {
                        level: { type: Type.STRING },
                        summary: { type: Type.STRING },
                    },
                    required: ['level', 'summary'],
                },
                analysis: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            clause: { type: Type.STRING },
                            summary: { type: Type.STRING },
                            risk: { type: Type.STRING },
                            riskLevel: { type: Type.STRING },
                            recommendation: { type: Type.STRING },
                        },
                        required: ['clause', 'summary', 'risk', 'riskLevel', 'recommendation'],
                    },
                },
            },
            required: ['overallRisk', 'analysis'],
        };
        
        const result = await ai.models.generateContent({
            model,
            contents: legalPrompt,
            config: { responseMimeType: "application/json", responseSchema: legalSchema },
        });

        const resultText = result.text;
        if (!resultText) throw new Error('AI analysis returned an empty response.');
        
        const analysis: LegalAnalysisResult = JSON.parse(resultText);
        res.json(analysis);

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error('[SERVER] Legal analysis failed:', message);
        res.status(500).json({ error: `Failed to analyze document. ${message}` });
    }
});

// --- Template Library Endpoints ---
app.get('/api/templates', (req: express.Request, res: express.Response) => {
    console.log('[SERVER] Fetching all contract templates.');
    res.json(Array.from(templateLibrary.values()));
});

app.post('/api/templates', (req: express.Request, res: express.Response) => {
    const { name, content } = req.body;
    if (!name || !content) {
        return res.status(400).json({ error: 'Template name and content are required.' });
    }
    const id = `${Date.now()}-${name.replace(/\s+/g, '-')}`;
    const newTemplate: ContractTemplate = { id, name, content };
    templateLibrary.set(id, newTemplate);
    console.log(`[SERVER] Added new template: ${name} (ID: ${id})`);
    res.status(201).json(newTemplate);
});

app.delete('/api/templates/:id', (req: express.Request, res: express.Response) => {
    const { id } = req.params;
    if (templateLibrary.has(id)) {
        templateLibrary.delete(id);
        console.log(`[SERVER] Deleted template with ID: ${id}`);
        res.status(204).send();
    } else {
        res.status(404).json({ error: `Template with id ${id} not found.` });
    }
});


// Contract Generation
interface GenerateContractBody {
    contractType: string;
    details: string; // Will be a stringified JSON object
    templateContent?: string;
}
app.post('/api/generate-contract', async (req: express.Request, res: express.Response) => {
    const { contractType, details, templateContent } = req.body as GenerateContractBody;
    if (!contractType || !details) return res.status(400).json({ error: 'Contract type and details are required.' });

    try {
        let generationPrompt: string;

        if (templateContent) {
            console.log(`[SERVER] Received request to generate contract from a template.`);
            generationPrompt = `
You are an expert legal AI assistant. Your task is to complete the provided contract template using the key details supplied by the user in a structured JSON format.
Diligently and accurately fill in the placeholders in the template (like "[Disclosing Party Name]", "[Effective Date]", "[Term]", etc.) with the corresponding values from the user's JSON details.
If a detail is provided by the user but has no clear placeholder in the template, try to incorporate it logically where it makes sense.
The final title should be taken from the template's likely title or a generic one if none is obvious.

**Contract Template to Complete:**
---
${templateContent}
---

**User's Key Details (JSON Format):**
---
${details}
---

Your output must be a JSON object with "title" and "content" keys. The "content" must be the fully completed contract as a well-structured HTML string. Follow these formatting rules STRICTLY:
- Use <h2> for main section headers (e.g., "1. Confidentiality").
- Use <h3> for sub-section headers if needed.
- Use <p> for all paragraphs of text. Each paragraph must be in its own tag.
- Use <strong> to emphasize important terms, party names, or dates.
- Use <ul> and <li> for any enumerated lists.
- DO NOT return a single block of text. The document must be properly structured with these HTML tags to be readable.

Return ONLY the valid JSON object.`;
        } else {
            console.log(`[SERVER] Received request to generate a ${contractType} from scratch.`);
            generationPrompt = `
You are an expert legal AI specializing in contract drafting. Generate a standard, professional **${contractType}**.
Incorporate the following key details provided by the user in a structured JSON format:
---
${details}
---
The generated contract should be robust, clear, and follow best practices. 

Your output must be a JSON object with "title" (e.g., "Mutual Non-Disclosure Agreement") and "content" keys. The "content" must be the fully completed contract as a well-structured HTML string. Follow these formatting rules STRICTLY:
- Use <h2> for main section headers (e.g., "1. Confidentiality").
- Use <h3> for sub-section headers if needed.
- Use <p> for all paragraphs of text. Each paragraph must be in its own tag.
- Use <strong> to emphasize important terms, party names, or dates.
- Use <ul> and <li> for any enumerated lists.
- DO NOT return a single block of text. The document must be properly structured with these HTML tags to be readable.

Return ONLY the valid JSON object.`;
        }
        
        const generationSchema = {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
            },
            required: ['title', 'content'],
        };
        
        const result = await ai.models.generateContent({
            model,
            contents: generationPrompt,
            config: { responseMimeType: "application/json", responseSchema: generationSchema },
        });

        const resultText = result.text;
        if (!resultText) throw new Error('AI contract generation returned an empty response.');

        const contract: GeneratedContract = JSON.parse(resultText);
        res.json(contract);
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error('[SERVER] Contract generation failed:', message);
        res.status(500).json({ error: `Failed to generate contract. ${message}` });
    }
});

// AI Chat with Document
interface ChatRequestBody {
    documentText: string;
    question: string;
}
app.post('/api/chat-with-document', async (req: express.Request, res: express.Response) => {
    const { documentText, question } = req.body;
    if (!documentText || !question) {
        return res.status(400).json({ error: 'Document text and a question are required.' });
    }

    try {
        console.log('[AI] Answering/editing question about document...');
        const prompt = `You are an interactive legal AI assistant. You can answer questions or perform edits on the provided document.

        **DOCUMENT TEXT:**
        ---
        ${documentText}
        ---
        
        **USER'S INSTRUCTION:** "${question}"

        **Your Task:**
        1.  First, determine the user's intent. Is it a question (e.g., "what does this mean?") or an editing command (e.g., "rephrase this", "add a clause")?
        2.  **If the intent is to ask a question:**
            *   Formulate an answer based ONLY on the document's content.
            *   Return a JSON object: \`{ "answer": "Your detailed answer here.", "revisedText": null }\`
        3.  **If the intent is to edit the document:**
            *   Perform the requested edit (rephrase, add, remove, change) to the best of your ability.
            *   Return a short, conversational confirmation message in the "answer" field (e.g., "Certainly, I have rephrased the termination clause for clarity.").
            *   Return the ENTIRE, full text of the newly modified document in the "revisedText" field.
        
        Your response must be a single, valid JSON object. Do not include any other text or markdown.
        `;
        
        const chatSchema = {
            type: Type.OBJECT,
            properties: {
                answer: { type: Type.STRING },
                revisedText: { type: [Type.STRING, Type.NULL] },
            },
            required: ['answer', 'revisedText'],
        };

        const result = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json", responseSchema: chatSchema },
        });
        
        const resultText = result.text;
        if (!resultText) throw new Error('AI chat returned an empty response.');

        res.json(JSON.parse(resultText));

    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        console.error('[SERVER] Chat with document failed:', message);
        res.status(500).json({ error: `Chat failed. ${message}` });
    }
});


app.listen(port, () => {
  console.log(`[SERVER] Backend server running at http://localhost:${port}`);
});