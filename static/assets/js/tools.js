
jQuery(document).submit(function() {
    $.ajax({
        url: '/tools/clear_data',
        type: "post",
        success: function (data) {
            data_obj = JSON.parse(data)
            console.log(data_obj)
            console.log(data_obj.success)
            if(data_obj.success === true){
                alert("清库成功，准备跑路");
            }
            else{
                alert("清库失败，请重试");
            }
        }
    })
});
