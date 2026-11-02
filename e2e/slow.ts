/** Wait budgets are for an idle laptop. The org-pool runners give each job 2 CPUs on a loaded VPS, so CI waits twice as long (#31). */
export const slow = (ms: number): number => (process.env.CI ? ms * 2 : ms);
