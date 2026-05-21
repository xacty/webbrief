import { z } from 'zod';
import { projectId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { savePreview } from '../lib/previewStore.js';

export const name = 'brief.previewPrefill';

export const description =
  'Loads an existing brief project, extracts its questions, and returns them alongside ' +
  "the raw content the client wants to map onto them. Does NOT call an LLM — the client " +
  'is expected to build the response mapping from the questions + content and then apply it ' +
  '(Fase 3 / pages.applyEdits will provide the apply step). ' +
  'Verifies that the project is of type `brief` before returning.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the brief project to prefill'),
  content: z
    .string()
    .min(1)
    .max(200_000)
    .describe('Raw content the client will map onto brief questions'),
});

// Question types that can be auto-answered by the client. `section_header` and
// `file_upload` are excluded per the v1 validation rules in WEBRIEF_MCP_PLAN.
const ANSWERABLE_TYPES = new Set(['short_text', 'long_text', 'single_choice', 'multiple_choice']);

function extractBriefQuestions(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  // The brief lives on the first page, in content_json.questions.
  const first = pages[0];
  const contentJson = first?.contentJson ?? first?.content_json;
  const questions = contentJson?.questions;
  if (!Array.isArray(questions)) return [];
  return questions;
}

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  let data;
  try {
    data = await get(`/projects/${input.projectId}`);
  } catch (error) {
    return mapBackendError(error, input.projectId);
  }

  const project = data?.project;
  if (!project) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'project_not_found',
        message: `Project ${input.projectId} was not found.`,
      },
    };
  }

  if (project.projectType !== 'brief' && project.project_type !== 'brief') {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'invalid_project_type',
        message:
          `Project ${input.projectId} is of type '${project.projectType ?? project.project_type}', ` +
          'not brief. brief.previewPrefill only operates on brief projects.',
      },
    };
  }

  if (project.archivedAt ?? project.archived_at) {
    return notMutatingError('archived');
  }
  if (project.trashedAt ?? project.trashed_at) {
    return notMutatingError('trashed');
  }

  const questions = extractBriefQuestions(data?.pages);
  const answerable = questions.filter((q) => ANSWERABLE_TYPES.has(q.type));
  const sectionHeaders = questions.filter((q) => q.type === 'section_header');

  const { previewId, expiresAt } = savePreview('brief_prefill', {
    projectId: input.projectId,
    content: input.content,
    questionIds: answerable.map((q) => q.id),
  });

  return {
    status: 'ok',
    tool: name,
    previewId,
    expiresAt,
    project: {
      id: project.id,
      name: project.name,
      projectType: project.projectType ?? project.project_type,
    },
    questions: answerable.map((q) => ({
      id: q.id,
      type: q.type,
      label: q.label,
      hint: q.hint ?? '',
      required: q.required !== false,
      options: Array.isArray(q.options) ? q.options : [],
    })),
    sections: sectionHeaders.map((s) => ({ id: s.id, label: s.label })),
    content: input.content,
    notes: {
      answerableTypes: Array.from(ANSWERABLE_TYPES),
      excludedFromPrefill:
        'file_upload and section_header questions are out of scope for prefill in v1.',
    },
  };

  function notMutatingError(state) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'project_not_mutable',
        message: `Project ${input.projectId} is ${state}. The MCP cannot operate on it.`,
      },
    };
  }
}

function mapBackendError(error, contextId) {
  if (error.status === 401 || error.status === 403) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_unauthorized',
        message:
          'The MCP token was rejected by the backend. ' +
          'Make sure the token is valid and has not been revoked.',
        backendStatus: error.status,
      },
    };
  }
  if (error.status === 404) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'project_not_found',
        message: `Project ${contextId} was not found or you do not have access to it.`,
        backendStatus: 404,
      },
    };
  }
  return {
    status: 'error',
    tool: name,
    error: {
      code: 'backend_error',
      message: error.message ?? 'Unexpected error preparing brief prefill preview.',
      backendStatus: error.status ?? null,
    },
  };
}
