const crypto = require('crypto');
const { upsertUser } = require('./authDb');

const FACEBOOK_API_VERSION = 'v21.0';
const FACEBOOK_SCOPES = ['public_profile', 'email'];

function getFacebookConfig() {
  return {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    isConfigured: Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
  };
}

function getAppBaseUrl(req) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, '');
  }

  const protocol = req.get('x-forwarded-proto') || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

function getCallbackUrl(req) {
  return `${getAppBaseUrl(req)}/auth/facebook/callback`;
}

function createOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

function buildLoginUrl(req, state) {
  const { appId } = getFacebookConfig();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: getCallbackUrl(req),
    state,
    scope: FACEBOOK_SCOPES.join(','),
    response_type: 'code',
  });

  return `https://www.facebook.com/${FACEBOOK_API_VERSION}/dialog/oauth?${params}`;
}

async function exchangeCodeForToken(req, code) {
  const { appId, appSecret } = getFacebookConfig();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: getCallbackUrl(req),
    code,
  });

  const res = await fetch(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/oauth/access_token?${params}`);
  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message || 'Gagal menukar kode login Facebook');
  }

  return data.access_token;
}

async function fetchFacebookProfile(accessToken) {
  const params = new URLSearchParams({
    fields: 'id,name,email,picture.type(large)',
    access_token: accessToken,
  });

  const res = await fetch(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/me?${params}`);
  const data = await res.json();

  if (!res.ok || !data.id) {
    throw new Error(data.error?.message || 'Gagal mengambil profil Facebook');
  }

  return data;
}

async function loginWithFacebookCode(req, code) {
  const accessToken = await exchangeCodeForToken(req, code);
  const profile = await fetchFacebookProfile(accessToken);

  const user = upsertUser({
    facebookId: profile.id,
    name: profile.name,
    email: profile.email || null,
    pictureUrl: profile.picture?.data?.url || null,
  });

  return {
    id: user.id,
    facebookId: user.facebook_id,
    name: user.name,
    email: user.email,
    pictureUrl: user.picture_url,
  };
}

function toSessionUser(user) {
  return {
    id: user.id,
    facebookId: user.facebookId || user.facebook_id,
    name: user.name,
    email: user.email,
    pictureUrl: user.pictureUrl || user.picture_url,
  };
}

module.exports = {
  getFacebookConfig,
  getAppBaseUrl,
  createOAuthState,
  buildLoginUrl,
  loginWithFacebookCode,
  toSessionUser,
};
