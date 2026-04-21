(function(win) {
    win.login_confirm = function () {
        var account = $('#account').val();
        var password = $('#password').val();
        var url = "/movie?movie_name=" + movie_name;
        location.href = url;
    }

    win.login = function(){
        layer.open({
          type: 2,
          area: ['700px', '450px'],
          fixed: true, //false不固定
          maxmin: false,
          content: '../login_confirm'
});
    }

    win.compare = function(account, password){
            layer.msg("登陆中.......", {time: 0, icon: 16});
            $.ajax({
                url: '/login_confirm',
                data: {account: account, password: password},
                type: "post",
                success: function (data) {
                    data_obj = JSON.parse(data)
                    layer.closeAll();
                    if(data_obj.code == 1){
                        layer.alert(data_obj.msgs);
                    }
                }
            })
        };
})(window);