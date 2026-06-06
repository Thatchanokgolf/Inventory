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

  if (!item_name?.trim() || quantity == null || isNaN(quantity) || quantity < 0 || !entered_by?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'item_name, quantity (≥0), and entered_by are required.' }) };
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Insert into inventory (fail if duplicate name)
    const [item] = await sql`
      INSERT INTO inventory (item_name, quantity)
      VALUES (${item_name.trim()}, ${quantity})
      RETURNING id, item_name, quantity
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
