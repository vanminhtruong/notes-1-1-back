const indexes = [
  ['Messages', 'chat_dm_delivery_cursor', ['receiverId', 'status', 'id']],
  ['GroupMessages', 'chat_group_delivery_cursor', ['groupId', 'status', 'id']],
];

// Run through the existing migration command in a planned migration window.
export async function up(queryInterface) {
  for (const [table, name, fields] of indexes) {
    const current = await queryInterface.showIndex(table);
    if (!current.some(index => index.name === name)) await queryInterface.addIndex(table, fields, { name });
  }
}

export async function down(queryInterface) {
  for (const [table, name] of indexes) {
    const current = await queryInterface.showIndex(table);
    if (current.some(index => index.name === name)) await queryInterface.removeIndex(table, name);
  }
}
