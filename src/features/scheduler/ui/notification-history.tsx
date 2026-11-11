"use client";

import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { subscribeToTaskUpdates } from "@/features/scheduler/events";
import type { TaskReminder } from "@/features/scheduler/types";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type NotificationHistoryPage = {
  items: TaskReminder[];
  hasMore: boolean;
  nextCursor: string | null;
};

type NotificationHistoryProps = {
  taskId: string;
  open: boolean;
  timeZone: string;
};

type ScrollSnapshot = {
  scrollTop: number;
  scrollHeight: number;
};

const FOCUS_REFRESH_MIN_INTERVAL_MS = 15_000;

function mergeHistoryItems(
  existing: TaskReminder[],
  incoming: TaskReminder[],
): TaskReminder[] {
  const itemsById = new Map(
    [...existing, ...incoming].map((item) => [item.id, item]),
  );
  return [...itemsById.values()].sort((left, right) => {
    const timeDifference =
      new Date(right.createdAt).getTime() -
      new Date(left.createdAt).getTime();
    return timeDifference || right.id.localeCompare(left.id);
  });
}

async function fetchNotificationPage(
  taskId: string,
  cursor: string | null,
  signal: AbortSignal,
): Promise<NotificationHistoryPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await fetch(
    `/api/tasks/${encodeURIComponent(taskId)}/notifications${query}`,
    { cache: "no-store", signal },
  );
  if (!response.ok) {
    throw new Error(
      `Could not load notification history (HTTP ${response.status})`,
    );
  }
  const page: NotificationHistoryPage = await response.json();
  return page;
}

export function NotificationHistory(props: NotificationHistoryProps) {
  return (
    <NotificationHistoryContent
      key={`${props.open}:${props.taskId}`}
      {...props}
    />
  );
}

