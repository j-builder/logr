import { create } from "zustand";
import { load, Store } from "@tauri-apps/plugin-store";
import { Bookmark, NewBookmark } from "../types";

const STORE_FILE = "bookmarks.json";
const STORE_KEY = "bookmarks";

interface BookmarkStore {
  bookmarks: Bookmark[];
  isLoaded: boolean;
  loadBookmarks: () => Promise<void>;
  addBookmark: (bookmark: NewBookmark) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  updateBookmark: (id: string, updates: Partial<Pick<Bookmark, "alias" | "group" | "lastLine">>) => Promise<void>;
}

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load(STORE_FILE);
  }
  return storeInstance;
}

async function persist(bookmarks: Bookmark[]) {
  const store = await getStore();
  await store.set(STORE_KEY, bookmarks);
  await store.save();
}

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  bookmarks: [],
  isLoaded: false,

  loadBookmarks: async () => {
    if (get().isLoaded) return;
    try {
      const store = await getStore();
      const saved = await store.get<Bookmark[]>(STORE_KEY);
      set({ bookmarks: saved ?? [], isLoaded: true });
    } catch {
      set({ bookmarks: [], isLoaded: true });
    }
  },

  addBookmark: async (bookmarkData) => {
    if (get().bookmarks.some((bookmark) =>
      (bookmark.kind ?? "file") === (bookmarkData.kind ?? "file") &&
      bookmark.filePath === bookmarkData.filePath &&
      bookmark.sshConnectionId === bookmarkData.sshConnectionId
    )) return;
    const id = `bm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next = [...get().bookmarks, { ...bookmarkData, id }];
    set({ bookmarks: next });
    await persist(next);
  },

  removeBookmark: async (id) => {
    const next = get().bookmarks.filter((b) => b.id !== id);
    set({ bookmarks: next });
    await persist(next);
  },

  updateBookmark: async (id, updates) => {
    const next = get().bookmarks.map((b) => (b.id === id ? { ...b, ...updates } : b));
    set({ bookmarks: next });
    await persist(next);
  },
}));
