import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4100/api/v1';

/**
 * Thresholds shared by every scenario.
 *
 * Generous on purpose: these catch a cliff, not a latency budget. A run
 * that trips them has found something real; one that passes has only
 * shown there is no cliff below that load.
 *
 * `abortOnFail` matters more than the numbers — without it a ramp that
 * has already fallen over keeps climbing, and the report tells you about
 * 1000 VUs against a server that stopped answering at 300.
 */
export const thresholds = {
  http_req_duration: [{ threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '10s' }],
  http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '10s' }],
};

/** The staged ramp the audit plan asks for: 50 → 200 → 500 → 1000. */
export const rampStages = [
  { duration: '20s', target: 50 },
  { duration: '30s', target: 50 },
  { duration: '20s', target: 200 },
  { duration: '30s', target: 200 },
  { duration: '20s', target: 500 },
  { duration: '30s', target: 500 },
  { duration: '20s', target: 1000 },
  { duration: '30s', target: 1000 },
  { duration: '20s', target: 0 },
];

export function get(path, params) {
  const res = http.get(`${BASE_URL}${path}`, params);
  check(res, { [`${path} is 2xx`]: (r) => r.status >= 200 && r.status < 300 });
  return res;
}

/**
 * Signs in and returns an auth header.
 *
 * Every VU signing in as the same account is deliberate: the point is to
 * load the read paths behind a session, not to benchmark argon2. Hashing
 * a password per virtual user would make this a test of the login
 * endpoint wearing a browse test's name.
 */
export function authHeaderFor(email, password) {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) return null;
  return { headers: { Authorization: `Bearer ${res.json('accessToken')}` } };
}
