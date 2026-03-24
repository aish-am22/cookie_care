import nodemailer from 'nodemailer';
import { ai, model } from '../ai/index.js';

export interface SendEmailReportOptions {
  email: string;
  pdfData: string;
  fileName: string;
}

export const sendEmailReport = async ({ email, pdfData, fileName }: SendEmailReportOptions): Promise<{ previewUrl: string | false }> => {
  const websiteName = fileName.replace('Cookie-Report-', '').replace('.pdf', '');

  const emailPrompt = `You are a corporate communications AI. Write a professional HTML email body for sending a website compliance report. The report is for the website "${websiteName}" and is attached to this email. The email should be from "Cookie Care" and should state that the attached report contains the results of the recent website scan. The tone should be professional and informative. The email should be visually appealing with a simple header (using the name Cookie Care) and a small footer. Do not include any placeholder for the recipient's name.`;

  const geminiResult = await ai.models.generateContent({ model, contents: emailPrompt });
  const emailHtml = geminiResult.text;

  let transporter: nodemailer.Transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    console.log('[SERVER] Using configured SMTP transport for real email delivery.');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    console.warn('[SERVER] WARNING: SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS) are not set.');
    console.warn('[SERVER] Using Ethereal for email preview. Email will NOT be delivered to the recipient.');
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
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
      encoding: 'base64' as const,
      contentType: 'application/pdf',
    }],
  };

  const info = await transporter.sendMail(mailOptions);

  console.log(`[SERVER] Email sent: ${info.messageId}`);
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[SERVER] Preview URL: ${previewUrl}`);
  } else {
    console.log('[SERVER] Email successfully sent via configured SMTP server.');
  }

  return { previewUrl };
};
