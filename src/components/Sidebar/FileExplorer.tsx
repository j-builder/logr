import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../../i18n";

interface DirectoryListing {
  parent: string | null;
  entries: { name: string; path: string; relativePath: string; isDirectory: boolean }[];
  partial: boolean;
}

interface Props {
  folder: string | null;
  bookmarked: boolean;
  onChoose: () => void;
  onNavigate: (path: string) => void;
  onBookmark: (path: string) => void;
  onOpenFile: (path: string) => void;
}

export default function FileExplorer({ folder, bookmarked, onChoose, onNavigate, onBookmark, onOpenFile }: Props) {
  const t = useT();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!folder) return;
    let current = true;
    setListing(null);
    setError("");
    invoke<DirectoryListing>("browse_directory", { path: folder, query })
      .then((result) => { if (current) setListing(result); })
      .catch((cause) => { if (current) setError(String(cause)); });
    return () => { current = false; };
  }, [folder, query, revision]);

  return (
    <section aria-label={t("sidebar.explorer")} className="flex flex-col flex-1 min-h-0 text-xs">
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-border">
        <button className="rounded bg-bg-tertiary px-2 py-1 hover:text-accent" onClick={onChoose}>{t("explorer.choose")}</button>
        {folder && <>
          <button disabled={!listing?.parent} onClick={() => listing?.parent && onNavigate(listing.parent)}
            title={t("explorer.parent")} aria-label={t("explorer.parent")} className="px-1 disabled:opacity-30">↑</button>
          <button onClick={() => setRevision((value) => value + 1)} title={t("explorer.refresh")}
            aria-label={t("explorer.refresh")} className="px-1">↻</button>
          <button onClick={() => onBookmark(folder)} disabled={bookmarked || !listing}
            title={bookmarked ? t("sidebar.alreadyBookmarked") : t("explorer.bookmark")}
            aria-label={t("explorer.bookmark")} className="px-1 text-accent disabled:opacity-50">{bookmarked ? "★" : "☆"}</button>
        </>}
      </div>
      {folder && <>
        <div title={folder} dir="auto" className="break-all select-text px-2 pt-2 text-text-secondary">{folder}</div>
        <form className="flex gap-1 p-2" onSubmit={(event) => { event.preventDefault(); setQuery(input.trim()); }}>
          <input type="search" aria-label={t("explorer.search")} placeholder={t("explorer.search")}
            className="min-w-0 flex-1 rounded px-2 py-1 bg-bg-primary border border-border"
            value={input} onChange={(event) => { setInput(event.target.value); if (!event.target.value.trim()) setQuery(""); }} />
          <button className="px-1 text-accent">{t("explorer.find")}</button>
        </form>
        <div className="flex-1 overflow-auto min-h-0">
          {error ? <p role="alert" className="px-2 break-words text-red-400">{error}</p> :
            !listing ? <p role="status" className="px-2 text-text-secondary">{t("explorer.loading")}</p> : <>
              {listing.entries.length === 0 && <p className="px-2 text-text-secondary">
                {query ? t("search.noResults") : t("explorer.empty")}
              </p>}
              <ul>
                {listing.entries.map((entry) => (
                  <li key={entry.path}>
                    <button className="flex w-full items-start gap-2 py-1.5 px-2 text-left hover:bg-bg-tertiary"
                      title={entry.path} onClick={() => entry.isDirectory ? onNavigate(entry.path) : onOpenFile(entry.path)}>
                      <span aria-hidden="true">{entry.isDirectory ? "📁" : "📄"}</span>
                      <span className="min-w-0">
                        <span className="block truncate">{entry.name}</span>
                        {query && entry.relativePath !== entry.name && (
                          <span className="block break-all text-text-secondary">{entry.relativePath}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {listing.partial && <p role="status" className="p-2 text-text-secondary">{t("explorer.partial")}</p>}
            </>}
        </div>
      </>}
    </section>
  );
}
