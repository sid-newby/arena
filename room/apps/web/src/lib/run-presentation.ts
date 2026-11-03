import type { WorkflowSnapshot } from './run-workflow.ts';

export function runPresentation(workflow?: Pick<WorkflowSnapshot, 'phase' | 'task'>) {
  const configured = Boolean(workflow?.task);
  if (!workflow || !configured)
    return {
      configured: false,
      description:
        'Start a new debate by entering what A and B should work out. Add an evidence folder if they need local files.',
    };
  if (workflow.phase === 'draft' || workflow.phase === 'ready')
    return {
      configured: true,
      description:
        'You can adjust the question and settings before starting A and B.',
    };
  return {
    configured: true,
    description:
      'Review the configured debate and A and B’s recorded work with Maestro in private chat.',
  };
}
