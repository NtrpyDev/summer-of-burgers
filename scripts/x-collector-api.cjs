/**
 * X API collector — follows official docs:
 * - Auth: Bearer token (app-only) for public reads
 *   https://docs.x.com/x-api/getting-started/getting-access
 * - Endpoints: users lookup + user posts timeline
 *   https://docs.x.com/x-api/getting-started/make-your-first-request
 * - SDK: @xdevplatform/xdk
 *   https://docs.x.com/xdks/typescript/overview
 */
require("./load-env.cjs");

const { Client } = require("@xdevplatform/xdk");

const HANDLE = "BarstoolBigCat";

function bearerToken() {
  return (process.env.X_BEARER_TOKEN || "").trim();
}

function hasApiCredentials() {
  return Boolean(bearerToken());
}

function createClient() {
  const token = bearerToken();
  if (!token) {
    throw new Error(
      "X_BEARER_TOKEN missing in .env. Copy Bearer Token from console.x.com → Apps → summer-of-burgers → Keys and tokens."
    );
  }
  return new Client({ bearerToken: token });
}

function apiErrorMessage(error) {
  const status = error?.status || error?.statusCode;
  const detail = error?.message || String(error);
  if (status === 401) {
    return (
      `X API 401 Unauthorized. Per https://docs.x.com/x-api/getting-started/make-your-first-request ` +
      `regenerate Bearer Token in console.x.com (Keys and tokens) after any API Key regen, update .env, then run .\\scripts\\check-x-api.cmd. (${detail})`
    );
  }
  return detail;
}

/** @xdevplatform/xdk returns camelCase; raw REST uses snake_case. */
function tweetCreatedAt(tweet) {
  return tweet?.created_at || tweet?.createdAt || null;
}

function tweetMediaKeys(tweet) {
  return tweet?.attachments?.media_keys || tweet?.attachments?.mediaKeys || [];
}

function mediaItemKey(item) {
  return item?.media_key || item?.mediaKey || "";
}

function mediaPreviewUrl(item) {
  return item?.preview_image_url || item?.previewImageUrl || "";
}

function indexMedia(items) {
  const map = new Map();
  for (const item of items || []) {
    const key = mediaItemKey(item);
    if (key) map.set(key, item);
  }
  return map;
}

function responseNextToken(response) {
  return response?.meta?.next_token || response?.meta?.nextToken;
}

function tweetMediaImages(tweet, mediaByKey) {
  const keys = tweetMediaKeys(tweet);
  const images = [];
  keys.forEach((key, mediaIndex) => {
    const item = mediaByKey.get(key);
    if (!item) return;
    if (item.type === "photo" && item.url) {
      images.push({ mediaIndex, imageUrl: item.url });
      return;
    }
    if ((item.type === "video" || item.type === "animated_gif") && mediaPreviewUrl(item)) {
      images.push({ mediaIndex, imageUrl: mediaPreviewUrl(item) });
    }
  });
  return images;
}

function tweetToCandidates(tweet, mediaByKey, helpers) {
  const tweetId = tweet.id;
  const postedAt = tweetCreatedAt(tweet);
  const caption = helpers.cleanCaption(tweet.text || "");
  const sourceUrl = `https://x.com/${HANDLE}/status/${tweetId}`;

  return tweetMediaImages(tweet, mediaByKey).map(({ mediaIndex, imageUrl }) => ({
    tweetId,
    sourceUrl,
    postedAt,
    caption,
    mediaIndex,
    imageUrl: helpers.normalizeTwimgUrl(imageUrl),
    category: helpers.categorize(caption),
    tags: helpers.tagsFor(caption)
  }));
}

async function resolveUserId(client) {
  const response = await client.users.getByUsername(HANDLE, {
    "user.fields": ["id", "name", "username"]
  });
  const id = response?.data?.id;
  if (!id) throw new Error(`Could not find X user @${HANDLE}`);
  return id;
}

