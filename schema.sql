-- Tabla de flujos para wlo-flow
CREATE TABLE IF NOT EXISTS public.flows (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  title         text NOT NULL DEFAULT 'Nuevo flujo',
  description   text DEFAULT '',
  nodes         jsonb DEFAULT '[]'::jsonb,
  edges         jsonb DEFAULT '[]'::jsonb,
  shares        jsonb DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flows_workspace_idx
  ON public.flows (workspace_id, updated_at DESC);

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY flows_select_all ON public.flows
  FOR SELECT USING (true);