function NotificationHistoryContent({
  taskId,
  open,
  timeZone,
}: NotificationHistoryProps) {
  const t = useTranslations("Form");
  const locale = useLocale();
  const [items, setItems] = useState<TaskReminder[]>([]);
  const [isLoading, setIsLoading] = useState(open);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refreshRequestSequence, setRefreshRequestSequence] = useState(0);
  const [initialRetrySequence, setInitialRetrySequence] = useState(0);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const itemsRef = useRef<TaskReminder[]>([]);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(false);
  const hasLoadedOlderPagesRef = useRef(false);
  const expandedRef = useRef(false);
  const initialLoadingRef = useRef(false);
  const olderLoadingRef = useRef(false);
  const refreshInProgressRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const requestGenerationRef = useRef(0);
  const activeControllersRef = useRef(new Set<AbortController>());
  const pendingScrollAdjustmentRef = useRef<ScrollSnapshot | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const historyRegionRef = useRef<HTMLDivElement>(null);
  const pendingDisclosureScrollAnchorRef = useRef<{
    container: HTMLFormElement;
    section: HTMLElement;
  } | null>(null);
  const taskUpdateTimeoutRef = useRef<number | null>(null);
  const historyRegionId = `notification-history-${taskId}`;

  useLayoutEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useLayoutEffect(() => {
    const anchor = pendingDisclosureScrollAnchorRef.current;
    if (!anchor) return;

    anchor.container.scrollTop +=
      anchor.section.getBoundingClientRect().top -
      anchor.container.getBoundingClientRect().top -
      anchor.container.clientTop;
    anchor.section.focus({ preventScroll: true });
    pendingDisclosureScrollAnchorRef.current = null;
  }, [expanded]);

  const refreshLatestPage = useCallback(async () => {
    if (!open) return;
    if (
      initialLoadingRef.current ||
      olderLoadingRef.current ||
      refreshInProgressRef.current
    ) {
      refreshPendingRef.current = true;
      return;
    }

    refreshInProgressRef.current = true;
    lastRefreshAtRef.current = Date.now();
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    activeControllersRef.current.add(controller);

    try {
      const page = await fetchNotificationPage(taskId, null, controller.signal);
      if (generation !== requestGenerationRef.current) return;

      const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      );
      if (expandedRef.current && viewport) {
        pendingScrollAdjustmentRef.current = {
          scrollTop: viewport.scrollTop,
          scrollHeight: viewport.scrollHeight,
        };
      }

      const mergedItems = mergeHistoryItems(itemsRef.current, page.items);
      itemsRef.current = mergedItems;
      setItems(mergedItems);

      if (!hasLoadedOlderPagesRef.current) {
        cursorRef.current = page.nextCursor;
        hasMoreRef.current = page.hasMore;
        setHasMore(page.hasMore);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(
          "Failed to refresh maintenance task notification history:",
          error,
        );
      }
    } finally {
      activeControllersRef.current.delete(controller);
      refreshInProgressRef.current = false;
      if (refreshPendingRef.current && !olderLoadingRef.current) {
        refreshPendingRef.current = false;
        setRefreshRequestSequence((sequence) => sequence + 1);
      }
    }
  }, [open, taskId]);

  const loadOlderPage = useCallback(async () => {
    const cursor = cursorRef.current;
    if (
      olderLoadingRef.current ||
      !hasMoreRef.current ||
      !cursor ||
      initialLoadingRef.current
    ) {
      return;
    }

    setExpanded(true);
    olderLoadingRef.current = true;
    setIsLoadingOlder(true);
    setOlderError(false);
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    activeControllersRef.current.add(controller);

    try {
      const page = await fetchNotificationPage(
        taskId,
        cursor,
        controller.signal,
      );
      if (generation !== requestGenerationRef.current) return;

      const mergedItems = mergeHistoryItems(itemsRef.current, page.items);
      itemsRef.current = mergedItems;
      cursorRef.current = page.nextCursor;
      hasMoreRef.current = page.hasMore;
      hasLoadedOlderPagesRef.current = true;
      setItems(mergedItems);
      setHasMore(page.hasMore);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(
        "Failed to load older maintenance task notifications:",
        error,
      );
      setOlderError(true);
    } finally {
      activeControllersRef.current.delete(controller);
      if (generation === requestGenerationRef.current) {
        olderLoadingRef.current = false;
        setIsLoadingOlder(false);
        if (refreshPendingRef.current) {
          refreshPendingRef.current = false;
          void refreshLatestPage();
        }
      }
    }
  }, [refreshLatestPage, taskId]);

  useEffect(() => {
    if (!open || refreshRequestSequence === 0) return;
    void refreshLatestPage();
  }, [open, refreshLatestPage, refreshRequestSequence]);

  useEffect(() => {
    if (!open) return;

    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    initialLoadingRef.current = true;
    lastRefreshAtRef.current = Date.now();
    const controller = new AbortController();
    activeControllersRef.current.add(controller);
    void fetchNotificationPage(taskId, null, controller.signal)
      .then((page) => {
        if (generation !== requestGenerationRef.current) return;

        const firstPage = mergeHistoryItems([], page.items);
        itemsRef.current = firstPage;
        cursorRef.current = page.nextCursor;
        hasMoreRef.current = page.hasMore;
        setItems(firstPage);
        setHasMore(page.hasMore);
        setOlderError(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error(
          "Failed to load maintenance task notification history:",
          error,
        );
        setInitialError(true);
      })
      .finally(() => {
        activeControllersRef.current.delete(controller);
        if (generation === requestGenerationRef.current) {
          initialLoadingRef.current = false;
          setIsLoading(false);
        }
      });
    const activeControllers = activeControllersRef.current;

    return () => {
      requestGenerationRef.current += 1;
      activeControllers.forEach((controller) => controller.abort());
      activeControllers.clear();
      initialLoadingRef.current = false;
      olderLoadingRef.current = false;
      refreshInProgressRef.current = false;
    };
  }, [initialRetrySequence, open, taskId]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = subscribeToTaskUpdates((updatedTaskId) => {
      if (updatedTaskId === taskId) {
        if (taskUpdateTimeoutRef.current !== null) {
          window.clearTimeout(taskUpdateTimeoutRef.current);
        }
        taskUpdateTimeoutRef.current = window.setTimeout(() => {
          taskUpdateTimeoutRef.current = null;
          void refreshLatestPage();
        }, 100);
      }
    });

    return () => {
      unsubscribe();
      if (taskUpdateTimeoutRef.current !== null) {
        window.clearTimeout(taskUpdateTimeoutRef.current);
        taskUpdateTimeoutRef.current = null;
      }
    };
  }, [open, refreshLatestPage, taskId]);

  useEffect(() => {
    if (
      open &&
      !isLoading &&
      refreshPendingRef.current &&
      !olderLoadingRef.current &&
      !refreshInProgressRef.current
    ) {
      refreshPendingRef.current = false;
      void refreshLatestPage();
    }
  }, [isLoading, open, refreshLatestPage]);

  useEffect(() => {
    if (!open) return;

    const refreshWhenVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefreshAtRef.current >=
          FOCUS_REFRESH_MIN_INTERVAL_MS
      ) {
        void refreshLatestPage();
      }
    };
    const intervalId = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [open, refreshLatestPage]);

  useLayoutEffect(() => {
    const snapshot = pendingScrollAdjustmentRef.current;
    if (!snapshot) return;

    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (viewport) {
      viewport.scrollTop =
        snapshot.scrollTop + viewport.scrollHeight - snapshot.scrollHeight;
    }
    pendingScrollAdjustmentRef.current = null;
  }, [items]);

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;

    const updateFades = () => {
      const hasOverflow = viewport.scrollHeight > viewport.clientHeight + 1;
      setShowTopFade(hasOverflow && viewport.scrollTop > 1);
      setShowBottomFade(
        hasOverflow &&
          viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop >
            1,
      );
    };

    updateFades();
    viewport.addEventListener("scroll", updateFades, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateFades);
    resizeObserver?.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver?.observe(viewport.firstElementChild);
    }

    return () => {
      viewport.removeEventListener("scroll", updateFades);
      resizeObserver?.disconnect();
    };
  }, [expanded, isLoadingOlder, items.length]);

  const visibleItems = expanded ? items : items.slice(0, 5);
  const canExpand = items.length > 5 || hasMore;
  const historyList = (
    <ItemGroup
      aria-label={t("notifications.historyTitle")}
      className="gap-2"
    >
      {visibleItems.map((reminder) => {
        const statusLabel = {
          PENDING: t("reminders.statusPending"),
          SENDING: t("reminders.statusSending"),
          SENT: t("reminders.statusSent"),
          FAILED: t("reminders.statusFailed"),
          CANCELLED: t("reminders.statusCancelled"),
        }[reminder.status];
        const eventDate = new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        }).format(new Date(reminder.sentAt ?? reminder.scheduledFor));
        const notificationTypeLabel = {
          ASSIGNMENT: t("notifications.assignment"),
          REMINDER: t("notifications.reminder"),
          MANUAL: t("notifications.manual"),
        }[reminder.notificationType];
        const isManual = reminder.notificationType === "MANUAL";

        return (
          <Item
            key={reminder.id}
            role="listitem"
            variant="outline"
            size="sm"
            className="items-start gap-3"
          >
            <ItemContent className="min-w-0 gap-1">
              <ItemTitle className="flex-wrap">
                {reminder.worker.name}
                <Badge variant={isManual ? "secondary" : "outline"}>
                  {t(
                    isManual
                      ? "notifications.manualBadge"
                      : "notifications.automaticBadge",
                  )}
                </Badge>
              </ItemTitle>
              <ItemDescription className="line-clamp-none">
                {notificationTypeLabel} ·{" "}
                {t(
                  reminder.sentAt
                    ? "notifications.sentAt"
                    : "reminders.scheduledFor",
                  { date: eventDate },
                )}
              </ItemDescription>
              {reminder.status === "FAILED" && reminder.lastError ? (
                <ItemDescription className="break-words line-clamp-2">
                  {t("notifications.failureDetails", {
                    message: reminder.lastError,
                  })}
                </ItemDescription>
              ) : null}
            </ItemContent>
            <ItemActions className="self-start">
              <Badge
                variant={
                  reminder.status === "FAILED"
                    ? "destructive"
                    : reminder.status === "SENT"
                      ? "secondary"
                      : "outline"
                }
              >
                {statusLabel}
              </Badge>
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );

  if (!open) return null;

  return (
    <div className="flex flex-col gap-3">
      {isLoading ? (
        <div
          aria-label={t("notifications.loadingHistory")}
          aria-live="polite"
          className="flex flex-col gap-2"
          role="status"
        >
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-36 max-w-full" />
                <Skeleton className="h-3 w-52 max-w-full" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0" />
            </div>
          ))}
        </div>
      ) : initialError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("notifications.historyLoadFailure")}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLoading(true);
                setInitialError(false);
                setInitialRetrySequence((sequence) => sequence + 1);
              }}
              disabled={isLoading}
            >
              {t("notifications.tryAgain")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <Empty className="flex-none gap-1 rounded-md border-0 p-4">
          <EmptyHeader>
            <EmptyTitle className="text-sm">
              {t("notifications.historyEmpty")}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div
            ref={historyRegionRef}
            id={historyRegionId}
            aria-busy={isLoadingOlder}
            className="min-w-0"
          >
            {expanded ? (
              <div ref={scrollAreaRef} className="relative">
                <ScrollArea
                  role="region"
                  aria-label={t("notifications.historyTitle")}
                  className="h-[min(24rem,50vh)] min-h-40 overscroll-contain [&_[data-slot=scroll-area-viewport]]:overscroll-contain"
                >
                  {historyList}
                </ScrollArea>
                {showTopFade ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-background to-transparent"
                  />
                ) : null}
                {showBottomFade ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-background to-transparent"
                  />
                ) : null}
              </div>
            ) : (
              historyList
            )}
          </div>
          {olderError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>{t("notifications.historyLoadFailure")}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadOlderPage()}
                  disabled={isLoadingOlder}
                >
                  {isLoadingOlder ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : null}
                  {t(
                    isLoadingOlder
                      ? "notifications.loadingHistory"
                      : "notifications.tryAgain",
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {expanded && hasMore && !olderError ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-controls={historyRegionId}
                aria-expanded={expanded}
                aria-busy={isLoadingOlder}
                disabled={isLoadingOlder || isLoading}
                onClick={() => void loadOlderPage()}
              >
                {isLoadingOlder ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : null}
                {t(
                  isLoadingOlder
                    ? "notifications.loadingHistory"
                    : "notifications.loadOlder",
                )}
              </Button>
            ) : null}
            {canExpand ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-controls={historyRegionId}
                aria-expanded={expanded}
                onClick={(event) => {
                  const section = historyRegionRef.current?.closest(
                    "[data-notification-history-section]",
                  );
                  const container = event.currentTarget.closest("form");
                  if (section instanceof HTMLElement && container) {
                    pendingDisclosureScrollAnchorRef.current = {
                      container,
                      section,
                    };
                  }

                  if (expanded) {
                    setShowTopFade(false);
                    setShowBottomFade(false);
                    setExpanded(false);
                    return;
                  }

                  setExpanded(true);
                  if (hasMoreRef.current && !hasLoadedOlderPagesRef.current) {
                    void loadOlderPage();
                  }
                }}
              >
                {t(
                  expanded
                    ? "notifications.showLess"
                    : "notifications.seeMore",
                )}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
