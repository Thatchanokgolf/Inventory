const { neon } = require('@neondatabase/serverless');

exports.handler = async () => {
  const sql = neon(process.env.DATABASE_URL);

  try {
    const rows = await sql`
      SELECT id, item_name, action, quantity_change, quantity_before, quantity_after, entered_by, created_at
      FROM inventory_log
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    };
  } catch (err) {
    console.error('get-log error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch log.' }),
    };
  }
};
