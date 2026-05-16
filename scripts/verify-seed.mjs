import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL?.trim();

async function verify() {
    if (!DATABASE_URL) {
        throw new Error('Missing DATABASE_URL environment variable.');
    }

    const sql = postgres(DATABASE_URL, { prepare: false });

    try {
        const profiles = await sql`SELECT role, count(*) FROM public.profiles GROUP BY role`;
        const products = await sql`SELECT status, count(*) FROM public.products GROUP BY status`;

        console.log('Verification Results:');
        console.table(profiles);
        console.table(products);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

verify();
