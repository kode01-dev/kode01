-- Create user_saved_items table
CREATE TABLE IF NOT EXISTS public.user_saved_items (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_id uuid NOT NULL,
    item_type text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, item_id)
);

-- Turn on RLS
ALTER TABLE public.user_saved_items ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own saved items"
    ON public.user_saved_items
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved items"
    ON public.user_saved_items
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved items"
    ON public.user_saved_items
    FOR DELETE
    USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_user_saved_items_user_id ON public.user_saved_items(user_id);
CREATE INDEX idx_user_saved_items_item_id ON public.user_saved_items(item_id);
