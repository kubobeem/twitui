import { Bridge } from './rpc.ts';
import { RpcError } from './types.ts';
import type { Paged, Space, Trend, Tweet, DmConversation, DmMessage, User, InitializeResult } from './types.ts';

/** Typed wrappers over the JSON-RPC methods exposed by the Python bridge. */
export class TwituiApi {
  constructor(private readonly bridge: Bridge) {}

  private call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.bridge.request<T>(method, params);
  }

  initialize(cookies: { AUTH_TOKEN: string; CT0: string }, lang: string, fake: boolean): Promise<InitializeResult> {
    return this.call<InitializeResult>('initialize', { cookies, lang, fake });
  }

  ping(): Promise<{ pong: boolean; mode: string; uptime_s: number }> {
    return this.call('ping');
  }

  homeLatest(cursor?: string): Promise<Paged<Tweet>> {
    return this.call('home/latest', { cursor: cursor ?? null });
  }

  homeForYou(cursor?: string): Promise<Paged<Tweet>> {
    return this.call('home/foryou', { cursor: cursor ?? null });
  }

  createTweet(text: string, mediaIds: string[] = [], replyTo?: string): Promise<Tweet> {
    return this.call('tweet/create', { text, media_ids: mediaIds, reply_to: replyTo ?? null });
  }

  deleteTweet(tweetId: string): Promise<{ deleted: boolean }> {
    return this.call('tweet/delete', { tweet_id: tweetId });
  }

  tweetDetail(tweetId: string): Promise<Tweet> {
    return this.call('tweet/detail', { tweet_id: tweetId });
  }

  search(q: string, mode: 'Top' | 'Latest', cursor?: string): Promise<Paged<Tweet>> {
    return this.call('tweet/search', { q, mode, cursor: cursor ?? null });
  }

  like(tweetId: string): Promise<{ liked: boolean }> {
    return this.call('tweet/like', { tweet_id: tweetId });
  }

  unlike(tweetId: string): Promise<{ liked: boolean }> {
    return this.call('tweet/unlike', { tweet_id: tweetId });
  }

  retweet(tweetId: string): Promise<{ retweeted: boolean }> {
    return this.call('tweet/retweet', { tweet_id: tweetId });
  }

  unretweet(tweetId: string): Promise<{ retweeted: boolean }> {
    return this.call('tweet/unretweet', { tweet_id: tweetId });
  }

  bookmark(tweetId: string): Promise<{ bookmarked: boolean }> {
    return this.call('tweet/bookmark', { tweet_id: tweetId });
  }

  unbookmark(tweetId: string): Promise<{ bookmarked: boolean }> {
    return this.call('tweet/unbookmark', { tweet_id: tweetId });
  }

  bookmarks(cursor?: string): Promise<Paged<Tweet>> {
    return this.call('bookmarks/list', { cursor: cursor ?? null });
  }

  userDetail(screenName?: string, userId?: string): Promise<User> {
    return this.call('user/detail', { screen_name: screenName ?? null, user_id: userId ?? null });
  }

  userTweets(userId: string, tab: 'Tweets' | 'TweetsAndReplies' | 'Media' | 'Likes', cursor?: string): Promise<Paged<Tweet>> {
    return this.call('user/tweets', { user_id: userId, tab, cursor: cursor ?? null });
  }

  follow(userId: string): Promise<{ following: boolean }> {
    return this.call('user/follow', { user_id: userId });
  }

  unfollow(userId: string): Promise<{ following: boolean }> {
    return this.call('user/unfollow', { user_id: userId });
  }

  mute(userId: string): Promise<{ muting: boolean }> {
    return this.call('user/mute', { user_id: userId });
  }

  unmute(userId: string): Promise<{ muting: boolean }> {
    return this.call('user/unmute', { user_id: userId });
  }

  block(userId: string): Promise<{ blocking: boolean }> {
    return this.call('user/block', { user_id: userId });
  }

  unblock(userId: string): Promise<{ blocking: boolean }> {
    return this.call('user/unblock', { user_id: userId });
  }

  trends(): Promise<Trend[]> {
    return this.call('trends');
  }

  dmList(): Promise<DmConversation[]> {
    return this.call('dm/list');
  }

  dmMessages(userId: string, cursor?: string): Promise<Paged<DmMessage>> {
    return this.call('dm/messages', { user_id: userId, cursor: cursor ?? null });
  }

  dmSend(userId: string, text: string): Promise<DmMessage> {
    return this.call('dm/send', { user_id: userId, text });
  }

  spacesList(): Promise<Space[]> {
    return this.call('spaces/list');
  }

  spaceDetail(spaceId: string): Promise<Space> {
    return this.call('spaces/get', { space_id: spaceId });
  }

  spaceCreate(title: string): Promise<Space> {
    return this.call('spaces/create', { title });
  }

  spaceEnd(spaceId: string): Promise<{ ended: boolean }> {
    return this.call('spaces/end', { space_id: spaceId });
  }

  mediaUpload(path: string): Promise<{ media_id: string; kind: string }> {
    return this.call('media/upload', { path });
  }

  me(): Promise<User> {
    return this.call('me');
  }

  isSessionError(e: unknown): e is RpcError {
    return e instanceof RpcError && (e.kind === 'session_expired' || e.kind === 'auth');
  }
}
