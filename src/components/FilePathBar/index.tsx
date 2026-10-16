import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../../stores/tabStore";
import { useSettingsStore } from "../../stores/settingsStore";

export default function FilePathBar() {
  const { tabs, activeTabId, addTab } = useTabStore();
  const { language, sidebarHidden, setSidebarHidden } = useSettingsStore();
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const ko = language === "ko";
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const currentPath = activeTab?.filePath ?? "";

  useEffect(() => { setCopied(false); }, [currentPath, activeTabId]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const openPath = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = path.trim();
    const filePath = ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1) : trimmed;
    if (!filePath) return;
    setBusy(true);
    setError("");
    try {
      const encoding = await invoke<string>("detect_encoding", { path: filePath });
      addTab({ filePath, alias: filePath.split(/[\\/]/).pop() ?? filePath, encoding, isFollowing: true });
      setPath("");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(currentPath);
      setCopied(true);
      setError("");
    } catch (err) {
      setError(`${ko ? "경로 복사 실패" : "Could not copy path"}: ${String(err)}`);
    }
  };

  return (
    <div className="shrink-0 text-xs" style={{ backgroundColor: "var(--color-bg-secondary)", borderBottom: "1px solid var(--color-border)" }}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button type="button" className="shrink-0 w-7 h-7 rounded hover:opacity-80"
          aria-label={ko ? (sidebarHidden ? "파일 목록 표시" : "파일 목록 숨기기") : (sidebarHidden ? "Show file list" : "Hide file list")}
          title={ko ? (sidebarHidden ? "파일 목록 표시" : "파일 목록 숨기기") : (sidebarHidden ? "Show file list" : "Hide file list")}
          aria-pressed={!sidebarHidden} onClick={() => setSidebarHidden(!sidebarHidden)}
          style={{ color: "var(--color-accent)", backgroundColor: "var(--color-bg-tertiary)", fontSize: 18 }}>
          {sidebarHidden ? "\u25b8" : "\u25c2"}
        </button>
        <form onSubmit={openPath} className="flex flex-1 min-w-0 items-center gap-2">
          <input value={path} onChange={(event) => { setPath(event.target.value); setError(""); }}
            aria-label={ko ? "열 로그파일 경로" : "Log file path to open"}
            placeholder={ko ? "로그파일 경로" : "Log file path"}
            className="flex-1 min-w-0 h-7 px-2 rounded"
            style={{ backgroundColor: "var(--color-bg-primary)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }} />
          <button type="submit" disabled={busy || !path.trim()} className="shrink-0 h-7 px-3 rounded disabled:opacity-40 hover:opacity-80"
            style={{ backgroundColor: "var(--color-accent)", color: "#ffffff" }}>
            {busy ? (ko ? "여는 중..." : "Opening...") : (ko ? "열기" : "Open")}
          </button>
        </form>
      </div>
      {activeTab && (
        <div className="flex items-center gap-2 px-3 pb-1.5 min-w-0">
          {activeTab.sshConnectionId && <span className="shrink-0" style={{ color: "var(--color-accent)" }}>SSH</span>}
          <input readOnly value={currentPath} aria-label={ko ? "현재 파일 경로" : "Current file path"} title={currentPath}
            className="flex-1 min-w-0 h-6 select-text" style={{ background: "transparent", color: "var(--color-text-secondary)", border: 0 }} />
          <button type="button" onClick={copyPath} className="shrink-0 w-7 h-6 rounded hover:opacity-80"
            aria-label={ko ? "경로 복사" : "Copy path"} title={copied ? (ko ? "복사됨" : "Copied") : (ko ? "경로 복사" : "Copy path")}
            style={{ color: "var(--color-accent)", fontSize: 16 }}>
            {copied ? "\u2713" : "\u2398"}
          </button>
          <span role="status" className="sr-only">{copied ? (ko ? "경로 복사됨" : "Path copied") : ""}</span>
        </div>
      )}
      {error && <div role="alert" className="px-3 pb-2 break-words" style={{ color: "#f87171" }}>{error}</div>}
    </div>
  );
}
