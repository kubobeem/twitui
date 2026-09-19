export type Lang = 'ja' | 'en';

const dict = {
  ja: {
    'nav.home': 'ホーム',
    'nav.explore': '話題',
    'nav.dm': 'DM',
    'nav.bookmarks': 'ブックマーク',
    'nav.profile': 'プロフィール',
    'nav.post': '投稿する',
    'tab.foryou': 'おすすめ',
    'tab.following': 'フォロー中',
    'tab.top': '話題',
    'tab.latest': '最新',
    'tab.tweets': 'ツイート',
    'tab.replies': '返信',
    'tab.media': 'メディア',
    'tab.likes': 'いいね',
    'action.reply': '返信',
    'action.retweet': 'リポスト',
    'action.like': 'いいね',
    'action.bookmark': 'ブックマーク',
    'action.quote': '引用',
    'action.delete': '削除',
    'action.open': '開く',
    'action.send': '送信',
    'action.cancel': 'キャンセル',
    'compose.title': '新規ツイート',
    'compose.replyTitle': '返信を作成',
    'compose.quoteTitle': '引用ツイート',
    'compose.placeholder': 'いまどうしてる?',
    'compose.attach': '添付 (画像パス, カンマ区切り最大4枚)',
    'compose.ctrlEnter': 'Ctrl+Enter で送信 · Esc で閉じる',
    'newTweets': '{count}件の新着 (x で先頭へ)',
    'search.placeholder': '検索…',
    'trends.title': 'トレンド',
    'trends.forYou': 'あなたへ',
    'dm.title': 'メッセージ',
    'dm.empty': '会話がありません',
    'dm.inputPlaceholder': 'メッセージを入力…',
    'spaces.title': 'スペース',
    'spaces.openById': 'Space ID で開く',
    'setup.title': 'twitui へようこそ',
    'setup.steps': '1. ブラウザで x.com にログイン\n2. DevTools → アプリケーション → Cookie\n3. auth_token と ct0 を下に貼り付け',
    'setup.inputLabel': '貼り付け (auth_token=...; ct0=... 形式等)',
    'setup.verify': '検証して保存',
    'setup.verifying': '検証中…',
    'setup.invalid': 'Cookie をパースできませんでした。auth_token=...; ct0=... の形式で貼り付けてください',
    'setup.expired': 'Cookie の有効期限が切れました。再入力してください',
    'setup.rejected': '認証に失敗しました: {message}',
    'setup.quitHint': 'Ctrl+C で終了',
    'error.rateLimited': 'レート制限中です。あと {seconds}秒',
    'error.sessionExpired': 'セッションが失効しました',
    'error.notFound': '見つかりません',
    'error.forbidden': 'アクセスが拒否されました (403)',
    'error.upstream': 'エラー: {message}',
    'error.bridgeRestarting': 'ブリッジを再起動中…',
    'error.bridgeDead': 'ブリッジプロセスが繰り返し異常終了しました。twitui --reinstall-backend を試してください',
    'error.empty': '何もありません',
    'error.tweetEmpty': 'ツイートがありません',
    'error.deleteConfirm': 'このツイートを削除しますか? (y/N)',
    'quit.confirm': '終了しますか? もう一度 q で終了',
    'help.title': 'キーヘルプ',
    'help.lines': [
      'j/k / ↑↓   移動            Enter  詳細',
      'n          新規投稿        Q      引用',
      'l          いいね          t      リポスト',
      'b          ブックマーク    r      返信',
      'd          削除            o      リンクを開く',
      'u          プロフィール    /      検索',
      'r          更新            x      新着へ',
      'Tab        タブ切替        1-5    セクション',
      '?          このヘルプ      q      戻る/終了',
    ].join('\n'),
    'media.notSupported': 'この端末では画像を表示できません (o でブラウザで開く)',
    'media.loading': '画像を読み込み中…',
    'detail.views': '{count} 回表示',
    'fakeBadge': 'FAKE',
  },
  en: {
    'nav.home': 'Home',
    'nav.explore': 'Explore',
    'nav.dm': 'Messages',
    'nav.bookmarks': 'Bookmarks',
    'nav.profile': 'Profile',
    'nav.post': 'Post',
    'tab.foryou': 'For you',
    'tab.following': 'Following',
    'tab.top': 'Top',
    'tab.latest': 'Latest',
    'tab.tweets': 'Posts',
    'tab.replies': 'Replies',
    'tab.media': 'Media',
    'tab.likes': 'Likes',
    'action.reply': 'Reply',
    'action.retweet': 'Repost',
    'action.like': 'Like',
    'action.bookmark': 'Bookmark',
    'action.quote': 'Quote',
    'action.delete': 'Delete',
    'action.open': 'Open',
    'action.send': 'Send',
    'action.cancel': 'Cancel',
    'compose.title': 'New post',
    'compose.replyTitle': 'Reply',
    'compose.quoteTitle': 'Quote',
    'compose.placeholder': "What's happening?",
    'compose.attach': 'Attach (image paths, comma-separated, max 4)',
    'compose.ctrlEnter': 'Ctrl+Enter to post · Esc to close',
    'newTweets': '{count} new posts (x to jump)',
    'search.placeholder': 'Search…',
    'trends.title': 'Trends',
    'trends.forYou': 'For you',
    'dm.title': 'Messages',
    'dm.empty': 'No conversations',
    'dm.inputPlaceholder': 'Start a new message…',
    'spaces.title': 'Spaces',
    'spaces.openById': 'Open by Space ID',
    'setup.title': 'Welcome to twitui',
    'setup.steps': '1. Log in to x.com in your browser\n2. DevTools → Application → Cookies\n3. Paste auth_token and ct0 below',
    'setup.inputLabel': 'Paste (auth_token=...; ct0=... or JSON)',
    'setup.verify': 'Verify & save',
    'setup.verifying': 'Verifying…',
    'setup.invalid': 'Could not parse cookies. Paste like auth_token=...; ct0=...',
    'setup.expired': 'Cookies expired. Please re-enter them.',
    'setup.rejected': 'Auth failed: {message}',
    'setup.quitHint': 'Ctrl+C to quit',
    'error.rateLimited': 'Rate limited. Retry in {seconds}s',
    'error.rateLimitedNoRetry': 'Rate limited. Backing off…',
    'error.sessionExpired': 'Session expired',
    'error.notFound': 'Not found',
    'error.forbidden': 'Access denied (403)',
    'error.upstream': 'Error: {message}',
    'error.bridgeRestarting': 'Restarting bridge…',
    'error.bridgeDead': 'Bridge process keeps crashing. Try: twitui --reinstall-backend',
    'error.empty': 'Nothing here yet',
    'error.tweetEmpty': 'No posts',
    'error.deleteConfirm': 'Delete this post? (y/N)',
    'quit.confirm': 'Quit? Press q again',
    'help.title': 'Keybindings',
    'help.lines': [
      'j/k / ↑↓   move           Enter  detail',
      'n          new post       Q      quote',
      'l          like           t      repost',
      'b          bookmark       r      reply',
      'd          delete         o      open link',
      'u          profile        /      search',
      'r          refresh        x      new posts',
      'Tab        switch tab     1-5    sections',
      '?          this help      q      back/quit',
    ].join('\n'),
    'media.notSupported': 'Image preview unavailable in this terminal (o to open in browser)',
    'media.loading': 'Loading image…',
    'detail.views': '{count} views',
    'fakeBadge': 'FAKE',
  },
} as const;

type Dict = Record<string, string>;

export function getLang(configured?: string): Lang {
  if (configured === 'ja' || configured === 'en') return configured;
  const env = process.env['LC_ALL'] ?? process.env['LC_MESSAGES'] ?? process.env['LANG'] ?? '';
  if (/^ja\b/i.test(env)) return 'ja';
  if (process.platform === 'win32') {
    const p = process.env['LANG'] ?? '';
    if (/^ja/i.test(p)) return 'ja';
    return 'en';
  }
  return 'en';
}

export function createT(lang: Lang): (key: string, vars?: Record<string, string | number>) => string {
  const d = dict[lang] as unknown as Dict;
  const fallback = dict.en as unknown as Dict;
  return (key, vars) => {
    let s: string = d[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
}

export type T = ReturnType<typeof createT>;
