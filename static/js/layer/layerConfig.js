/**
 * Created by qiyuexi on 2017/3/7.
 */
define(function (require) {
  var layer = require('./layer');
  layer.config({
    extend: 'skin/slwy/layer-for-slwy.css',
    skin: 'layer-for-slwy',
    path: RSUrl + '/js/common/layer/' //layer.js所在的目录，可以是绝对目录，也可以是相对目录
  });
  return layer;
});