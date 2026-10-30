import type { WorkflowSnapshot } from './run-workflow.ts';

export function runPresentation(workflow?: Pick<WorkflowSnapshot, 'phase' | 'task'>) {
  const configured = Boolean(workflow?.task);
  if (!workflow || !configured)
    return {
      configured: false,
      description:
        'Start a new debate. Tell Maestro what A and B should work out, then define an acceptable outcome together.',
    };
  if (workflow.phase === 'draft' || workflow.phase === 'ready')
    return {
      configured: true,
      description:
        'Review the debate question, success criteria, and setup with Maestro before starting A and B.',
    };
  return {
    configured: true,
    description:
      'Review the configured debate and A and B’s recorded work with Maestro in private chat.',
  };
}
