import { create } from 'zustand';

/** Forces mounted offer views to refresh after a report/block without retaining report text. */
export const useContentReports = create<{ revision: number; refresh: () => void }>((set) => ({
  revision: 0,
  refresh: () => set((state) => ({ revision: state.revision + 1 })),
}));