async function fetchUserTimeline(client, userId, startDate, sinceTweetId) {
  const tweets = [];
  const media = new Map();
  let paginationToken;

  do {
    const response = await client.users.getPosts(userId, {
      max_results: 100,
      start_time: `${startDate}T00:00:00Z`,
      ...(sinceTweetId ? { since_id: sinceTweetId } : {}),
      exclude: ["retweets", "replies"],
      "tweet.fields": ["created_at", "text", "attachments"],
      expansions: ["attachments.media_keys"],
      "media.fields": ["url", "preview_image_url", "type"],
      ...(paginationToken ? { pagination_token: paginationToken } : {})
    });

    for (const tweet of response?.data || []) tweets.push(tweet);
    for (const [key, item] of indexMedia(response?.includes?.media)) media.set(key, item);
    paginationToken = responseNextToken(response);
  } while (paginationToken);

  return { tweets, media };
}

async function fetchTweetsByIds(client, tweetIds) {
  const tweets = [];
  const media = new Map();
  const chunks = [];
  for (let index = 0; index < tweetIds.length; index += 100) {
    chunks.push(tweetIds.slice(index, index + 100));
  }

  for (const chunk of chunks) {
    const response = await client.posts.getByIds(chunk, {
      "tweet.fields": ["created_at", "text", "attachments"],
      expansions: ["attachments.media_keys"],
      "media.fields": ["url", "preview_image_url", "type"]
    });
    for (const tweet of response?.data || []) tweets.push(tweet);
    for (const [key, item] of indexMedia(response?.includes?.media)) media.set(key, item);
  }

  return { tweets, media };
}

async function collectImageTweetCandidates({ startDate, sinceTweetId, explicitTweetIds, helpers }) {
  const mode = explicitTweetIds.length
    ? "explicit tweet id(s)"
    : sinceTweetId
      ? `new tweets since ${sinceTweetId}`
      : `all image tweets since ${startDate}`;
  console.log(`Scanning X timeline (${mode})...`);
  const client = createClient();

  try {
    let tweets;
    let mediaByKey;

    if (explicitTweetIds.length) {
      ({ tweets, media: mediaByKey } = await fetchTweetsByIds(client, explicitTweetIds));
    } else {
      const userId = await resolveUserId(client);
      ({ tweets, media: mediaByKey } = await fetchUserTimeline(client, userId, startDate, sinceTweetId));
    }

    const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
    const candidates = [];

    for (const tweet of tweets) {
      const postedMs = Date.parse(tweetCreatedAt(tweet) || "");
      if (postedMs && postedMs < startMs) continue;
      if (!tweetMediaKeys(tweet).length) continue;
      candidates.push(...tweetToCandidates(tweet, mediaByKey, helpers));
    }

    console.log(`X API: ${tweets.length} tweet(s) fetched, ${candidates.length} image(s) to scan`);
    return candidates;
  } catch (error) {
    throw new Error(apiErrorMessage(error));
  }
}

async function listCampaignFromApi({ startDate, burgers, state, helpers }) {
  const client = createClient();
  try {
    const userId = await resolveUserId(client);
    const { tweets, media } = await fetchUserTimeline(client, userId, startDate);
    const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
    const knownKeys = new Set(burgers.map((burger) => `${burger.tweet_id}:${burger.media_index}`));

    const rows = [];
    for (const tweet of tweets) {
      const postedMs = Date.parse(tweetCreatedAt(tweet) || "");
      if (postedMs && postedMs < startMs) continue;
      const images = tweetMediaImages(tweet, media);
      if (!images.length) continue;
      const caption = helpers.cleanCaption(tweet.text || "");
      for (const { mediaIndex } of images) {
        const key = `${tweet.id}:${mediaIndex}`;
        const processed = state?.processed?.[key];
        let status = "NEW";
        if (knownKeys.has(key)) status = "ON SITE";
        else if (processed?.isBurger) status = "BURGER (not imported)";
        else if (processed) status = "NOT BURGER";
        rows.push({
          status,
          id: tweet.id,
          mediaIndex,
          postedAt: tweetCreatedAt(tweet),
          caption: caption.slice(0, 60)
        });
      }
    }

    console.log(`Image tweets since ${startDate}: ${rows.length}`);
    for (const row of rows) {
      console.log(`  ${row.status.padEnd(18)} ${row.id}:${row.mediaIndex}  ${row.postedAt}  ${row.caption}`);
    }
    console.log(`On site: ${rows.filter((row) => row.status === "ON SITE").length}, new to scan: ${rows.filter((row) => row.status === "NEW").length}`);
  } catch (error) {
    throw new Error(apiErrorMessage(error));
  }
}

module.exports = {
  hasApiCredentials,
  collectImageTweetCandidates,
  listCampaignFromApi
};
