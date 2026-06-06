const { neon } = require('@neondatabase/serverless');

exports.handler = async () => {
  const sql = neon(process.env.DATABASE_URL);

  try {
    const rows = await sql`
      SELECT id, item_name, quantity, low_stock_limit, updated_at
      FROM inventory
      ORDER BY item_name ASC
    `;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    };
  } catch (err) {
    console.error('get-inventory error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch inventory.' }),
    };
  }
};
