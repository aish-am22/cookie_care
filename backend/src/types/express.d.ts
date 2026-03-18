// Augment the Express Request interface to carry a typed requestId property.
declare namespace Express {
  interface Request {
    requestId: string;
  }
}
