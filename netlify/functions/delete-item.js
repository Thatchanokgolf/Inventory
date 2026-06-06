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

  const { id, entered_by } = body;

  if (!id || !entered_by?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id and entered_by are required.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    const [item] = await sql`
      SELECT id, item_name, quantity FROM inventory WHERE id = ${id}
    `;
    if (!item) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Item not found.' }) };
    }

    // Log the deletion before removing the row
    await sql`
      INSERT INTO inventory_log (item_id, item_name, action, quantity_before, quantity_after, entered_by)
      VALUES (${item.id}, ${item.item_name}, 'delete_item', ${item.quantity}, 0, ${entered_by.trim()})
    `;

    await sql`DELETE FROM inventory WHERE id = ${id}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('delete-item error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to delete item.' }) };
  }
};
