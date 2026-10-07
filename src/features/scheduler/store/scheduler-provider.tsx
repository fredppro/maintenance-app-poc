"use client";

import { createContext, ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";
import {
  createSchedulerStore,
  SchedulerInitialState,
  SchedulerState,
  SchedulerStore,
} from "./scheduler-store";

const SchedulerStoreContext = createContext<SchedulerStore | null>(null);

interface SchedulerStoreProviderProps {
  children: ReactNode;
  initialState?: SchedulerInitialState;
}

export function SchedulerStoreProvider({
  children,
  initialState,
}: SchedulerStoreProviderProps) {
  const [store] = useState(() => createSchedulerStore(initialState));

  return (
    <SchedulerStoreContext.Provider value={store}>
      {children}
    </SchedulerStoreContext.Provider>
  );
}

export function useSchedulerStore<T>(
  selector: (state: SchedulerState) => T,
): T {
  const store = useContext(SchedulerStoreContext);

  if (!store) {
    throw new Error(
      "useSchedulerStore must be used within SchedulerStoreProvider",
    );
  }

  return useStore(store, selector);
}
