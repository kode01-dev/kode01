import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const SEED_SQL_PATH = process.env.SEED_SQL_PATH?.trim() || 'supabase/seeds/test_vendors.sql';
const SEED_TEST_VENDORS_PASSWORD = process.env.SEED_TEST_VENDORS_PASSWORD?.trim();

async function run() {
    if (!DATABASE_URL) {
        throw new Error('Missing DATABASE_URL environment variable.');
    }

    const effectivePassword = SEED_TEST_VENDORS_PASSWORD || `local-seed-${randomUUID()}`;

    if (!SEED_TEST_VENDORS_PASSWORD) {
        console.warn(
            'SEED_TEST_VENDORS_PASSWORD not set. Generated an ephemeral local password for this run.'
        );
    }

    const sql = postgres(DATABASE_URL, {
        prepare: false // Disable prepared statements for PgBouncer compatibility
    });

    try {
        console.log('Reading seed file...');
        const seedPath = path.resolve(SEED_SQL_PATH);
        const sqlContent = fs.readFileSync(seedPath, 'utf8');

        console.log(`Executing seed SQL from ${seedPath}...`);
        await sql.begin(async (tx) => {
            await tx`select set_config('app.seed_test_vendors', 'on', true)`;
            await tx`select set_config('app.seed_test_vendors_password', ${effectivePassword}, true)`;
            await tx.unsafe(sqlContent);
        });
        
        console.log('Successfully seeded the database.');
    } catch (error) {
        console.error('Error executing SQL:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

run();
