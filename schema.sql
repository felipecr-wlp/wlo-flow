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
  updated_at    timestamptz NOT NULL DEFAULT now(),
  owner         text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS flows_workspace_idx
  ON public.flows (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS flows_owner_idx
  ON public.flows (workspace_id, owner);

ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;

-- Los flujos son privados por usuario: cada uno ve los suyos mas los que le
-- comparten (el `shares` jsonb). El acceso se decide en las APIs, que usan el
-- service role e ignoran RLS. Para cualquiera que tenga la key publica y lea
-- la tabla directo, queda cerrada por defecto: sin policy de SELECT no se ve
-- nada. No hay auth en esta base, asi que RLS no puede expresar "el dueno".
