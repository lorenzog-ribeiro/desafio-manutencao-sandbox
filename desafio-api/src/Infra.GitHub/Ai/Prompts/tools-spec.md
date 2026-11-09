# Tool Calling Specifications (Triage Harness)

Abaixo estão as ferramentas expostas aos agentes para execução via Function Calling:

## 1. `flag_human_review`
Acionada quando os dados da issue forem insuficientes, ambíguos ou requererem decisão humana manual.
- **Parâmetros**:
  - `reason` (string, obrigatório): Motivo detalhado pelo qual a intervenção humana é necessária.
  - `missing_information` (string, obrigatório): Lista do que falta (ex: logs, passos para reproduzir, versão do ambiente).

## 2. `propose_triage_solution`
Acionada quando o diagnóstico da issue estiver concluído e respaldado por evidências.
- **Parâmetros**:
  - `category` (string, obrigatório, enum: "Bug", "Melhoria", "Duvida"): Categoria final da issue.
  - `problem_summary` (string, obrigatório): Síntese técnica do problema ou necessidade.
  - `suggested_action` (string, obrigatório): Passos recomendados para resolução e testes.
  - `requires_human_review` (boolean, obrigatório): Indica se ainda há dependência de revisão manual.

## 3. `request_reproduction_details`
Acionada especificamente em bugs sem evidência clara.
- **Parâmetros**:
  - `questions` (array de strings, obrigatório): Perguntas pontuais para o autor da issue.
