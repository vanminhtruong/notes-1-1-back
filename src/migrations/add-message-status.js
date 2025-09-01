'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Messages', 'status', {
      type: Sequelize.ENUM('sent', 'delivered', 'read'),
      defaultValue: 'sent',
      allowNull: false
    });

    await queryInterface.addColumn('GroupMessages', 'status', {
      type: Sequelize.ENUM('sent', 'delivered', 'read'),
      defaultValue: 'sent',
      allowNull: false
    });

    // Create MessageReads table for tracking who read each message
    await queryInterface.createTable('MessageReads', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Messages',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      readAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Create GroupMessageReads table for tracking who read each group message
    await queryInterface.createTable('GroupMessageReads', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      messageId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'GroupMessages',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      readAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for performance
    await queryInterface.addIndex('MessageReads', ['messageId', 'userId'], {
      unique: true,
      name: 'message_reads_unique'
    });

    await queryInterface.addIndex('GroupMessageReads', ['messageId', 'userId'], {
      unique: true,
      name: 'group_message_reads_unique'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('GroupMessageReads');
    await queryInterface.dropTable('MessageReads');
    await queryInterface.removeColumn('GroupMessages', 'status');
    await queryInterface.removeColumn('Messages', 'status');
  }
};
