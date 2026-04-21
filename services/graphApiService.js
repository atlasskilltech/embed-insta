const axios = require('axios');

const GRAPH_BASE = 'https://graph.facebook.com';

const MEDIA_FIELDS = [
  'id',
  'caption',
  'media_type',
  'media_product_type',
  'media_url',
  'thumbnail_url',
  'permalink',
  'timestamp',
  'like_count',
  'comments_count',
  'username',
  'shortcode',
  'is_comment_enabled',
  'owner{id,username}',
  'children{id,media_type,media_url,thumbnail_url,permalink,timestamp,shortcode}',
].join(',');

const COMMENT_FIELDS = [
  'id',
  'text',
  'username',
  'like_count',
  'timestamp',
  'replies{id,text,username,like_count,timestamp}',
].join(',');

function describeError(err) {
  if (!err) return 'unknown graph error';
  if (err.response && err.response.data && err.response.data.error) {
    const e = err.response.data.error;
    const parts = [];
    if (e.code != null) parts.push(`code=${e.code}`);
    if (e.error_subcode != null) parts.push(`subcode=${e.error_subcode}`);
    if (e.type) parts.push(`type=${e.type}`);
    if (e.fbtrace_id) parts.push(`trace=${e.fbtrace_id}`);
    return `${e.message || 'graph error'} (${parts.join(' ')})`;
  }
  if (err.code) return `${err.code}: ${err.message || ''}`;
  return err.message || String(err);
}

function isAuthError(err) {
  const e = err && err.response && err.response.data && err.response.data.error;
  if (!e) return false;
  return e.code === 190 || e.type === 'OAuthException';
}

async function graphGet(url, params) {
  try {
    const res = await axios.get(url, {
      params,
      timeout: 30000,
      validateStatus: (s) => s >= 200 && s < 300,
    });
    return res.data;
  } catch (err) {
    const wrapped = new Error(describeError(err));
    wrapped.cause = err;
    wrapped.isAuthError = isAuthError(err);
    throw wrapped;
  }
}

async function fetchMedia(account, options = {}) {
  if (!account || !account.access_token || !account.ig_business_id) {
    throw new Error('graph account missing credentials');
  }

  const apiVersion = account.api_version || 'v21.0';
  const limit = Math.min(Math.max(parseInt(options.resultsLimit, 10) || account.results_limit || 25, 1), 200);
  const pageSize = Math.min(limit, 100);

  let url = `${GRAPH_BASE}/${apiVersion}/${account.ig_business_id}/media`;
  let params = {
    fields: MEDIA_FIELDS,
    limit: pageSize,
    access_token: account.access_token,
  };

  const items = [];
  let page = 0;
  const maxPages = Math.ceil(limit / pageSize) + 1;

  while (items.length < limit && page < maxPages) {
    const data = await graphGet(url, params);
    const batch = Array.isArray(data && data.data) ? data.data : [];
    for (const it of batch) {
      items.push(it);
      if (items.length >= limit) break;
    }
    const next = data && data.paging && data.paging.next;
    if (!next || items.length >= limit) break;
    // `paging.next` is a fully-qualified URL. Use it verbatim so the
    // cursor + access_token stay paired.
    url = next;
    params = undefined;
    page += 1;
  }

  console.log(
    `[graph] ${account.label || account.ig_business_id}: fetched ${items.length} item(s) across ${page + 1} page(s)`
  );

  return { items };
}

async function fetchComments(account, mediaId, { limit = 20 } = {}) {
  if (!account || !account.access_token) return [];
  const apiVersion = account.api_version || 'v21.0';
  try {
    const data = await graphGet(`${GRAPH_BASE}/${apiVersion}/${mediaId}/comments`, {
      fields: COMMENT_FIELDS,
      limit: Math.min(Math.max(limit, 1), 50),
      access_token: account.access_token,
    });
    return Array.isArray(data && data.data) ? data.data : [];
  } catch (err) {
    console.warn(`[graph] comments fetch failed for ${mediaId}: ${err.message}`);
    return [];
  }
}

module.exports = {
  fetchMedia,
  fetchComments,
  describeError,
  isAuthError,
};
