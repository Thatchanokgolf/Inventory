const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON.' }) };
  }

  const { item_name, quantity, entered_by } = body;
  // Optional low-stock limit; defaults to 5 when not provided
  const lowStockLimit = body.low_stock_limit == null ? 5 : Number(body.low_stock_limit);

  if (!item_name?.trim() || quantity == null || isNaN(quantity) || quantity < 0 || !entered_by?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'item_name, quantity (≥0), and entered_by are required.' }) };
  }
  if (isNaN(lowStockLimit) || lowStockLimit < 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'low_stock_limit must be 0 or greater.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Insert into inventory (fail if duplicate name)
    const [item] = await sql`
      INSERT INTO inventory (item_name, quantity, low_stock_limit)
      VALUES (${item_name.trim()}, ${quantity}, ${lowStockLimit})
      RETURNING id, item_name, quantity, low_stock_limit
    `;

    // Log the action
    await sql`
      INSERT INTO inventory_log (item_id, item_name, action, quantity_before, quantity_after, entered_by)
      VALUES (${item.id}, ${item.item_name}, 'add_item', 0, ${quantity}, ${entered_by.trim()})
    `;

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.error('add-item error:', err);
    if (err.code === '23505') {
      return { statusCode: 409, body: JSON.stringify({ error: `An item named "${item_name}" already exists.` }) };
    }
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to add item.' }) };
  }
};
