import { User } from '../../models/index.js';

class SocketAdminChild {
  constructor(parent) {
    this.parent = parent;
  }

  emitToAllAdmins = async (event, data) => {
    try {
      const adminUsers = await User.findAll({
        where: { role: 'admin', isActive: true },
        attributes: ['id', 'adminLevel', 'adminPermissions']
      });
      
      for (const admin of adminUsers) {
        if (this.parent.connectedUsers.has(admin.id)) {
          global.io.to(`user_${admin.id}`).emit(event, data);
        }
      }
    } catch (error) {
      console.error('Error emitting to all admins:', error);
    }
  };

  emitToAdminsWithPermission = async (event, data, requiredPermission) => {
    try {
      const adminUsers = await User.findAll({
        where: { role: 'admin', isActive: true },
        attributes: ['id', 'adminLevel', 'adminPermissions']
      });
      
      for (const admin of adminUsers) {
        if (this.parent.connectedUsers.has(admin.id)) {
          // Super admin có tất cả quyền
          if (admin.adminLevel === 'super_admin') {
            global.io.to(`user_${admin.id}`).emit(event, data);
          } else if (admin.adminPermissions && admin.adminPermissions.includes(requiredPermission)) {
            global.io.to(`user_${admin.id}`).emit(event, data);
          }
        }
      }
    } catch (error) {
      console.error('Error emitting to admins with permission:', error);
    }
  };

  emitToSuperAdmins = async (event, data) => {
    try {
      const superAdmins = await User.findAll({
        where: { 
          role: 'admin', 
          isActive: true, 
          adminLevel: 'super_admin'
        },
        attributes: ['id']
      });
      
      for (const admin of superAdmins) {
        if (this.parent.connectedUsers.has(admin.id)) {
          global.io.to(`user_${admin.id}`).emit(event, data);
        }
      }
    } catch (error) {
      console.error('Error emitting to super admins:', error);
    }
  };
}

export default SocketAdminChild;
