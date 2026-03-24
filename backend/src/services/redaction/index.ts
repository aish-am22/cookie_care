import puppeteer, { type Browser } from 'puppeteer';
import mammoth from 'mammoth';
import { jsPDF } from 'jspdf';
import { Buffer } from 'buffer';
import { ai, model, Type, aiCallQueue } from '../ai/index.js';

export interface FindPiiOptions {
  fileName: string;
  fileData: string;
  mimeType: string;
}

export interface RedactDocumentOptions {
  fileName: string;
  fileData: string;
  mimeType: string;
  redactions: Record<number, { x: number; y: number; w: number; h: number }[]>;
}

const convertToPdf = async (browser: Browser, fileBuffer: Buffer, mimeType: string): Promise<Buffer> => {
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value: html } = await mammoth.convertToHtml({ buffer: fileBuffer });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
    await page.close();
    return pdfBuffer;
  }
  return fileBuffer;
};

export const findPii = async ({ fileName, fileData, mimeType }: FindPiiOptions) => {
  console.log(`[REDACTOR] Received PII find request for: ${fileName}`);
  let browser: Browser | null = null;
  try {
    const fileBuffer = Buffer.from(fileData, 'base64');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    const pdfBuffer = await convertToPdf(browser, fileBuffer, mimeType);

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

        const piiSchema = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { text: { type: Type.STRING }, category: { type: Type.STRING } },
            required: ['text', 'category'],
          },
        };

        const piiResult = await aiCallQueue.add(() =>
          ai.models.generateContent({ model, contents: textPiiPrompt, config: { responseMimeType: 'application/json', responseSchema: piiSchema } })
        );
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

      const signaturePrompt = `Analyze the provided image to find all handwritten signatures. A handwritten signature is cursive-style writing, typically a person's name, used for authentication. Focus ONLY on actual, ink-like handwritten signatures. IGNORE all other elements, including: printed text, typed text, empty horizontal lines (like form field underlines), and page borders or footers. The image coordinate system has its origin (0,0) at the TOP-LEFT corner. Return ONLY a valid JSON array of bounding box objects. Each object must have "x", "y", "width", and "height" properties, representing the signature's bounding box. The values must be normalized to a 0-1000 scale. Example: [{"x": 100, "y": 150, "width": 150, "height": 15}]. If no signatures are found, return an empty array.`;
      const signatureResult = await aiCallQueue.add(() =>
        ai.models.generateContent({
          model,
          contents: [{ inlineData: { mimeType: 'image/png', data: dataUrl.split(',')[1] } }, { text: signaturePrompt }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, width: { type: Type.NUMBER }, height: { type: Type.NUMBER } },
                required: ['x', 'y', 'width', 'height'],
              },
            },
          },
        })
      );
      const signatureBoxes = JSON.parse(signatureResult.text || '[]');

      signatureBoxes.forEach((box: { x: number; y: number; width: number; height: number }) => {
        if (!box) return;
        const absX = (box.x / 1000) * width;
        const absY = (box.y / 1000) * height;
        const absW = (box.width / 1000) * width;
        const absH = (box.height / 1000) * height;
        piiFound.push({ id: `pii-${piiCounter++}`, text: 'Handwritten Signature', category: 'Signature', pageNum, boxes: [{ x: absX, y: absY, w: absW, h: absH }] });
      });
    }

    await page.close();
    return { piiFound, pagesInfo };
  } finally {
    if (browser) await browser.close();
  }
};

export const redactDocument = async ({ fileName, fileData, mimeType, redactions }: RedactDocumentOptions) => {
  console.log(`[REDACTOR] Received redaction request for: ${fileName}`);
  let browser: Browser | null = null;
  try {
    const fileBuffer = Buffer.from(fileData, 'base64');
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });

    const pdfBuffer = await convertToPdf(browser, fileBuffer, mimeType);

    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
    await page.evaluate(() => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    });

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
        finalPdf.rect(box.x - margin, box.y - margin, box.w + margin * 2, box.h + margin * 2, 'F');
      });
    }

    await page.close();
    const pdfOutput = finalPdf.output('datauristring').split(',')[1];
    return { redactedFileData: pdfOutput };
  } finally {
    if (browser) await browser.close();
  }
};
