import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { AvatarState } from "./threebot/character";

const minute = 60_000;
const cheer = 3_600;

export function botAvatarActivity(
  thread: EnvironmentThreadShell | null,
  now: number,
  detail?: OrchestrationV2ThreadProjection,
): {
  state: AvatarState;
  until?: number;
} {
  if (!thread) return { state: "idle" };
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return { state: "waiting" };
  const status = thread.runtime?.status ?? thread.latestRun?.status;
  switch (status) {
    case "preparing":
    case "queued":
    case "starting":
      return { state: "receiving" };
    case "running": {
      if (thread.blockedOnThreadWait) return { state: "orbit" };
      const runId = thread.runtime?.activeRunId;
      const item =
        runId &&
        detail?.turnItems.findLast(
          (item) => item.runId === runId && ["pending", "running", "waiting"].includes(item.status),
        );
      switch (item && item.type) {
        case "reasoning":
          return { state: "thinking" };
        case "assistant_message":
        case "file_change":
          return { state: "writing" };
        case "web_search":
        case "file_search":
          return { state: "searching" };
        case "subagent":
          return { state: "orbit" };
        case "approval_request":
        case "user_input_request":
          return { state: "waiting" };
        default:
          return { state: "working" };
      }
    }
    case "waiting":
      return { state: "waiting" };
    case "failed":
      return { state: "failed" };
  }
  const completed = Date.parse(thread.latestRun?.completedAt ?? "");
  const started = Date.parse(thread.latestRun?.startedAt ?? "");
  if (thread.latestRun?.status === "completed" && now >= completed && now < completed + cheer) {
    return {
      state: completed - started >= 2 * minute ? "celebrate" : "happy",
      until: completed + cheer,
    };
  }
  const activity = Math.max(
    completed || 0,
    Date.parse(thread.latestUserMessageAt ?? "") || 0,
    Date.parse(thread.createdAt) || 0,
  );
  if (!activity) return { state: "idle" };
  if (now >= activity + 120 * minute) return { state: "sleeping" };
  if (now >= activity + 20 * minute) return { state: "drowsy", until: activity + 120 * minute };
  return { state: "idle", until: activity + 20 * minute };
}
