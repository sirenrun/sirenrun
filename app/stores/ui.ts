import { create } from "zustand";

interface UiState {
  drawerOpen: boolean;
  /** The player closed onboarding for this page load. */
  onboardingDismissed: boolean;
  setDrawer: (open: boolean) => void;
  dismissOnboarding: () => void;
}

export const useUi = create<UiState>((set) => ({
  drawerOpen: false,
  onboardingDismissed: false,
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  dismissOnboarding: () => set({ onboardingDismissed: true }),
}));
