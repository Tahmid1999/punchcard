import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { config } from 'dotenv';

// The e2e suite truncates every table, so it must not point at the database the
// demo is using. .env.test wins when present; without it the suite falls back
// to .env and will wipe whatever is there.
const testEnv = join(process.cwd(), '.env.test');
config({ path: existsSync(testEnv) ? testEnv : join(process.cwd(), '.env') });
