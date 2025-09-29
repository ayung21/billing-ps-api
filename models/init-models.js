var DataTypes = require("sequelize").DataTypes;
var _access = require("./access");
var _billingsave = require("./billingsave");
var _brandtv = require("./brandtv");
var _cabang = require("./cabang");
var _codetv = require("./codetv");
var _history_produk = require("./history_produk");
var _history_promo = require("./history_promo");
var _history_units = require("./history_units");
var _member = require("./member");
var _produk = require("./produk");
var _promo = require("./promo");
var _role = require("./role");
var _transaksi = require("./transaksi");
var _transaksi_detail = require("./transaksi_detail");
var _units = require("./units");
var _users = require("./users");

function initModels(sequelize) {
  var access = _access(sequelize, DataTypes);
  var billingsave = _billingsave(sequelize, DataTypes);
  var brandtv = _brandtv(sequelize, DataTypes);
  var cabang = _cabang(sequelize, DataTypes);
  var codetv = _codetv(sequelize, DataTypes);
  var history_produk = _history_produk(sequelize, DataTypes);
  var history_promo = _history_promo(sequelize, DataTypes);
  var history_units = _history_units(sequelize, DataTypes);
  var member = _member(sequelize, DataTypes);
  var produk = _produk(sequelize, DataTypes);
  var promo = _promo(sequelize, DataTypes);
  var role = _role(sequelize, DataTypes);
  var transaksi = _transaksi(sequelize, DataTypes);
  var transaksi_detail = _transaksi_detail(sequelize, DataTypes);
  var units = _units(sequelize, DataTypes);
  var users = _users(sequelize, DataTypes);

  units.belongsTo(brandtv, { as: "brandtv", foreignKey: "brandtvid"});
  brandtv.hasMany(units, { as: "units", foreignKey: "brandtvid"});
  units.belongsTo(cabang, { as: "cabang", foreignKey: "cabangid"});
  cabang.hasMany(units, { as: "units", foreignKey: "cabangid"});

  return {
    access,
    billingsave,
    brandtv,
    cabang,
    codetv,
    history_produk,
    history_promo,
    history_units,
    member,
    produk,
    promo,
    role,
    transaksi,
    transaksi_detail,
    units,
    users,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
