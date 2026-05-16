/**
 * Product Health Score — evaluates listing quality from A to F.
 *
 * Score factors:
 *   - Title quality (length, descriptiveness)      — 15 pts
 *   - Description completeness (word count)        — 20 pts
 *   - Cover image present                          — 15 pts
 *   - Gallery images (more = better)               — 10 pts
 *   - Tags present                                 — 10 pts
 *   - Has product file                             — 10 pts
 *   - Conversion rate (sales / views)              — 10 pts
 *   - Has reviews                                  — 10 pts
 *
 *   Total = 100
 */

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ProductHealth {
  score: number;        // 0-100
  grade: HealthGrade;
  tips: string[];       // actionable improvement suggestions
}

export interface ProductHealthInput {
  title: string;
  description: string | null;
  coverUrl: string | null;
  galleryCount: number;
  tagCount: number;
  hasFile: boolean;
  salesCount: number;
  viewCount: number;
  reviewCount: number;
}

function gradeFromScore(score: number): HealthGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export function computeProductHealth(input: ProductHealthInput): ProductHealth {
  let score = 0;
  const tips: string[] = [];

  // Title (15 pts)
  const titleLen = input.title.trim().length;
  if (titleLen >= 20) {
    score += 15;
  } else if (titleLen >= 10) {
    score += 10;
    tips.push('Make your title more descriptive (aim for 20+ characters).');
  } else {
    score += 5;
    tips.push('Your title is too short. Use a clear, descriptive title.');
  }

  // Description (20 pts)
  const wordCount = (input.description ?? '').trim().split(/\s+/).filter(Boolean).length;
  if (wordCount >= 100) {
    score += 20;
  } else if (wordCount >= 50) {
    score += 14;
    tips.push('Add more details to your description (aim for 100+ words).');
  } else if (wordCount >= 20) {
    score += 8;
    tips.push('Your description is short. Buyers need details to make a purchase decision.');
  } else {
    score += 2;
    tips.push('Add a detailed description explaining what your product includes.');
  }

  // Cover image (15 pts)
  if (input.coverUrl) {
    score += 15;
  } else {
    tips.push('Add a cover image — products with images sell 3x more.');
  }

  // Gallery (10 pts)
  if (input.galleryCount >= 4) {
    score += 10;
  } else if (input.galleryCount >= 2) {
    score += 6;
    tips.push('Add more gallery images to showcase your product.');
  } else if (input.galleryCount >= 1) {
    score += 3;
    tips.push('Add at least 3 gallery images for better conversions.');
  } else {
    tips.push('Add gallery images to give buyers a preview of your product.');
  }

  // Tags (10 pts)
  if (input.tagCount >= 3) {
    score += 10;
  } else if (input.tagCount >= 1) {
    score += 5;
    tips.push('Add more tags (3-5) to improve discoverability.');
  } else {
    tips.push('Add tags to help buyers find your product in search.');
  }

  // Product file (10 pts)
  if (input.hasFile) {
    score += 10;
  } else {
    tips.push('Upload your product file so buyers can download it after purchase.');
  }

  // Conversion rate (10 pts)
  if (input.viewCount > 0) {
    const convRate = input.salesCount / input.viewCount;
    if (convRate >= 0.05) {
      score += 10;
    } else if (convRate >= 0.02) {
      score += 6;
    } else if (convRate >= 0.01) {
      score += 3;
      tips.push('Your conversion rate is low — consider updating your price or description.');
    } else {
      score += 1;
      tips.push('Your product gets views but few sales. Try lowering the price or improving the preview.');
    }
  }
  // No views yet = neutral (no penalty)

  // Reviews (10 pts)
  if (input.reviewCount >= 5) {
    score += 10;
  } else if (input.reviewCount >= 1) {
    score += 5;
  }
  // No tip for reviews — vendor can't directly control this

  return {
    score: Math.min(100, Math.max(0, score)),
    grade: gradeFromScore(score),
    tips: tips.slice(0, 3), // max 3 tips
  };
}

export const GRADE_COLORS: Record<HealthGrade, { bg: string; text: string }> = {
  A: { bg: 'bg-kode01-green/10', text: 'text-kode01-green' },
  B: { bg: 'bg-kode01-green/10', text: 'text-kode01-green' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700' },
  F: { bg: 'bg-red-100', text: 'text-red-700' },
};
