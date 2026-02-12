
-- Create datasets table
CREATE TABLE public.datasets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source_filename TEXT NOT NULL,
  column_schema JSONB NOT NULL DEFAULT '[]',
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'complete', 'error')),
  error_message TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create records table
CREATE TABLE public.records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast queries by dataset
CREATE INDEX idx_records_dataset_id ON public.records(dataset_id);

-- Index for soft delete filtering
CREATE INDEX idx_datasets_deleted_at ON public.datasets(deleted_at);

-- Enable RLS
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- Permissive policies for single-user mode (no auth)
CREATE POLICY "Allow all access to datasets" ON public.datasets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to records" ON public.records FOR ALL USING (true) WITH CHECK (true);
