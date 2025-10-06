const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('codetv', {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    code: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    desc: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    command: {
      type: DataTypes.STRING(50),
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'codetv',
    timestamps: false
  });
};
