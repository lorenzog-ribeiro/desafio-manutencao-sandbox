-- Script de inicialização do banco de dados (triage_db)
-- Executado automaticamente pelo EF Core no startup, ou manualmente caso desejado.

CREATE TABLE IF NOT EXISTS public.triage_jobs (
    "Id" uuid NOT NULL PRIMARY KEY,
    "EventId" character varying(200) NOT NULL,
    "Repository" character varying(250) NOT NULL,
    "IssueNumber" integer NOT NULL,
    "Title" character varying(500) NOT NULL,
    "Description" text NOT NULL,
    "Status" character varying(50) NOT NULL,
    proposal_category character varying(50),
    proposal_problem_summary text,
    proposal_suggested_action text,
    "CreatedAt" timestamp with time zone NOT NULL,
    "PublishedAt" timestamp with time zone,
    "FailureReason" character varying(1000)
);

-- Idempotência por EventId
CREATE UNIQUE INDEX IF NOT EXISTS "IX_triage_jobs_EventId" ON public.triage_jobs ("EventId");

-- Consulta rápida por repositório e issue
CREATE INDEX IF NOT EXISTS "IX_triage_jobs_Repository_IssueNumber" ON public.triage_jobs ("Repository", "IssueNumber");
