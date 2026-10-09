import type { ZodType } from 'zod';
import { invalid } from './errors';

export function parse<T>(schema: ZodType<T, any, any>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_root';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw invalid(fields);
  }
  return result.data;
}
