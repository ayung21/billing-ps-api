const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('units', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    brandtvid: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'brandtv',
        key: 'id'
      }
    },
    cabangid: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'cabang',
        key: 'id'
      }
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: "0. non-active\n1. active\n2. maintenance"
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'units',
    timestamps: true,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id" },
        ]
      },
      {
        name: "brandtvid",
        using: "BTREE",
        fields: [
          { name: "brandtvid" },
        ]
      },
      {
        name: "cabangid",
        using: "BTREE",
        fields: [
          { name: "cabangid" },
        ]
      },
    ]
  });
};
