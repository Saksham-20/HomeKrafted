import { sleep } from 'k6';
import { get, thresholds, rampStages } from './lib.js';

/**
 * The read path — what an unauthenticated visitor actually does.
 *
 * These are the endpoints the 2026-08-07 audit paginated. Before that,
 * `GET /products` hydrated the entire matching catalogue with every
 * relation and threw away all but twenty rows, so this scenario is also
 * the before/after measurement for that change.
 */
export const options = { stages: rampStages, thresholds };

export default function () {
  get('/products?pageSize=20');
  get('/products?q=pickle&pageSize=20');
  get('/categories');
  get('/vendors');
  // Deeper pages cost more than page one on any offset scheme — worth
  // sampling rather than only ever measuring the cheapest request.
  get('/products?page=2&pageSize=20');
  sleep(1);
}
