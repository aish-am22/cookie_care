import type express from 'express';
import { sendEmailReport as sendEmailReportService } from '../services/email/index.js';

export const sendEmailReport = async (req: express.Request, res: express.Response): Promise<void> => {
  const { email, pdfData, fileName } = req.body;
  if (!email || !pdfData || !fileName) {
    res.status(400).json({ error: 'Email, PDF data, and file name are required.' });
    return;
  }

  try {
    console.log(`[SERVER] Received request to email report to: ${email}`);
    await sendEmailReportService({ email, pdfData, fileName });
    res.status(200).json({ message: `Report successfully sent to ${email}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error('[SERVER] Email report failed:', message);
    res.status(500).json({ error: `Failed to email report. ${message}` });
  }
};
