import * as express from 'express';

declare global {
  namespace Express {
    // Yeh user data ke liye hai jo login ke baad req.user mein aayega
    interface UserPayload {
      id: string;
      email: string;
      role: string;
    }

    // Yeh Express ki default Request interface ko extend karega
    interface Request {
      requestId?: string; // requestId ab error nahi dega
      user?: UserPayload; // authenticated user ke liye
    }
  }
}