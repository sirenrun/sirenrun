import { create } from "zustand";

interface UiState {
  drawerOpen: boolean;
  /** The player closed onboarding for this page load. */
  onboardingDismissed: boolean;
  /** A run's results card is on screen; the idle Drive panel waits until it is closed. */
  resultsOpen: boolean;
  setDrawer: (open: boolean) => void;
  setResultsOpen: (open: boolean) => void;
  dismissOnboarding: () => void;
}

export const useUi = create<UiState>((set) => ({
  drawerOpen: false,
  onboardingDismissed: false,
  resultsOpen: false,
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  setResultsOpen: (resultsOpen) => set({ resultsOpen }),
  dismissOnboarding: () => set({ onboardingDismissed: true }),
}));
