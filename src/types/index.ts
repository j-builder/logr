export interface LogLine {
  index: number;
  content: string;
  raw: string;
  level?: "ERROR" | "WARN" | "INFO" | "DEBUG";
  timestamp?: string;
}

export interface HighlightRule {
  pattern: string;
  color: string;
  isRegex: boolean;
}

export interface Tab {
  id: string;
  filePath: string;
  alias: string;
  encoding: string;
  isFollowing: boolean;
  scrollPosition: number;
  highlights: HighlightRule[];
  sshConnectionId?: string;
  hasUnread: boolean;
}

export interface BookmarkData {
  filePath: string;
  alias: string;
  group?: string;
  lastLine?: number;
}

export type NewBookmark = BookmarkData & (
  | { kind?: "file"; encoding: string; sshConnectionId?: string }
  | { kind: "folder"; encoding?: never; sshConnectionId?: never }
);

export type Bookmark = NewBookmark & { id: string };

export interface SearchResult {
  lineIndex: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

export interface SshConnection {
  id: string;
  alias: string;
  host: string;
  port: number;
  username: string;
  authType: "password" | "key" | "agent";
  password?: string;
  keyPath?: string;
  passphrase?: string;
}
