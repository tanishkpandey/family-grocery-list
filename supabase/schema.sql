-- ==============================================================================
-- Family Grocery List - Supabase PostgreSQL Schema
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ==============================================================================

-- 1. Create grocery_lists table
CREATE TABLE IF NOT EXISTS public.grocery_lists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Family Grocery List',
  share_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create grocery_items table
CREATE TABLE IF NOT EXISTS public.grocery_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES public.grocery_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_grocery_lists_share_token ON public.grocery_lists(share_token);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_updated_at ON public.grocery_lists(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_grocery_items_list_id ON public.grocery_items(list_id);
CREATE INDEX IF NOT EXISTS idx_grocery_items_position ON public.grocery_items(list_id, position ASC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.grocery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;

-- 5. Create Public Access Policies (Allows anon & authenticated users full access)
DROP POLICY IF EXISTS "Public full access to grocery_lists" ON public.grocery_lists;
CREATE POLICY "Public full access to grocery_lists"
  ON public.grocery_lists
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public full access to grocery_items" ON public.grocery_items;
CREATE POLICY "Public full access to grocery_items"
  ON public.grocery_items
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 6. Enable Supabase Realtime for instant multi-user syncing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'grocery_lists'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.grocery_lists;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'grocery_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.grocery_items;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Realtime publication might not exist in local/mock environments, ignore error
    NULL;
END $$;

