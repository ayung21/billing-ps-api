const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('history_promo', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    promoid: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    unitid: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    cabangid: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    discount_percent: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    discount_nominal: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    hours: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    tableName: 'history_promo',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id" },
        ]
      },
    ]
  });
};
