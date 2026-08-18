import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type ThemeMode = "system" | "light" | "dark";

type DashboardUiState = {
  activeTab: string;
  selectedDriverId: string;
  watchlist: string[];
  scrubIndex: number;
  isTelemetryPlaying: boolean;
  themeMode: ThemeMode;
  visualTheme: string;
};

const initialState: DashboardUiState = {
  activeTab: "overview",
  selectedDriverId: "",
  watchlist: [],
  scrubIndex: 0,
  isTelemetryPlaying: true,
  themeMode: "system",
  visualTheme: "f1",
};

const dashboardUiSlice = createSlice({
  name: "dashboardUi",
  initialState,
  reducers: {
    hydratePreferences(state, action: PayloadAction<Partial<DashboardUiState>>) {
      Object.assign(state, action.payload);
    },
    setActiveTab(state, action: PayloadAction<string>) {
      state.activeTab = action.payload;
    },
    setSelectedDriverId(state, action: PayloadAction<string>) {
      state.selectedDriverId = action.payload;
    },
    toggleWatchlist(state, action: PayloadAction<string>) {
      const next = new Set(state.watchlist);
      if (next.has(action.payload)) {
        next.delete(action.payload);
      } else {
        next.add(action.payload);
      }
      state.watchlist = Array.from(next);
    },
    setScrubIndex(state, action: PayloadAction<number>) {
      state.scrubIndex = action.payload;
    },
    setTelemetryPlaying(state, action: PayloadAction<boolean>) {
      state.isTelemetryPlaying = action.payload;
    },
    setVisualTheme(state, action: PayloadAction<string>) {
      state.visualTheme = action.payload;
    },
    cycleThemeMode(state) {
      state.themeMode =
        state.themeMode === "system"
          ? "light"
          : state.themeMode === "light"
            ? "dark"
            : "system";
    },
  },
});

export const {
  cycleThemeMode,
  hydratePreferences,
  setActiveTab,
  setScrubIndex,
  setSelectedDriverId,
  setTelemetryPlaying,
  setVisualTheme,
  toggleWatchlist,
} = dashboardUiSlice.actions;

export const dashboardUiReducer = dashboardUiSlice.reducer;
export type { DashboardUiState, ThemeMode };
