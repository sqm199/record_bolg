(function(win) {
    win.uploaded_file = function () {
        $.get("/upload_file", function(data){
            layer.open({
  type: 1,
  skin: 'layui-layer-rim', //加上边框
  area: ['500px', '300px'], //宽高
  content: data
});
        })
    }

    win.delete_photo = function(keyid){
            // layer.msg("删除中.......", {time: 0, icon: 16});
            $.ajax({
                url: '/delete_photo',
                data: {KeyID: keyid},
                type: "post",
                success: function (data) {
                    data_obj = JSON.parse(data)
                    layer.closeAll();
                    if(data_obj.Code == 1){
                        layer.msg(data_obj.Message, function(){
                            location.href = "/photo"
                        });
                    }
                    else {
                        layer.alert("删除失败，请重试。。")
                    }
                }
            })
        };

    win.change_remark = function(keyid){
        $("#"+keyid).attr("contentEditable", "true")
        $("#save").show()
    };
    win.save_remark = function(keyid){
        // layer.msg("删除中.......", {time: 0, icon: 16});
        $.ajax({
            url: '/change_save_remark',
            data: {KeyID: keyid,
                   Remark:$("#"+keyid).text()},
            type: "post",
            success: function (data) {
                data_obj = JSON.parse(data)
                layer.closeAll();
                if(data_obj.Code == 1){
                    layer.msg(data_obj.Message, function(){
                        location.href = "/photo"
                    });
                }
                else {
                    layer.alert("删除失败，请重试。。")
                }
            }
        })
    };
})(window);