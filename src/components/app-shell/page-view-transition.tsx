import { ViewTransition, type ReactNode } from "react";

export function PageViewTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter="route-enter"
      exit="route-exit"
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
