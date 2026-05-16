-- Migration: Product reviews system for marketplace
-- Adds verified-buyer reviews, rating aggregation support, and RLS security.

SET search_path = '';

CREATE TABLE public.product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL CHECK (char_length(trim(comment)) BETWEEN 10 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, buyer_id)
);

CREATE INDEX idx_product_reviews_product_id_created_at
  ON public.product_reviews(product_id, created_at DESC);
CREATE INDEX idx_product_reviews_buyer_id_created_at
  ON public.product_reviews(buyer_id, created_at DESC);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published product reviews are viewable by everyone"
  ON public.product_reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.products AS p
      WHERE p.id = product_reviews.product_id
        AND p.status = 'published'
    )
  );

CREATE POLICY "Buyers can insert reviews for purchased products"
  ON public.product_reviews FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_id
    AND EXISTS (
      SELECT 1
      FROM public.purchases AS pu
      WHERE pu.product_id = product_reviews.product_id
        AND pu.buyer_id = auth.uid()
        AND pu.status IN ('completed', 'refunded')
    )
    AND EXISTS (
      SELECT 1
      FROM public.products AS p
      WHERE p.id = product_reviews.product_id
        AND p.status = 'published'
        AND p.seller_id IS DISTINCT FROM auth.uid()
    )
  );

CREATE POLICY "Buyers can update own reviews"
  ON public.product_reviews FOR UPDATE
  USING (auth.uid() = buyer_id)
  WITH CHECK (
    auth.uid() = buyer_id
    AND EXISTS (
      SELECT 1
      FROM public.purchases AS pu
      WHERE pu.product_id = product_reviews.product_id
        AND pu.buyer_id = auth.uid()
        AND pu.status IN ('completed', 'refunded')
    )
  );

CREATE POLICY "Buyers can delete own reviews"
  ON public.product_reviews FOR DELETE
  USING (auth.uid() = buyer_id);

CREATE TRIGGER product_reviews_updated_at
  BEFORE UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE VIEW public.product_review_stats
WITH (security_invoker = true)
AS
SELECT
  p.id AS product_id,
  ROUND(AVG(pr.rating)::numeric, 1) AS average_rating,
  COUNT(pr.id)::integer AS reviews_count
FROM public.products AS p
LEFT JOIN public.product_reviews AS pr
  ON pr.product_id = p.id
WHERE p.status = 'published'
GROUP BY p.id;

GRANT SELECT ON public.product_review_stats TO anon, authenticated;
