import { RpcError } from "./types.js";
/** Typed wrappers over the JSON-RPC methods exposed by the Python bridge. */
export class TwituiApi {
    bridge;
    constructor(bridge) {
        this.bridge = bridge;
    }
    call(method, params = {}) {
        return this.bridge.request(method, params);
    }
    initialize(cookies, lang, fake) {
        return this.call('initialize', { cookies, lang, fake });
    }
    ping() {
        return this.call('ping');
    }
    homeLatest(cursor) {
        return this.call('home/latest', { cursor: cursor ?? null });
    }
    homeForYou(cursor) {
        return this.call('home/foryou', { cursor: cursor ?? null });
    }
    createTweet(text, mediaIds = [], replyTo) {
        return this.call('tweet/create', { text, media_ids: mediaIds, reply_to: replyTo ?? null });
    }
    deleteTweet(tweetId) {
        return this.call('tweet/delete', { tweet_id: tweetId });
    }
    tweetDetail(tweetId) {
        return this.call('tweet/detail', { tweet_id: tweetId });
    }
    search(q, mode, cursor) {
        return this.call('tweet/search', { q, mode, cursor: cursor ?? null });
    }
    like(tweetId) {
        return this.call('tweet/like', { tweet_id: tweetId });
    }
    unlike(tweetId) {
        return this.call('tweet/unlike', { tweet_id: tweetId });
    }
    retweet(tweetId) {
        return this.call('tweet/retweet', { tweet_id: tweetId });
    }
    unretweet(tweetId) {
        return this.call('tweet/unretweet', { tweet_id: tweetId });
    }
    bookmark(tweetId) {
        return this.call('tweet/bookmark', { tweet_id: tweetId });
    }
    unbookmark(tweetId) {
        return this.call('tweet/unbookmark', { tweet_id: tweetId });
    }
    bookmarks(cursor) {
        return this.call('bookmarks/list', { cursor: cursor ?? null });
    }
    userDetail(screenName, userId) {
        return this.call('user/detail', { screen_name: screenName ?? null, user_id: userId ?? null });
    }
    userTweets(userId, tab, cursor) {
        return this.call('user/tweets', { user_id: userId, tab, cursor: cursor ?? null });
    }
    follow(userId) {
        return this.call('user/follow', { user_id: userId });
    }
    unfollow(userId) {
        return this.call('user/unfollow', { user_id: userId });
    }
    mute(userId) {
        return this.call('user/mute', { user_id: userId });
    }
    unmute(userId) {
        return this.call('user/unmute', { user_id: userId });
    }
    block(userId) {
        return this.call('user/block', { user_id: userId });
    }
    unblock(userId) {
        return this.call('user/unblock', { user_id: userId });
    }
    trends() {
        return this.call('trends');
    }
    dmList() {
        return this.call('dm/list');
    }
    dmMessages(userId, cursor) {
        return this.call('dm/messages', { user_id: userId, cursor: cursor ?? null });
    }
    dmSend(userId, text) {
        return this.call('dm/send', { user_id: userId, text });
    }
    spacesList() {
        return this.call('spaces/list');
    }
    spaceDetail(spaceId) {
        return this.call('spaces/get', { space_id: spaceId });
    }
    spaceCreate(title) {
        return this.call('spaces/create', { title });
    }
    spaceEnd(spaceId) {
        return this.call('spaces/end', { space_id: spaceId });
    }
    mediaUpload(path) {
        return this.call('media/upload', { path });
    }
    me() {
        return this.call('me');
    }
    isSessionError(e) {
        return e instanceof RpcError && (e.kind === 'session_expired' || e.kind === 'auth');
    }
}
