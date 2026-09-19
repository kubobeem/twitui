export interface User {
  id: string;
  screen_name: string;
  name: string;
  description: string;
  followers_count: number;
  friends_count: number;
  statuses_count: number;
  verified: boolean;
  profile_image_url: string | null;
}

export interface Tweet {
  id: string;
  created_at: string | null;
  created_ts: number | null;
  user: User;
  text: string;
  reply_count: number;
  retweet_count: number;
  favorite_count: number;
  bookmark_count: number;
  view_count: number;
  liked: boolean;
  retweeted: boolean;
  bookmarked: boolean;
  photo_url: string | null;
  video_url: string | null;
  quoted_tweet: Tweet | null;
  in_reply_to_id: string | null;
  lang: string | null;
  replies?: Tweet[];
}

export interface DmMessage {
  id: string;
  user: User;
  text: string;
  created_at: string | null;
  created_ts: number | null;
}

export interface DmConversation {
  user: User;
  last_message: string;
  last_ts: number | null;
}

export interface Space {
  id: string;
  title: string;
  state: string;
  speaker_count: number;
  listener_count: number;
  chat?: { user: User; text: string }[];
}

export interface Trend {
  name: string;
  tweet_count: number;
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export interface InitializeResult {
  mode: 'fake' | 'real';
  user: User;
  languages: string[];
}

export type ErrorKind =
  | 'session_expired'
  | 'rate_limited'
  | 'forbidden'
  | 'not_found'
  | 'auth'
  | 'not_supported'
  | 'upstream';

export class RpcError extends Error {
  kind: ErrorKind;
  code: number;
  data: Record<string, unknown>;

  constructor(code: number, message: string, kind: ErrorKind, data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.kind = kind;
    this.data = data;
  }
}
