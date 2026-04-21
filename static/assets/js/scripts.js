
jQuery(document).ready(function() {
    $('.page-container form').submit(function(){
        var useraccount = $('#useraccount').val();
        var password = $('#password').val();
        if(useraccount == '' || useraccount == undefined) {
            $(this).find('.error').fadeOut('fast', function(){
                $(this).css('top', '27px');
            });
            $(this).find('.error').fadeIn('fast', function(){
                $(this).parent().find('.useraccount').focus();
            });
            return false;
        }
        if(password == '' || password == undefined) {
            $(this).find('.error').fadeOut('fast', function(){
                $(this).css('top', '96px');
            });
            $(this).find('.error').fadeIn('fast', function(){
                $(this).parent().find('.password').focus();
            });
            return false;
        }
        $.ajax({
            url: '/login_confirm',
            data: {"useraccount": useraccount, "password": password},
            type: "post",
            success: function (data) {
                data_obj = JSON.parse(data)
                if(data_obj.code == 1){
                    window.location.href = "/home";
                }
                else{
                    alert("账号或密码错误");
                }
            }
        })
    });

    $('.page-container form .username, .page-container form .password').keyup(function(){
        $(this).parent().find('.error').fadeOut('fast');
    });
});
