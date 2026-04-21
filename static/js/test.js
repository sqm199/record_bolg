(function(win) {
    win.query = function () {
        var movie_name = $('#movie_name').val();
        var url = "/movie?movie_name=" + movie_name;
        location.href = url;
    }

    win.compare = function(yfTrunkAddress, csTrunkAddress){
            layer.msg("对比中.......", {time: 0, icon: 16});
            $.ajax({
                url: '/trunk',
                data: {yfTrunkAddress: yfTrunkAddress, csTrunkAddress: csTrunkAddress},
                type: "post",
                success: function (data) {
                    data_obj = JSON.parse(data)
                    layer.closeAll();
                    if(data_obj.Code == 1){
                        layer.alert(data_obj.Message);
                    }
                    else {
                        b = JSON.stringify(data_obj.GData)
                        layer.alert(data_obj.Message + ":" + b)
                    }

                }
            })
        };
})(window);