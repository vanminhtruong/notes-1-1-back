/**
 * BaseRepository
 * ------------------------------------------------------------------
 * Lớp trừu tượng hoá truy cập dữ liệu (Data Access Layer) dùng chung.
 *
 * Mọi repository cụ thể kế thừa lớp này và truyền vào Sequelize model
 * tương ứng. Nhờ đó tầng service không còn gọi trực tiếp model mà chỉ
 * làm việc với repository, giúp dễ test, dễ thay đổi nguồn dữ liệu và
 * không làm thay đổi hành vi hiện tại (mọi phương thức đều uỷ quyền
 * nguyên vẹn cho Sequelize model).
 */
class BaseRepository {
  constructor(model) {
    if (!model) {
      throw new Error('BaseRepository cần một Sequelize model');
    }
    this.model = model;
  }

  /** Sequelize instance dùng chung (thay cho Model.sequelize). */
  get sequelize() {
    return this.model.sequelize;
  }

  // ----- Query builders (tương đương Sequelize.fn/col/literal/where) -----
  fn(...args) {
    return this.model.sequelize.fn(...args);
  }

  col(...args) {
    return this.model.sequelize.col(...args);
  }

  literal(...args) {
    return this.model.sequelize.literal(...args);
  }

  where(...args) {
    return this.model.sequelize.where(...args);
  }

  // ----- Đọc dữ liệu -----
  findByPk(...args) {
    return this.model.findByPk(...args);
  }

  findOne(...args) {
    return this.model.findOne(...args);
  }

  findAll(...args) {
    return this.model.findAll(...args);
  }

  findAndCountAll(...args) {
    return this.model.findAndCountAll(...args);
  }

  count(...args) {
    return this.model.count(...args);
  }

  max(...args) {
    return this.model.max(...args);
  }

  min(...args) {
    return this.model.min(...args);
  }

  sum(...args) {
    return this.model.sum(...args);
  }

  aggregate(...args) {
    return this.model.aggregate(...args);
  }

  // ----- Ghi dữ liệu -----
  create(...args) {
    return this.model.create(...args);
  }

  bulkCreate(...args) {
    return this.model.bulkCreate(...args);
  }

  update(...args) {
    return this.model.update(...args);
  }

  destroy(...args) {
    return this.model.destroy(...args);
  }

  increment(...args) {
    return this.model.increment(...args);
  }

  decrement(...args) {
    return this.model.decrement(...args);
  }

  findOrCreate(...args) {
    return this.model.findOrCreate(...args);
  }

  findCreateFind(...args) {
    return this.model.findCreateFind(...args);
  }

  upsert(...args) {
    return this.model.upsert(...args);
  }

  truncate(...args) {
    return this.model.truncate(...args);
  }

  // ----- Truy vấn nâng cao -----
  query(sql, options) {
    return this.model.sequelize.query(sql, options);
  }

  transaction(...args) {
    return this.model.sequelize.transaction(...args);
  }
}

export default BaseRepository;
