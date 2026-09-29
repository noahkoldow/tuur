import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Interest, UiLanguage } from '@tuur/shared';
import { deviceLanguage, setLanguage } from '../i18n';

export type NarrationFrequency = 'low' | 'normal' | 'high';

export interface SettingsState {
  hydrated: boolean;
  onboarded: boolean;
  language: UiLanguage;
  interests: Interest[];
  frequency: NarrationFrequency;
  /** Consent state (spec 10): analytics is off until explicitly granted; ads consent is handled by Google UMP. */
  analyticsConsent: boolean;
  simulator: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'hydrated'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboarded: false,
      language: deviceLanguage(),
      interests: [],
      frequency: 'normal',
      analyticsConsent: false,
      simulator: false,
      set: (patch) => {
        if (patch.language) void setLanguage(patch.language);
        set(patch);
      },
    }),
    {
      name: 'tuur.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        onboarded: s.onboarded,
        language: s.language,
        interests: s.interests,
        frequency: s.frequency,
        analyticsConsent: s.analyticsConsent,
        simulator: s.simulator,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) void setLanguage(state.language);
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);
