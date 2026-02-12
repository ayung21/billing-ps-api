const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('history_units', {
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
    name: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    brandtvid: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    cabangid: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    unitid: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    description: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    status: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    desc: {
      type: DataTypes.STRING(15),
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
    tableName: 'history_units',
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
