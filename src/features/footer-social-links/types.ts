import { z } from 'zod';

export interface SocialLink {
  id: string;
  platform: string;
  label_en: string;
  label_fr: string;
  url: string;
  icon: string;
  order_index: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const socialLinkSchema = z.object({
  id: z.string().uuid().optional(),
  platform: z.string().trim().min(1).max(50),
  label_en: z.string().trim().min(1).max(50),
  label_fr: z.string().trim().min(1).max(50),
  url: z.string().url(),
  icon: z.string().trim().min(1).max(50),
  order_index: z.number().int().min(0),
  is_enabled: z.boolean().default(true),
});

export const updateSocialLinksSchema = z.object({
  links: z.array(socialLinkSchema),
});

export type SocialLinkInput = z.infer<typeof socialLinkSchema>;
export type UpdateSocialLinksInput = z.infer<typeof updateSocialLinksSchema>;
