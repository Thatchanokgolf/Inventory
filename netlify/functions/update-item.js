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

  if (!id || quantity_before == null || quantity_after == null || quantity_after < 0 || !entered_by?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id, quantity_before, quantity_after (≥0), and entered_by are required.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Update inventory summary table
    const [item] = await sql`
      UPDATE inventory
      SET quantity = ${quantity_after}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, item_name, quantity
    `;

    if (!item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Item not found.' }) };
    }

    // Determine action type for the log
    const diff = quantity_after - quantity_before;
    let action;
    if      (diff === 1)  action = 'increment';
    else if (diff === -1) action = 'decrement';
    else                  action = 'set_quantity';

    // Log the action
    await sql`
      INSERT INTO inventory_log (item_id, item_name, action, quantity_change, quantity_before, quantity_after, entered_by)
      VALUES (${item.id}, ${item.item_name}, ${action}, ${diff}, ${quantity_before}, ${quantity_after}, ${entered_by.trim()})
    `;

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
