import type express from 'express';
import type { ZodSchema, ZodError } from 'zod';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Generic Zod validation middleware factory.
 *
 * Usage:
 *   router.post('/', validate('body', mySchema), myController);
 */
export function validate<T>(
  part: RequestPart,
  schema: ZodSchema<T>
): express.RequestHandler {
  return (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const errors = (result.error as ZodError).flatten().fieldErrors;
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }
    // Overwrite the request part with the parsed (coerced/stripped) value
    (req as unknown as Record<string, unknown>)[part] = result.data;
    next();
  };
}
