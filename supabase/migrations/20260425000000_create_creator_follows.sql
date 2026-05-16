SET search_path = '';
-- Create creator_follows table for the Follow Creator feature
CREATE TABLE IF NOT EXISTS public.creator_follows (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    follower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(follower_id, creator_id)
);

-- Prevent self-follows at the database level
ALTER TABLE public.creator_follows
    ADD CONSTRAINT creator_follows_no_self_follow
    CHECK (follower_id != creator_id);

-- Turn on RLS
ALTER TABLE public.creator_follows ENABLE ROW LEVEL SECURITY;

-- Anyone can view follow relationships (for follower counts on creator cards)
CREATE POLICY "Anyone can view follow relationships"
    ON public.creator_follows
    FOR SELECT
    USING (true);

-- Users can only insert their own follows
CREATE POLICY "Users can insert their own follows"
    ON public.creator_follows
    FOR INSERT
    WITH CHECK (auth.uid() = follower_id);

-- Users can only delete their own follows
CREATE POLICY "Users can delete their own follows"
    ON public.creator_follows
    FOR DELETE
    USING (auth.uid() = follower_id);

-- Create indexes
CREATE INDEX idx_creator_follows_follower_id ON public.creator_follows(follower_id);
CREATE INDEX idx_creator_follows_creator_id ON public.creator_follows(creator_id);
CREATE INDEX idx_creator_follows_created_at ON public.creator_follows(created_at DESC);

-- Grant access to authenticated users
GRANT SELECT, INSERT, DELETE ON public.creator_follows TO authenticated;
