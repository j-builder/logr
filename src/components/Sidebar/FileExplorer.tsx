import { useEffect, useState } from "react";
import { resolve } from "@tauri-apps/api/path";
import type { Bookmark } from "../../types";
import { invoke } from "@tauri-apps/api/core";
import { useT } from "../../i18n";

interface DirectoryListing {
  directory: string;
  parent: string | null;
  entries: { name: string; path: string; relativePath: string; isDirectory: boolean }[];
  partial: boolean;
}

interface ExplorerLocations {
  home: string;
  roots: string[];
}

interface Props {
  folder: string | null;
  bookmarks: Bookmark[];
  activeFile?: string;
  onNavigate: (path: string | null) => void;
  onBookmark: (path: string) => void;
  onOpenFile: (path: string) => void;
}

export default function FileExplorer({ folder, bookmarks, activeFile, onNavigate, onBookmark, onOpenFile }: Props) {
  const t = useT();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [locations, setLocations] = useState<ExplorerLocations | null>(null);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [error, setError] = useState("");

  const [address, setAddress] = useState<string | null>(null);
  const [addressError, setAddressError] = useState("");
  const [opening, setOpening] = useState(false);
  const directory = listing?.directory ?? folder;
  const bookmarked = bookmarks.some((bm) => bm.kind === "folder" && bm.filePath === directory);

  const selectEntry = (path: string, isDirectory: boolean) => {
    if (isDirectory) {
      setAddress(null);
      setQuery("");
      setInput("");
      onNavigate(path);
    } else {
      onOpenFile(path);
    }
  };

  const openAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = (address ?? directory ?? "").trim();
    if (!value || opening) return;
    setOpening(true);
    setAddressError("");
    try {
      const base = directory ?? locations?.home;
      const path = base ? await resolve(base, value) : await resolve(value);
      const isDirectory = await invoke<boolean>("explorer_is_directory", { path });
      selectEntry(path, isDirectory);
      setAddress(null);
    } catch (cause) {
      setAddressError(String(cause));
    } finally {
      setOpening(false);
    }
  };

  useEffect(() => {
    let current = true;
    setListing(null);
    setError("");
    const request = folder === null
      ? invoke<ExplorerLocations>("explorer_locations").then((result) => { if (current) setLocations(result); })
      : invoke<DirectoryListing>("browse_directory", { path: folder, query }).then((result) => { if (current) setListing(result); });
    request.catch((cause) => { if (current) setError(String(cause)); });
    return () => { current = false; };
  }, [folder, query, revision]);

  return (
    <section aria-label={t("sidebar.explorer")} className="flex flex-col flex-1 min-h-0 text-xs">
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-border">
        {folder ? <button className="text-accent" onClick={() => onNavigate(null)}>{t("explorer.locations")}</button>
          : <span className="font-medium">{t("explorer.locations")}</span>}
        {folder && <button disabled={!listing?.parent} onClick={() => listing?.parent && onNavigate(listing.parent)}
          title={t("explorer.parent")} aria-label={t("explorer.parent")} className="px-1 disabled:opacity-30">↑</button>}
        <button onClick={() => setRevision((value) => value + 1)} title={t("explorer.refresh")}
          aria-label={t("explorer.refresh")} className="px-1">↻</button>
        {folder && <button onClick={() => directory && onBookmark(directory)} disabled={bookmarked || !listing}
          title={bookmarked ? t("sidebar.alreadyBookmarked") : t("explorer.bookmark")}
          aria-label={t("explorer.bookmark")} className="px-1 text-accent disabled:opacity-50">{bookmarked ? "★" : "☆"}</button>}
      </div>
      <form className="flex gap-1 px-2 pt-2" onSubmit={openAddress}>
        <input aria-label={t("explorer.location")} placeholder={t("explorer.location")} title={directory ?? undefined}
          className="min-w-0 flex-1 rounded px-2 py-1 bg-bg-primary border border-border"
          value={address ?? directory ?? ""} onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => { setAddress(event.target.value); setAddressError(""); }} />
        <button className="px-1 text-accent disabled:opacity-40" disabled={opening}>{t("explorer.open")}</button>
      </form>
      {addressError && <p role="alert" className="px-2 break-words text-red-400">{addressError}</p>}
      {folder && <form className="flex gap-1 p-2" onSubmit={(event) => { event.preventDefault(); setQuery(input.trim()); }}>
        <input type="search" aria-label={t("explorer.search")} placeholder={t("explorer.search")}
          className="min-w-0 flex-1 rounded px-2 py-1 bg-bg-primary border border-border"
          value={input} onChange={(event) => { setInput(event.target.value); if (!event.target.value.trim()) setQuery(""); }} />
        <button className="px-1 text-accent">{t("explorer.find")}</button>
      </form>}
      <div className="flex-1 overflow-auto min-h-0">
        {error ? <p role="alert" className="px-2 break-words text-red-400">{error}</p> :
          folder === null && locations ? (
            <ul className="py-1">
              {[locations.home, ...locations.roots].map((path, index) => (
                <li key={index === 0 ? "home" : path}>
                  <button className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-bg-tertiary"
                    title={path} onClick={() => onNavigate(path)}>
                    <span aria-hidden="true">📁</span>
                    <span className="truncate">{index === 0 ? t("explorer.home") : path}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : !listing ? <p role="status" className="px-2 text-text-secondary">{t("explorer.loading")}</p> : <>
            {listing.entries.length === 0 && <p className="px-2 text-text-secondary">
              {query ? t("search.noResults") : t("explorer.empty")}
            </p>}
            <ul>
              {listing.entries.map((entry) => (
                <li key={entry.path}>
                  <button className="flex w-full items-start gap-2 py-1.5 px-2 text-left hover:bg-bg-tertiary aria-current:bg-bg-tertiary aria-current:text-accent"
                    title={entry.path} aria-current={!entry.isDirectory && activeFile === entry.path ? "true" : undefined}
                    onClick={() => selectEntry(entry.path, entry.isDirectory)}>
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
    </section>
  );
}
