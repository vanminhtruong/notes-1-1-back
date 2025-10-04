import BlockActionsChild from '../service/block-service/block.actions.service.js';
import BlockStatusChild from '../service/block-service/block.status.service.js';

class BlockController {
  constructor() {
    // Attach child controllers to keep class short while preserving API surface
    this.actionsChild = new BlockActionsChild(this);
    this.statusChild = new BlockStatusChild(this);
  }

  // Delegate methods to child services
  blockUser = (...args) => this.actionsChild.blockUser(...args);
  unblockUser = (...args) => this.actionsChild.unblockUser(...args);
  getBlockStatus = (...args) => this.statusChild.getBlockStatus(...args);
  listBlockedUsers = (...args) => this.statusChild.listBlockedUsers(...args);
}

const blockController = new BlockController();

export { BlockController };

export const blockUser = blockController.blockUser;
export const unblockUser = blockController.unblockUser;
export const getBlockStatus = blockController.getBlockStatus;
export const listBlockedUsers = blockController.listBlockedUsers;
