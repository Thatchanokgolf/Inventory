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

  const { id, quantity_before, quantity_after, entered_by } = body;
  // Optional: change the low-stock limit in the same request
  const newLimit = body.low_stock_limit == null ? null : Number(body.low_stock_limit);

  if (!id || quantity_before == null || quantity_after == null || quantity_after < 0 || !entered_by?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id, quantity_before, quantity_after (≥0), and entered_by are required.' }) };
  }
  if (newLimit !== null && (isNaN(newLimit) || newLimit < 0)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'low_stock_limit must be 0 or greater.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Read the current row so we know the existing limit
    const [current] = await sql`
      SELECT id, item_name, quantity, low_stock_limit FROM inventory WHERE id = ${id}
    `;
    if (!current) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Item not found.' }) };
    }

    const finalLimit = newLimit === null ? current.low_stock_limit : newLimit;

    // Update inventory summary table (quantity + limit)
    const [item] = await sql`
      UPDATE inventory
      SET quantity = ${quantity_after}, low_stock_limit = ${finalLimit}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, item_name, quantity, low_stock_limit
    `;

    const entered = entered_by.trim();
    const diff = quantity_after - quantity_before;

    // Log a quantity change (only if the quantity actually changed)
    if (diff !== 0) {
      let action;
      action = 'set_quantity';

      await sql`
        INSERT INTO inventory_log (item_id, item_name, action, quantity_change, quantity_before, quantity_after, entered_by)
        VALUES (${item.id}, ${item.item_name}, ${action}, ${diff}, ${quantity_before}, ${quantity_after}, ${entered})
      `;
    }

    // Log a limit change (only if the limit actually changed)
    if (newLimit !== null && newLimit !== current.low_stock_limit) {
      await sql`
        INSERT INTO inventory_log (item_id, item_name, action, quantity_change, quantity_before, quantity_after, entered_by)
        VALUES (${item.id}, ${item.item_name}, 'set_limit', ${newLimit - current.low_stock_limit}, ${current.low_stock_limit}, ${newLimit}, ${entered})
      `;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    };
  } catch (err) {
    console.error('update-item error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update item.' }) };
  }
};
