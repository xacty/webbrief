import { z } from 'zod';
import { companyId } from './common.js';

export const CompanyOutput = z.object({
  id: companyId,
  name: z.string(),
  slug: z.string().optional(),
  membershipRole: z.string().optional(),
});
