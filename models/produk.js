const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('produk', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    type: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "1. makanan\n2. minuman"
    },
    stok: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    warning_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    harga_beli: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    harga_jual: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    cabang: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "1. active\n2. non-active"
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
    tableName: 'produk',
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
    ]
  });
};
