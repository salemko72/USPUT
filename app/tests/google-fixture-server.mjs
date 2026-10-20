// Synthetic Google responses for browser tests. Never used by production.
process.env.PORT ||= "8825";
process.env.USPUT_DATA_DIR ||= "/tmp/usput-google-fixture-" + Date.now();
const { env } = await import("../server/local.mjs");
env.GOOGLE_CLIENT_ID = "fixture-only";
env.GOOGLE_CLIENT_SECRET = "fixture-only";
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  if (String(input) === "https://oauth2.googleapis.com/token") return Promise.resolve(Response.json({access_token:"fixture-only"}));
  if (String(input) === "https://openidconnect.googleapis.com/v1/userinfo") return Promise.resolve(Response.json({sub:"fixture-google-sub",email:"salem.oauth.fixture@gmail.com",email_verified:true,name:"Google Fixture"}));
  return originalFetch(input,options);
};
