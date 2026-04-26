import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSessions } from "@/lib/use-sessions";
import { cn } from "@/lib/utils";

interface TabSidebarProps {
  onNew: () => void;
}

const lastPathSegment = (cwd: string): string => {
  if (!cwd) return "";
  const trimmed = cwd.replace(/\/+$/, "");
  const segment = trimmed.split("/").pop();
  return segment || trimmed || "/";
};

const TAB_TRIGGER_BASE = cn(
  "relative flex h-auto min-h-[30px] w-full flex-none basis-auto justify-start gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[13px] font-normal whitespace-nowrap shadow-none transition-colors",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  "text-(--term-rail-foreground)",
  "hover:bg-(--term-rail-hover) hover:text-(--term-rail-foreground-strong) data-[state=active]:bg-(--term-rail-active) data-[state=active]:font-medium data-[state=active]:text-(--term-rail-foreground-strong) data-[state=active]:shadow-none dark:hover:bg-(--term-rail-hover) dark:hover:text-(--term-rail-foreground-strong) dark:data-[state=active]:bg-(--term-rail-active) dark:data-[state=active]:text-(--term-rail-foreground-strong)",
);

export const TabSidebar = ({ onNew }: TabSidebarProps) => {
  const sessions = useSessions((state) => state.sessions);
  const remove = useSessions((state) => state.remove);

  const canClose = sessions.length > 1;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-(--term-rail) text-(--term-rail-foreground)">
      <div className="flex shrink-0 flex-col gap-0.5 px-2 pt-2 pb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onNew}
              aria-label="new tab"
              className="h-auto min-h-[30px] justify-start gap-2 rounded-md px-2 py-1.5 text-[13px] font-normal text-(--term-rail-foreground) hover:bg-(--term-rail-hover) hover:text-(--term-rail-foreground-strong)"
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              <span className="flex-1">new terminal</span>
              <span className="text-[11px] text-(--term-rail-muted)">⌥⌘T</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            new tab — ⌥⌘T
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-y-auto">
          <TabsList
            variant="line"
            className="flex h-auto w-full flex-col items-stretch gap-px rounded-none bg-transparent px-1.5 pt-1 pb-3"
          >
            {sessions.map((session) => {
              const label = session.title || "shell";
              const meta = lastPathSegment(session.cwd);
              return (
                <ContextMenu key={session.id}>
                  <Tooltip>
                    <ContextMenuTrigger asChild>
                      <TooltipTrigger asChild>
                        <TabsTrigger
                          value={session.id}
                          onAuxClick={(event) => {
                            if (event.button === 1 && canClose) {
                              event.preventDefault();
                              void remove(session.id);
                            }
                          }}
                          className={cn(
                            TAB_TRIGGER_BASE,
                            "group/row",
                            session.exited && "italic opacity-60",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                          {meta && meta !== label ? (
                            <span
                              className={cn(
                                "shrink-0 truncate text-[11px] text-(--term-rail-muted) transition-opacity",
                                canClose && "group-hover/row:opacity-0",
                              )}
                              style={{ maxWidth: "5rem" }}
                            >
                              {meta}
                            </span>
                          ) : null}
                          {canClose ? (
                            <span
                              role="button"
                              tabIndex={-1}
                              aria-label={`close ${label}`}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                void remove(session.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void remove(session.id);
                                }
                              }}
                              className="absolute right-1.5 inline-flex size-4 items-center justify-center rounded text-(--term-rail-muted) opacity-0 transition-opacity hover:bg-white/10 hover:text-(--term-rail-foreground-strong) focus-visible:opacity-100 group-hover/row:opacity-100"
                            >
                              <X aria-hidden="true" className="size-3" />
                            </span>
                          ) : null}
                        </TabsTrigger>
                      </TooltipTrigger>
                    </ContextMenuTrigger>
                    <TooltipContent side="right" className="font-mono text-xs">
                      <div>{session.cwd}</div>
                      <div className="text-muted-foreground">{session.shell}</div>
                    </TooltipContent>
                  </Tooltip>
                  <ContextMenuContent className="font-mono text-xs">
                    <ContextMenuItem disabled={!canClose} onSelect={() => void remove(session.id)}>
                      close tab
                      <ContextMenuShortcut>⌥⌘W</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={onNew}>
                      new tab
                      <ContextMenuShortcut>⌥⌘T</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem disabled className="text-muted-foreground">
                      <span className="truncate">{session.cwd}</span>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </TabsList>
        </div>
      </div>
    </aside>
  );
};
