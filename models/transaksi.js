const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('transaksi', {
    code: {
      type: DataTypes.STRING(100),
      allowNull: false,
      primaryKey: true
    },
    customer: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    telepon: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    grandtotal: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "0. selesai\n1. main"
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    created_date: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'transaksi',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "code" },
        ]
      },
    ]
  });
};
